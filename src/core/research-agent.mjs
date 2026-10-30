function compact(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function slug(value, fallback) {
  return compact(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || fallback;
}

function normalizeSource(source, index, today) {
  const title = compact(source?.title);
  const url = compact(source?.url);
  const note = compact(source?.note);
  const issues = [];
  if (!title) issues.push(`sources.${index}.title: укажите название источника.`);
  if (!note) issues.push(`sources.${index}.note: добавьте краткую заметку, что именно полезно.`);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!new Set(["https:", "http:"]).has(parsed.protocol)) throw new Error("unsupported");
    } catch {
      issues.push(`sources.${index}.url: требуется полный http(s) URL.`);
    }
  }
  return {
    source: {
      sourceId: `src-${index + 1}-${slug(title, "source")}`,
      title,
      url,
      note,
      sourceType: String(source?.sourceType || "public_reference"),
      checkedAt: String(source?.checkedAt || today),
      allowedForDrafting: source?.allowedForDrafting === true,
    },
    issues,
  };
}

export function buildResearchBacklog(input, now = new Date()) {
  const rawIdeas = Array.isArray(input?.ideas) ? input.ideas : [];
  const rawSources = Array.isArray(input?.sources) ? input.sources : [];
  const issues = [];
  const ideas = rawIdeas.map((idea) => compact(typeof idea === "string" ? idea : idea?.text)).filter(Boolean);

  if (!ideas.length) issues.push("ideas: добавьте хотя бы одну текстовую идею.");
  if (ideas.length > 50) issues.push("ideas: максимум 50 идей за один запуск.");

  const today = now.toISOString().slice(0, 10);
  const sourceResults = rawSources.map((source, index) => normalizeSource(source, index, today));
  const sources = sourceResults.map((result) => result.source);
  issues.push(...sourceResults.flatMap((result) => result.issues));
  if (issues.length) {
    const error = new Error("Research backlog не прошёл входную проверку.");
    error.issues = issues;
    throw error;
  }

  const allowedSourceIds = sources
    .filter((source) => source.allowedForDrafting)
    .map((source) => source.sourceId);
  const angles = [
    "Управленческое решение",
    "Практический разбор",
    "Наблюдение и контраст",
    "Ошибка и следующий шаг",
    "Вопрос профессиональному сообществу",
  ];

  return {
    schemaVersion: "research-backlog/v1",
    backlogId: `backlog-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    mode: "manual-seed",
    createdAt: now.toISOString(),
    sources,
    items: ideas.map((text, index) => ({
      backlogItemId: `idea-${index + 1}-${slug(text, "topic")}`,
      topic: text,
      suggestedAngle: angles[index % angles.length],
      researchQuestion: `Какие проверяемые примеры и факты подтверждают тему «${text}»?`,
      whyNow: "Гипотеза владельца; актуальность требует человеческой проверки.",
      sourceIds: [...allowedSourceIds],
      evidenceStatus: allowedSourceIds.length ? "sources_attached" : "needs_sources",
      status: "open",
    })),
    agentReceipt: {
      agent: "research-agent",
      adapter: "manual-seed",
      externalBrowsingPerformed: false,
      note: "MVP структурирует переданные источники и не заявляет самостоятельный web research.",
    },
  };
}
