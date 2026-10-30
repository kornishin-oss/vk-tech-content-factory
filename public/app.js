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
  headlineFont: "Inter",
  bodyFont: "Inter",
  fontFiles: [],
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

function evidenceStateLabel(status) {
  return {
    fact_checked: "Фактура проверена",
    needs_human_check: "Нужно проверить фактуру",
    needs_sources: "Фактуры или источника нет",
  }[status] || "Статус фактуры неизвестен";
}

function weekWord(value) {
  if (value === 1) return "неделю";
  if (value >= 2 && value <= 4) return "недели";
  return "недель";
}

function publicationWord(value) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "публикаций";
  const last = value % 10;
  if (last === 1) return "публикация";
  if (last >= 2 && last <= 4) return "публикации";
  return "публикаций";
}

function sourceList(item) {
  const sources = item.evidence?.sources || [];
  if (!sources.length) return '<p class="evidence-missing">Источник не прикреплён. Утверждение невозможно.</p>';
  return `<ul class="source-list">${sources.map((source) => `
    <li>
      ${source.url
        ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>`
        : `<strong>${escapeHtml(source.title)}</strong>`}
      <span>передано ${escapeHtml(source.checkedAt || "без даты")}</span>
    </li>
  `).join("")}</ul>`;
}

function planCard(item) {
  const evidence = item.evidence || {};
  return `
    <article class="plan-card" data-plan-item="${item.planItemId}">
      <div class="plan-meta">
        <strong>${item.scheduledDate}</strong>
        <span class="state-${item.status}">${planStateLabel(item.status)}</span><br>
        v${item.version}
      </div>
      <div class="plan-content">
        <div class="plan-fields">
          <label><span>Тема</span><input class="plan-topic" value="${escapeHtml(item.topic)}"></label>
          <label><span>Управленческий вектор</span><input class="plan-angle" value="${escapeHtml(item.angle)}"></label>
          <label><span>Цель публикации</span><input class="plan-objective" value="${escapeHtml(item.objective)}"></label>
        </div>
        <div class="decision-basis">
          <div class="evidence-heading">
            <strong>На основании чего утверждаем</strong>
            <span class="evidence-state evidence-${item.evidenceStatus}">${evidenceStateLabel(item.evidenceStatus)}</span>
          </div>
          <label>
            <span>Фактура из переданных материалов — проверьте и уточните</span>
            <textarea class="plan-fact" rows="3" placeholder="Конкретный факт, наблюдение, цифра или подтверждённый пример">${escapeHtml(evidence.factSummary || "")}</textarea>
          </label>
          <div class="evidence-context">
            <p><strong>Почему сейчас:</strong> ${escapeHtml(evidence.whyNow || "Не определено")}</p>
            <p><strong>Что ещё проверить:</strong> ${escapeHtml(evidence.researchQuestion || "Не определено")}</p>
          </div>
          <div>
            <span class="field-caption">Источники-кандидаты</span>
            ${sourceList(item)}
          </div>
          <label class="check evidence-check">
            <input class="plan-evidence-confirmed" type="checkbox" ${evidence.confirmedByHuman ? "checked" : ""}>
            Я проверил фактуру и подтверждаю, что она относится к этой теме
          </label>
          <p class="evidence-save-hint">После изменения темы, вектора, цели или фактуры сначала сохраните карточку, затем подтвердите фактуру заново.</p>
        </div>
      </div>
      <div class="plan-actions">
        <button class="secondary save-plan-item">Сохранить</button>
        <button class="primary approve-plan-item" ${item.evidenceStatus !== "fact_checked" ? "disabled" : ""}>Утвердить</button>
        <button class="ghost change-plan-item">На доработку</button>
      </div>
    </article>
  `;
}

function renderPlan() {
  const container = $("#plan-list");
  const badge = $("#plan-status");
  const title = $("#plan-title");
  if (!state.plan) {
    container.className = "plan-list empty-state";
    container.textContent = "Сначала добавьте идеи и источники.";
    badge.textContent = "Ещё не сформирован";
    title.textContent = "План — выберите горизонт";
    renderApprovedOptions();
    return;
  }
  container.className = "plan-list";
  title.textContent = `План на ${state.plan.horizonWeeks} ${weekWord(state.plan.horizonWeeks)}`;
  badge.textContent = `${state.plan.horizonWeeks} нед. · ${state.plan.items.length} ${publicationWord(state.plan.items.length)}`;
  const weeks = [...new Set(state.plan.items.map((item) => item.week))];
  container.innerHTML = weeks.map((week) => {
    const items = state.plan.items.filter((item) => item.week === week);
    const dates = items.map((item) => item.scheduledDate);
    return `
      <section class="week-group" aria-labelledby="week-${week}-title">
        <div class="week-heading">
          <h3 id="week-${week}-title">Неделя ${week}</h3>
          <span>${dates[0]} — ${dates.at(-1)} · ${items.length} ${publicationWord(items.length)}</span>
        </div>
        <div class="week-items">${items.map(planCard).join("")}</div>
      </section>
    `;
  }).join("");

  $$(".save-plan-item").forEach((button) => button.addEventListener("click", savePlanItem));
  $$(".approve-plan-item").forEach((button) => button.addEventListener("click", approvePlanItem));
  $$(".change-plan-item").forEach((button) => button.addEventListener("click", requestPlanChanges));
  $$(".plan-topic, .plan-angle, .plan-objective, .plan-fact").forEach((input) => input.addEventListener("input", markCardDirty));
  $$(".plan-evidence-confirmed").forEach((input) => input.addEventListener("input", refreshApprovalButton));
  renderApprovedOptions();
}

function cardPatch(card) {
  return {
    topic: card.querySelector(".plan-topic").value,
    angle: card.querySelector(".plan-angle").value,
    objective: card.querySelector(".plan-objective").value,
    factSummary: card.querySelector(".plan-fact").value,
    evidenceConfirmed: card.querySelector(".plan-evidence-confirmed").checked,
    actorLabel: "local-editor",
  };
}

function refreshApprovalButton(event) {
  const card = event.currentTarget.closest("[data-plan-item]");
  const item = state.plan.items.find((candidate) => candidate.planItemId === card.dataset.planItem);
  const ready = card.dataset.dirty !== "true"
    && card.querySelector(".plan-evidence-confirmed").checked
    && card.querySelector(".plan-fact").value.trim().length > 0
    && (item?.evidence?.sources?.length || 0) > 0;
  card.querySelector(".approve-plan-item").disabled = !ready;
}

function markCardDirty(event) {
  const card = event.currentTarget.closest("[data-plan-item]");
  card.dataset.dirty = "true";
  card.querySelector(".plan-evidence-confirmed").checked = false;
  card.querySelector(".approve-plan-item").disabled = true;
  card.querySelector(".evidence-state").textContent = "Сохраните изменения";
  card.querySelector(".evidence-state").className = "evidence-state evidence-needs_human_check";
}

async function savePlanItem(event) {
  const card = event.currentTarget.closest("[data-plan-item]");
  try {
    state.plan = await api("/api/plan/revise", {
      plan: state.plan,
      planItemId: card.dataset.planItem,
      patch: cardPatch(card),
    });
    renderPlan();
  } catch (error) {
    alert(error.message);
  }
}

async function approvePlanItem(event) {
  const card = event.currentTarget.closest("[data-plan-item]");
  try {
    state.plan = await api("/api/plan/revise", {
      plan: state.plan,
      planItemId: card.dataset.planItem,
      patch: cardPatch(card),
    });
    state.plan = await api("/api/plan/decide", {
      plan: state.plan,
      planItemId: card.dataset.planItem,
      decision: "approve",
      meta: { actorLabel: "local-reviewer" },
    });
    renderPlan();
  } catch (error) {
    alert(error.message);
  }
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

const FALLBACK_BRAND_PROFILE = {
  profileStatus: "technical-fallback-unverified",
  sourceLabel: "Технический fallback — не официальный экспорт VK Tech",
  author: "EXPERT CONTENT",
  palette: {
    black: "#101820",
    mint: "#7CEDF8",
    blue: "#0077FF",
    sophite: "#E7EBEF",
    white: "#FFFFFF",
    muted: "#647080",
  },
  categoryDefaults: {
    cs: "matte-mint",
    leadership: "matte-black",
    tech: "blue-glass",
    personal: "sophite-tone",
    case: "photo-matte",
  },
  series: {
    cs: "CS INSIGHT",
    leadership: "LEADERSHIP",
    tech: "SAAS / TECH",
    personal: "MY VIEW",
    case: "CLIENT CASE",
  },
  modes: {
    "matte-mint": { background: "mint", text: "black", accent: "black", object: "matte" },
    "matte-black": { background: "black", text: "white", accent: "mint", object: "matte" },
    "blue-glass": { background: "blue", text: "white", accent: "mint", object: "glass" },
    "sophite-tone": { background: "sophite", text: "black", accent: "blue", object: "tone" },
    "photo-matte": { background: "black", text: "white", accent: "mint", object: "photo" },
  },
};

function normalizeBrandProfile(value) {
  const input = value && typeof value === "object" ? value : {};
  const rawPalette = input.palette || input;
  const palette = Object.fromEntries(Object.entries(FALLBACK_BRAND_PROFILE.palette).map(([key, fallback]) => [
    key,
    validColor(rawPalette[key], fallback),
  ]));
  if (input.background) palette.black = validColor(input.background, palette.black);
  if (input.accent) palette.blue = validColor(input.accent, palette.blue);
  if (input.text) palette.white = validColor(input.text, palette.white);
  return {
    ...FALLBACK_BRAND_PROFILE,
    ...input,
    palette,
    categoryDefaults: { ...FALLBACK_BRAND_PROFILE.categoryDefaults, ...(input.categoryDefaults || {}) },
    series: { ...FALLBACK_BRAND_PROFILE.series, ...(input.series || {}) },
    modes: { ...FALLBACK_BRAND_PROFILE.modes, ...(input.modes || {}) },
  };
}

function applyBrandProfile(value, fileName) {
  state.brandTokens = normalizeBrandProfile(value);
  state.brandFileName = fileName;
  const category = $("#visual-category").value;
  $("#visual-mode").value = state.brandTokens.categoryDefaults[category] || "matte-mint";
  $("#brand-status").textContent = state.brandTokens.profileStatus === "official-export"
    ? "Заявлен официальный профиль · приложением не проверено"
    : "Рабочий локальный профиль · требует сверки";
  $("#asset-note").textContent = `${state.brandTokens.sourceLabel || fileName}. Профиль загружен локально; логотип и файлы шрифтов не встроены.`;
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
    applyBrandProfile(value, file.name);
  } catch {
    alert("Не удалось прочитать brand JSON.");
    event.target.value = "";
  }
}

async function loadLocalBrandProfile() {
  const response = await fetch("/config/brand-profile.local.json");
  if (!response.ok) {
    applyBrandProfile(FALLBACK_BRAND_PROFILE, "technical-fallback");
    return;
  }
  applyBrandProfile(await response.json(), "brand-profile.local.json");
}

async function loadFontFile(event, role) {
  const file = event.target.files?.[0];
  if (!file) return;
  const family = role === "headline" ? "LocalBrandHeadline" : "LocalBrandText";
  try {
    const face = new FontFace(family, await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    if (role === "headline") state.headlineFont = family;
    else state.bodyFont = family;
    state.fontFiles = [...state.fontFiles.filter((item) => item.role !== role), { role, name: file.name }];
    $("#asset-note").textContent = `${file.name} загружен только в память браузера для роли «${role === "headline" ? "заголовок" : "текст"}».`;
  } catch {
    alert("Не удалось загрузить локальный шрифт.");
    event.target.value = "";
  }
}

function profileColor(profile, value, fallback) {
  return validColor(profile.palette[value] || value, fallback);
}

function visualMode(profile) {
  const selected = $("#visual-mode").value;
  const mode = profile.modes[selected] || profile.modes[profile.categoryDefaults[$("#visual-category").value]];
  return {
    name: selected,
    background: profileColor(profile, mode.background, profile.palette.black),
    text: profileColor(profile, mode.text, profile.palette.white),
    accent: profileColor(profile, mode.accent, profile.palette.mint),
    object: mode.object || "matte",
  };
}

function drawCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawDominantObject(ctx, mode, width, height) {
  ctx.save();
  const x = width * .78;
  const y = height * .49;
  if (mode.object === "glass") {
    const glow = ctx.createRadialGradient(x, y, 20, x, y, 430);
    glow.addColorStop(0, mode.accent);
    glow.addColorStop(.45, "rgba(255,255,255,.18)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 430, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = .58;
    ctx.strokeStyle = "rgba(255,255,255,.72)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(x, y, 300, 430, -.45, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.globalAlpha = mode.object === "tone" ? .16 : .9;
    ctx.fillStyle = mode.accent;
    ctx.beginPath();
    ctx.roundRect(width * .62, height * .13, width * .48, height * .75, 240);
    ctx.fill();
    ctx.globalAlpha *= .45;
    ctx.fillStyle = mode.text;
    ctx.beginPath();
    ctx.arc(width * .87, height * .72, 250, 0, Math.PI * 2);
    ctx.fill();
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
          ...state.fontFiles.map((font) => ({ kind: "font", localReference: font.name, rightsConfirmed: true, note: font.role })),
        ],
      });
    }
  } catch (error) {
    return alert(error.message);
  }

  const canvas = $("#visual-canvas");
  const ctx = canvas.getContext("2d");
  const profile = state.brandTokens || normalizeBrandProfile(FALLBACK_BRAND_PROFILE);
  const mode = visualMode(profile);
  const category = $("#visual-category").value;
  const series = profile.series[category] || "EXPERT CONTENT";
  const subtitle = $("#visual-subtitle").value.trim();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = mode.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.photo) {
    drawCover(ctx, state.photo.image, canvas.width * .52, 0, canvas.width * .48, canvas.height);
    const fade = ctx.createLinearGradient(canvas.width * .46, 0, canvas.width * .72, 0);
    fade.addColorStop(0, mode.background);
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(canvas.width * .42, 0, canvas.width * .36, canvas.height);
  } else {
    drawDominantObject(ctx, mode, canvas.width, canvas.height);
  }

  ctx.fillStyle = mode.text;
  ctx.font = `700 28px ${state.bodyFont}, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.globalAlpha = .78;
  ctx.fillText(series, 84, 74);
  ctx.globalAlpha = 1;
  ctx.font = `700 78px ${state.headlineFont}, system-ui, sans-serif`;
  wrapText(ctx, title, 84, 250, state.photo ? 560 : 650, 84, 6);
  if (subtitle) {
    ctx.font = `500 30px ${state.bodyFont}, system-ui, sans-serif`;
    ctx.globalAlpha = .8;
    wrapText(ctx, subtitle, 86, 940, state.photo ? 520 : 620, 42, 3);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = mode.accent;
  ctx.beginPath();
  ctx.arc(94, 1215, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mode.text;
  ctx.font = `600 24px ${state.bodyFont}, system-ui, sans-serif`;
  ctx.globalAlpha = .72;
  ctx.fillText(profile.author || "EXPERT CONTENT", 122, 1198);
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
  await loadLocalBrandProfile();
  $("#build-plan").addEventListener("click", buildPlan);
  $("#load-example").addEventListener("click", loadSyntheticExample);
  $("#policy-file").addEventListener("change", loadPolicyFile);
  $("#generate-drafts").addEventListener("click", generateAllDrafts);
  $("#photo-file").addEventListener("change", loadPhoto);
  $("#brand-file").addEventListener("change", loadBrandFile);
  $("#headline-font-file").addEventListener("change", (event) => loadFontFile(event, "headline"));
  $("#body-font-file").addEventListener("change", (event) => loadFontFile(event, "body"));
  $("#visual-category").addEventListener("change", () => {
    $("#visual-mode").value = state.brandTokens?.categoryDefaults?.[$("#visual-category").value] || "matte-mint";
  });
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
