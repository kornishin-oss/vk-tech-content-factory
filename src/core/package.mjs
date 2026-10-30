import { DEFAULT_PLATFORM_ORDER } from "./policy.mjs";

export function buildLocalPackage(input, now = new Date()) {
  const plan = input?.plan;
  const draftSet = input?.draftSet;
  const editedDrafts = input?.editedDrafts;
  const issues = [];
  if (!plan?.items?.some((item) => item.planItemId === draftSet?.planItemId && item.status === "approved")) {
    issues.push("У пакета нет утверждённой темы плана.");
  }
  if (draftSet?.publicationAuthorized !== false) {
    issues.push("Пакет не создаётся при разрешённой публикации.");
  }
  for (const platform of DEFAULT_PLATFORM_ORDER) {
    if (!String(editedDrafts?.[platform] ?? "").trim()) {
      issues.push(`Отсутствует текст для ${platform}.`);
    }
  }
  if (input?.authorAttestation !== true) {
    issues.push("Требуется подтверждение автора после ручных правок.");
  }
  if (issues.length) {
    const error = new Error("Локальный пакет не прошёл проверку.");
    error.issues = issues;
    throw error;
  }
  return {
    manifest: {
      schemaVersion: "content-package/v1",
      createdAt: now.toISOString(),
      publicationAuthorized: false,
      runtime: "local-mvp",
      includesMedia: false,
      warning: "Пакет подготовлен для ручной проверки и не опубликован.",
    },
    research: input.backlog,
    plan,
    sources: draftSet.evidence,
    posts: Object.fromEntries(
      DEFAULT_PLATFORM_ORDER.map((platform) => [platform, editedDrafts[platform]]),
    ),
    qa: {
      planApproved: true,
      evidenceConfirmed: draftSet.evidence.every((item) => item.confirmed === true),
      authorAttestation: true,
      independentReview: "not_performed_on_content",
      publicationAuthorized: false,
    },
  };
}
