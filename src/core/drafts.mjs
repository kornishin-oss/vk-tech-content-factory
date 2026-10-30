import {
  DEFAULT_PLATFORM_ORDER,
  normalizePolicy,
  renderTags,
  uniqueTags,
} from "./policy.mjs";

function compact(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function sentence(value) {
  const text = compact(value);
  return text && !/[.!?…]$/.test(text) ? `${text}.` : text;
}

function validateEvidence(items) {
  const evidence = Array.isArray(items) ? items : [];
  const issues = [];
  if (!evidence.length) issues.push("Добавьте хотя бы один подтверждённый тезис.");
  evidence.forEach((item, index) => {
    if (!compact(item?.text)) issues.push(`evidence.${index}.text: пустой тезис.`);
    if (!compact(item?.source)) issues.push(`evidence.${index}.source: отсутствует источник.`);
    if (item?.confirmed !== true) issues.push(`evidence.${index}: тезис не подтверждён человеком.`);
  });
  if (issues.length) {
    const error = new Error("Evidence не прошло проверку.");
    error.issues = issues;
    throw error;
  }
  return evidence.map((item) => ({
    text: compact(item.text),
    source: compact(item.source),
    confirmed: true,
  }));
}

function evidenceBlock(evidence) {
  return evidence.map((item) => `• ${sentence(item.text)}`).join("\n");
}

function sourcesBlock(evidence) {
  return evidence.map((item, index) => `[${index + 1}] ${item.source}`).join("\n");
}

function body(item, evidence, cta) {
  return [
    sentence(item.topic),
    sentence(item.angle),
    "",
    "Опорные тезисы:",
    evidenceBlock(evidence),
    cta ? `\n${sentence(cta)}` : "",
  ].filter((part) => part !== "").join("\n");
}

function instagram(item, evidence, tags, policy, cta) {
  return [
    item.angle,
    "",
    sentence(item.topic),
    "",
    evidenceBlock(evidence),
    cta ? `\n${sentence(cta)}` : "",
    "",
    renderTags(tags, policy.tagLimits.instagram),
  ].filter(Boolean).join("\n");
}

function standard(item, evidence, tags, policy, platform, cta) {
  return [
    item.topic,
    "",
    body(item, evidence, cta),
    "",
    renderTags(tags, policy.tagLimits[platform]),
  ].filter(Boolean).join("\n");
}

function telegram(item, evidence, tags, policy, cta) {
  const banned = new Set(policy.telegram.bannedTags);
  const allowedTags = uniqueTags(tags).filter(
    (tag) => !banned.has(tag.toLocaleLowerCase("ru-RU")),
  );
  return [
    item.topic,
    "",
    body(item, evidence, cta),
    "",
    `[${policy.telegram.transitionLabel}](${policy.telegram.transitionUrl})`,
    renderTags(allowedTags, policy.tagLimits.telegram),
  ].filter(Boolean).join("\n");
}

function linkedin(item, evidence, tags, policy, cta) {
  const core = [item.topic, "", body(item, evidence, cta)].join("\n");
  const hashtags = renderTags(tags, policy.tagLimits.linkedin);
  const invite = `${policy.linkedin.inviteText}: ${policy.linkedin.inviteUrl}`;
  return policy.linkedin.order === "invite_then_hashtags"
    ? [core, "", invite, "", hashtags].filter(Boolean).join("\n")
    : [core, "", hashtags, "", invite].filter(Boolean).join("\n");
}

export function generateDrafts(input, now = new Date()) {
  const item = input?.planItem;
  if (!item || item.status !== "approved" || item.humanDecision?.decision !== "approve") {
    throw new Error("Черновики создаются только из темы, утверждённой человеком.");
  }
  const evidence = validateEvidence(input?.evidence);
  const policy = normalizePolicy(input?.policy);
  const tags = uniqueTags(input?.tags || []);
  const cta = compact(input?.cta);
  const drafts = {
    instagram: instagram(item, evidence, tags, policy, cta),
    vkontakte: standard(item, evidence, tags, policy, "vkontakte", cta),
    telegram: telegram(item, evidence, tags, policy, cta),
    max: standard(item, evidence, tags, policy, "max", cta),
    linkedin: linkedin(item, evidence, tags, policy, cta),
  };

  return {
    schemaVersion: "platform-drafts/v1",
    createdAt: now.toISOString(),
    planItemId: item.planItemId,
    policyVersion: policy.policyVersion,
    platformOrder: [...DEFAULT_PLATFORM_ORDER],
    evidence,
    sources: sourcesBlock(evidence),
    drafts: Object.fromEntries(
      DEFAULT_PLATFORM_ORDER.map((platform) => [platform, {
        platform,
        label: policy.platformLabels[platform],
        text: drafts[platform],
        status: "draft",
      }]),
    ),
    publicationAuthorized: false,
  };
}
