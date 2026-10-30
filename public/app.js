const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  backlog: null,
  plan: null,
  draftSet: null,
  policy: null,
  photo: null,
  photoName: "",
  brandTokens: null,
  brandFileName: "",
};

const platformOrder = ["instagram", "vkontakte", "telegram", "max", "linkedin"];

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(value.issues) && value.issues.length
      ? `\n${value.issues.map((issue) => typeof issue === "string" ? issue : issue.message).join("\n")}`
      : "";
    throw new Error(`${value.error || "Ошибка запроса"}${detail}`);
  }
  return value;
}

function showNotice(element, message, error = false) {
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle("error", error);
}

function splitLines(value) {
  return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function parseSources(value, allowedForDrafting) {
  return splitLines(value).map((line) => {
    const [title = "", url = "", ...note] = line.split("|").map((part) => part.trim());
    return {
      title,
      url,
      note: note.join(" | "),
      allowedForDrafting,
    };
  });
}

function parseEvidence(value, confirmed) {
  return splitLines(value).map((line) => {
    const [text = "", ...source] = line.split("|").map((part) => part.trim());
    return { text, source: source.join(" | "), confirmed };
  });
}

async function buildPlan() {
  const result = $("#intake-result");
  try {
    const backlog = await api("/api/research", {
      ideas: splitLines($("#ideas").value),
      sources: parseSources($("#sources").value, $("#source-rights").checked),
    });
    const plan = await api("/api/plan", {
      backlog,
      weeks: Number($("#weeks").value),
      postsPerWeek: Number($("#posts-per-week").value),
    });
    state.backlog = backlog;
    state.plan = plan;
    state.draftSet = null;
    renderPlan();
    renderDrafts();
    showNotice(
      result,
      `Создано ${backlog.items.length} research-кандидатов и ${plan.items.length} слотов плана. Внешний web research не выполнялся.`,
    );
    $("#plan").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showNotice(result, error.message, true);
  }
}

function planStateLabel(status) {
  return {
    draft: "На согласовании",
    approved: "Утверждено",
    changes_requested: "Нужны правки",
    rejected: "Отклонено",
  }[status] || status;
}

function renderPlan() {
  const container = $("#plan-list");
  const badge = $("#plan-status");
  if (!state.plan) {
    container.className = "plan-list empty-state";
    container.textContent = "Сначала добавьте идеи и источники.";
    badge.textContent = "Ещё не сформирован";
    renderApprovedOptions();
    return;
  }
  container.className = "plan-list";
  badge.textContent = `${state.plan.horizonWeeks} нед. · ${state.plan.items.length} публикаций`;
  container.innerHTML = state.plan.items.map((item) => `
    <article class="plan-card" data-plan-item="${item.planItemId}">
      <div class="plan-meta">
        <strong>Неделя ${item.week}</strong>
        ${item.scheduledDate}<br>
        <span class="state-${item.status}">${planStateLabel(item.status)}</span><br>
        v${item.version}
      </div>
      <div class="plan-fields">
        <input class="plan-topic" aria-label="Тема" value="${escapeHtml(item.topic)}">
        <input class="plan-angle" aria-label="Угол подачи" value="${escapeHtml(item.angle)}">
      </div>
      <div class="plan-actions">
        <button class="secondary save-plan-item">Сохранить</button>
        <button class="primary approve-plan-item" ${item.evidenceStatus !== "sources_attached" ? "disabled" : ""}>Утвердить</button>
        <button class="ghost change-plan-item">На доработку</button>
      </div>
    </article>
  `).join("");

  $$(".save-plan-item").forEach((button) => button.addEventListener("click", savePlanItem));
  $$(".approve-plan-item").forEach((button) => button.addEventListener("click", approvePlanItem));
  $$(".change-plan-item").forEach((button) => button.addEventListener("click", requestPlanChanges));
  renderApprovedOptions();
}

async function savePlanItem(event) {
  const card = event.currentTarget.closest("[data-plan-item]");
  try {
    state.plan = await api("/api/plan/revise", {
      plan: state.plan,
      planItemId: card.dataset.planItem,
      patch: {
        topic: card.querySelector(".plan-topic").value,
        angle: card.querySelector(".plan-angle").value,
        actorLabel: "local-editor",
      },
    });
    renderPlan();
  } catch (error) {
    alert(error.message);
  }
}

async function approvePlanItem(event) {
  await decideFromCard(event, "approve");
}

async function requestPlanChanges(event) {
  await decideFromCard(event, "request_changes");
}

async function decideFromCard(event, decision) {
  const card = event.currentTarget.closest("[data-plan-item]");
  try {
    state.plan = await api("/api/plan/decide", {
      plan: state.plan,
      planItemId: card.dataset.planItem,
      decision,
      meta: { actorLabel: "local-reviewer" },
    });
    renderPlan();
  } catch (error) {
    alert(error.message);
  }
}

function renderApprovedOptions() {
  const select = $("#approved-item");
  const approved = state.plan?.items?.filter((item) => item.status === "approved") || [];
  select.innerHTML = approved.length
    ? `<option value="">Выберите тему</option>${approved.map((item) => `<option value="${item.planItemId}">Неделя ${item.week}: ${escapeHtml(item.topic)}</option>`).join("")}`
    : `<option value="">Сначала утвердите тему</option>`;
}

async function loadPolicyFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    state.policy = JSON.parse(await file.text());
    event.target.closest("label").firstChild.textContent = `Policy: ${file.name} `;
  } catch {
    alert("Не удалось прочитать policy JSON.");
    event.target.value = "";
  }
}

