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
      evidenceStatus: candidate.evidenceStatus,
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
  if (!topic || !angle) throw new Error("Тема и угол подачи не могут быть пустыми.");
  item.topic = topic;
  item.angle = angle;
  item.objective = String(patch?.objective ?? item.objective).trim();
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
  if (decision === "approve" && item.evidenceStatus !== "sources_attached") {
    throw new Error("Нельзя утвердить тему без разрешённого источника.");
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
