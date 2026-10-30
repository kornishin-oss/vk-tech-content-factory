function boundedInteger(value, field, min, max, issues) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    issues.push(`${field}: требуется целое число от ${min} до ${max}.`);
  }
  return parsed;
}

function isoDate(value) {
  const date = value ? new Date(`${value}T00:00:00Z`) : new Date();
  if (Number.isNaN(date.valueOf())) throw new Error("Некорректная дата начала плана.");
  return date;
}

function plusDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function evidenceFor(backlog, candidate) {
  const sourceIds = new Set(candidate.sourceIds || []);
  const sources = (backlog.sources || [])
    .filter((source) => sourceIds.has(source.sourceId))
    .map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      url: source.url,
      note: source.note,
      checkedAt: source.checkedAt,
    }));
  return {
    factSummary: sources.map((source) => source.note).filter(Boolean).join("\n"),
    sources,
    whyNow: candidate.whyNow,
    researchQuestion: candidate.researchQuestion,
    confirmedByHuman: false,
    confirmedFingerprint: null,
  };
}

function confirmationFingerprint(item, evidence) {
  return JSON.stringify({
    topic: String(item.topic || "").trim(),
    angle: String(item.angle || "").trim(),
    objective: String(item.objective || "").trim(),
    factSummary: String(evidence?.factSummary || "").trim(),
    sources: (evidence?.sources || []).map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      url: source.url,
      note: source.note,
    })),
  });
}

function evidenceStatus(evidence) {
  if (!evidence?.sources?.length || !String(evidence.factSummary || "").trim()) return "needs_sources";
  return evidence.confirmedByHuman === true ? "fact_checked" : "needs_human_check";
}

export function createContentPlan(input, now = new Date()) {
  const backlog = input?.backlog;
  const issues = [];
  if (!Array.isArray(backlog?.items) || !backlog.items.length) {
    issues.push("backlog: сначала сформируйте банк идей.");
  }
  const weeks = boundedInteger(input?.weeks, "weeks", 1, 5, issues);
  const postsPerWeek = boundedInteger(input?.postsPerWeek, "postsPerWeek", 1, 5, issues);
  if (issues.length) {
    const error = new Error("Контент-план не прошёл входную проверку.");
    error.issues = issues;
    throw error;
  }

  const start = isoDate(input?.startDate || now.toISOString().slice(0, 10));
  const total = weeks * postsPerWeek;
  const items = Array.from({ length: total }, (_, index) => {
    const candidate = backlog.items[index % backlog.items.length];
    const evidence = evidenceFor(backlog, candidate);
    const week = Math.floor(index / postsPerWeek) + 1;
    const slot = index % postsPerWeek;
    const dayOffset = (week - 1) * 7 + Math.round((slot * 5) / Math.max(1, postsPerWeek - 1));
    return {
      planItemId: `week-${week}-slot-${slot + 1}`,
      week,
      scheduledDate: plusDays(start, dayOffset),
      topic: candidate.topic,
      angle: candidate.suggestedAngle,
      objective: "Сформулировать одну законченную профессиональную мысль.",
      sourceIds: [...candidate.sourceIds],
      evidence,
      evidenceStatus: evidenceStatus(evidence),
      status: "draft",
      version: 1,
      humanDecision: null,
    };
  });

  return {
    schemaVersion: "content-plan/v1",
    planId: `plan-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    backlogId: backlog.backlogId,
    createdAt: now.toISOString(),
    horizonWeeks: weeks,
    postsPerWeek,
    status: "plan_review",
    items,
  };
}

export function revisePlanItem(plan, planItemId, patch, now = new Date()) {
  const item = plan?.items?.find((candidate) => candidate.planItemId === planItemId);
  if (!item) throw new Error("Элемент плана не найден.");
  const topic = String(patch?.topic ?? item.topic).trim();
  const angle = String(patch?.angle ?? item.angle).trim();
  const objective = String(patch?.objective ?? item.objective).trim();
  if (!topic || !angle) throw new Error("Тема и угол подачи не могут быть пустыми.");
  const evidence = item.evidence || {
    factSummary: "",
    sources: [],
    whyNow: "",
    researchQuestion: "",
    confirmedByHuman: false,
    confirmedFingerprint: null,
  };
  const factSummary = String(patch?.factSummary ?? evidence.factSummary).trim();
  const contentChanged = topic !== item.topic
    || angle !== item.angle
    || objective !== item.objective
    || factSummary !== evidence.factSummary;
  item.topic = topic;
  item.angle = angle;
  item.objective = objective;
  evidence.factSummary = factSummary;
  if (contentChanged) {
    evidence.confirmedByHuman = false;
    evidence.confirmedFingerprint = null;
  } else if (patch?.evidenceConfirmed === true) {
    evidence.confirmedByHuman = true;
    evidence.confirmedFingerprint = confirmationFingerprint(item, evidence);
  } else {
    evidence.confirmedByHuman = false;
    evidence.confirmedFingerprint = null;
  }
  item.evidence = evidence;
  item.evidenceStatus = evidenceStatus(evidence);
  item.version += 1;
  item.status = "draft";
  item.humanDecision = {
    decision: "edited",
    actorLabel: String(patch?.actorLabel || "human-editor"),
    note: String(patch?.note || ""),
    decidedAt: now.toISOString(),
  };
  return plan;
}

export function decidePlanItem(plan, planItemId, decision, input = {}, now = new Date()) {
  const item = plan?.items?.find((candidate) => candidate.planItemId === planItemId);
  if (!item) throw new Error("Элемент плана не найден.");
  const statuses = {
    approve: "approved",
    request_changes: "changes_requested",
    reject: "rejected",
    reopen: "draft",
  };
  if (!statuses[decision]) throw new Error("Неизвестное решение по плану.");
  const currentFingerprint = confirmationFingerprint(item, item.evidence);
  if (decision === "approve" && (
    item.evidenceStatus !== "fact_checked"
    || item.evidence?.confirmedFingerprint !== currentFingerprint
  )) {
    throw new Error("Нельзя утвердить тему без фактуры, источника и подтверждения человека.");
  }
  item.status = statuses[decision];
  item.version += 1;
  item.humanDecision = {
    decision,
    actorLabel: String(input.actorLabel || "human-reviewer"),
    note: String(input.note || ""),
    decidedAt: now.toISOString(),
  };
  plan.status = plan.items.every((candidate) => candidate.status === "approved")
    ? "plan_approved"
    : "plan_review";
  return plan;
}