async function generateAllDrafts() {
  try {
    const selectedId = $("#approved-item").value;
    const planItem = state.plan?.items?.find((item) => item.planItemId === selectedId);
    state.draftSet = await api("/api/drafts", {
      planItem,
      evidence: parseEvidence($("#evidence").value, $("#evidence-confirmed").checked),
      tags: $("#tags").value.split(","),
      cta: $("#cta").value,
      policy: state.policy,
    });
    renderDrafts();
    $("#drafts").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    alert(error.message);
  }
}

function renderDrafts() {
  const tabs = $("#draft-tabs");
  const editors = $("#draft-editors");
  if (!state.draftSet) {
    tabs.hidden = true;
    tabs.innerHTML = "";
    editors.innerHTML = "";
    return;
  }
  tabs.hidden = false;
  tabs.innerHTML = platformOrder.map((platform, index) => `
    <button class="tab ${index === 0 ? "active" : ""}" data-tab="${platform}">${escapeHtml(state.draftSet.drafts[platform].label)}</button>
  `).join("");
  editors.innerHTML = platformOrder.map((platform, index) => `
    <label class="draft-editor" data-editor="${platform}" ${index === 0 ? "" : "hidden"}>
      ${escapeHtml(state.draftSet.drafts[platform].label)} · редактируемый черновик
      <textarea data-draft="${platform}">${escapeHtml(state.draftSet.drafts[platform].text)}</textarea>
    </label>
  `).join("");
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => selectDraftTab(tab.dataset.tab)));
}

function selectDraftTab(platform) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === platform));
  $$(".draft-editor").forEach((editor) => { editor.hidden = editor.dataset.editor !== platform; });
}

function editedDrafts() {
  return Object.fromEntries(
    platformOrder.map((platform) => [platform, $(`[data-draft="${platform}"]`)?.value || ""]),
  );
}

function validColor(value, fallback) {
  const probe = new Option().style;
  probe.color = "";
  probe.color = String(value || "");
  return probe.color ? String(value) : fallback;
}

async function loadPhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
    alert("Поддерживаются PNG, JPEG и WebP.");
    event.target.value = "";
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (state.photo?.objectUrl) URL.revokeObjectURL(state.photo.objectUrl);
    state.photo = { image, objectUrl };
    state.photoName = file.name;
    $("#asset-note").textContent = `Локальная фотография выбрана: ${file.name}. Содержимое не отправлено на сервер.`;
  };
  image.onerror = () => URL.revokeObjectURL(objectUrl);
  image.src = objectUrl;
}

async function loadBrandFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const value = JSON.parse(await file.text());
    state.brandTokens = {
      background: validColor(value.background, "#10131a"),
      surface: validColor(value.surface, "#ffffff"),
      accent: validColor(value.accent, "#7c5cff"),
      text: validColor(value.text, "#ffffff"),
      geometry: new Set(["orbits", "bars", "none"]).has(value.geometry) ? value.geometry : "orbits",
      overlayOpacity: Math.min(.85, Math.max(0, Number(value.overlayOpacity ?? .42))),
    };
    state.brandFileName = file.name;
    $("#asset-note").textContent = `Локальная brand-конфигурация выбрана: ${file.name}. Содержимое не отправлено на сервер.`;
  } catch {
    alert("Не удалось прочитать brand JSON.");
    event.target.value = "";
  }
}

function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawGeometry(ctx, tokens, width, height) {
  ctx.save();
  ctx.strokeStyle = tokens.accent;
  ctx.fillStyle = tokens.accent;
  ctx.globalAlpha = .72;
  if (tokens.geometry === "bars") {
    ctx.fillRect(width * .78, 0, width * .035, height);
    ctx.fillRect(width * .84, 0, width * .012, height * .72);
  } else if (tokens.geometry === "orbits") {
    ctx.lineWidth = 8;
    for (const [radius, alpha] of [[210, .78], [300, .48], [390, .24]]) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(width * .87, height * .16, radius, 0, Math.PI * 1.72);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
}

async function renderVisual() {
  const title = $("#visual-title").value.trim();
  if (!title) return alert("Добавьте заголовок визуала.");
  if ((state.photo || state.brandTokens) && !$("#asset-rights").checked) {
    return alert("Подтвердите права на локальные материалы.");
  }
  try {
    if (state.photo || state.brandTokens) {
      await api("/api/assets/validate", {
        assets: [
          ...(state.photo ? [{ kind: "photo", localReference: state.photoName, rightsConfirmed: true }] : []),
          ...(state.brandTokens ? [{ kind: "brand_tokens", localReference: state.brandFileName, rightsConfirmed: true }] : []),
        ],
      });
    }
  } catch (error) {
    return alert(error.message);
  }

  const canvas = $("#visual-canvas");
  const ctx = canvas.getContext("2d");
  const tokens = state.brandTokens || {
    background: "#10131a", surface: "#ffffff", accent: "#7c5cff", text: "#ffffff", geometry: "orbits", overlayOpacity: .42,
  };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tokens.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.photo) drawCover(ctx, state.photo.image, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, canvas.height * .2, 0, canvas.height);
  gradient.addColorStop(0, `rgba(0,0,0,${tokens.overlayOpacity * .15})`);
  gradient.addColorStop(.55, `rgba(0,0,0,${tokens.overlayOpacity})`);
  gradient.addColorStop(1, "rgba(0,0,0,.88)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGeometry(ctx, tokens, canvas.width, canvas.height);

  ctx.fillStyle = tokens.accent;
  ctx.fillRect(86, 905, 112, 10);
  ctx.fillStyle = tokens.text;
  ctx.font = "700 72px system-ui, sans-serif";
  ctx.textBaseline = "top";
  wrapText(ctx, title, 86, 950, 900, 86, 4);
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.globalAlpha = .72;
  ctx.fillText("LOCAL CONTENT FACTORY · DRAFT", 88, 1255);
  ctx.globalAlpha = 1;
  $("#download-visual").disabled = false;
}

function downloadVisual() {
  $("#visual-canvas").toBlob((blob) => downloadBlob(blob, "static-post.png"), "image/png");
}

async function downloadPackage() {
  const notice = $("#package-result");
  try {
    if (!state.backlog || !state.plan || !state.draftSet) throw new Error("Сначала завершите банк идей, план и черновики.");
    const value = await api("/api/package", {
      backlog: state.backlog,
      plan: state.plan,
      draftSet: state.draftSet,
      editedDrafts: editedDrafts(),
      authorAttestation: $("#author-attestation").checked,
    });
    downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), "content-package.json");
    showNotice(notice, "Локальный пакет собран. Публикация не выполнялась.");
  } catch (error) {
    showNotice(notice, error.message, true);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function workspaceValue() {
  return {
    savedAt: new Date().toISOString(),
    ideas: $("#ideas").value,
    sources: $("#sources").value,
    weeks: $("#weeks").value,
    postsPerWeek: $("#posts-per-week").value,
    sourceRights: $("#source-rights").checked,
    backlog: state.backlog,
    plan: state.plan,
    draftSet: state.draftSet,
    editedDrafts: state.draftSet ? editedDrafts() : null,
  };
}

function saveWorkspace() {
  localStorage.setItem("content-factory-workspace-v1", JSON.stringify(workspaceValue()));
  showNotice($("#package-result"), "Черновик сохранён в localStorage этого браузера. Он не зашифрован.");
}

function restoreWorkspace() {
  try {
    const raw = localStorage.getItem("content-factory-workspace-v1");
    if (!raw) return;
    const value = JSON.parse(raw);
    $("#ideas").value = value.ideas || "";
    $("#sources").value = value.sources || "";
    $("#weeks").value = value.weeks || "2";
    $("#posts-per-week").value = value.postsPerWeek || "2";
    $("#source-rights").checked = value.sourceRights === true;
    state.backlog = value.backlog || null;
    state.plan = value.plan || null;
    state.draftSet = value.draftSet || null;
    renderPlan();
    renderDrafts();
    if (value.editedDrafts && state.draftSet) {
      for (const platform of platformOrder) {
        const editor = $(`[data-draft="${platform}"]`);
        if (editor) editor.value = value.editedDrafts[platform] || editor.value;
      }
    }
    showNotice($("#intake-result"), `Восстановлен локальный черновик от ${value.savedAt || "неизвестной даты"}.`);
  } catch {
    localStorage.removeItem("content-factory-workspace-v1");
  }
}

function clearWorkspace() {
  localStorage.removeItem("content-factory-workspace-v1");
  location.reload();
}

async function loadExample() {
  const value = await fetch("/synthetic-workspace.json").then((response) => response.json()).catch(() => null);
  if (!value) {
    $("#ideas").value = "Почему результат клиента требует владельца после продажи\nКак отличить rollout от реального использования";
    $("#sources").value = "Synthetic public reference | https://example.com/reference | Demonstration note only";
    $("#source-rights").checked = true;
    return;
  }
}

async function loadSyntheticExample() {
  const response = await fetch("/examples/synthetic-workspace.json");
  if (!response.ok) return loadExample();
  const value = await response.json();
  $("#ideas").value = value.ideas.join("\n");
  $("#sources").value = value.sources.map((source) => `${source.title} | ${source.url} | ${source.note}`).join("\n");
  $("#weeks").value = String(value.weeks);
  $("#posts-per-week").value = String(value.postsPerWeek);
  $("#source-rights").checked = true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function bootstrap() {
  state.policy = await fetch("/config/platform-policy.example.json").then((response) => response.json());
  $("#build-plan").addEventListener("click", buildPlan);
  $("#load-example").addEventListener("click", loadSyntheticExample);
  $("#policy-file").addEventListener("change", loadPolicyFile);
  $("#generate-drafts").addEventListener("click", generateAllDrafts);
  $("#photo-file").addEventListener("change", loadPhoto);
  $("#brand-file").addEventListener("change", loadBrandFile);
  $("#render-visual").addEventListener("click", renderVisual);
  $("#download-visual").addEventListener("click", downloadVisual);
  $("#download-package").addEventListener("click", downloadPackage);
  $("#save-workspace").addEventListener("click", saveWorkspace);
  $("#clear-workspace").addEventListener("click", clearWorkspace);
  renderPlan();
  renderDrafts();
  restoreWorkspace();
}

bootstrap().catch((error) => showNotice($("#intake-result"), error.message, true));
