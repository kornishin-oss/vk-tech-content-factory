export const DEFAULT_PLATFORM_ORDER = [
  "instagram",
  "vkontakte",
  "telegram",
  "max",
  "linkedin",
];

export const DEFAULT_POLICY = Object.freeze({
  policyVersion: "built-in-neutral-v1",
  platformOrder: DEFAULT_PLATFORM_ORDER,
  platformLabels: {
    instagram: "Instagram",
    vkontakte: "ВКонтакте",
    telegram: "Telegram",
    max: "MAX",
    linkedin: "LinkedIn",
  },
  tagLimits: {
    instagram: 5,
    vkontakte: 8,
    telegram: 8,
    max: 8,
    linkedin: 5,
  },
  telegram: {
    transitionLabel: "Перейти в связанный канал",
    transitionUrl: "https://example.com/channel",
    bannedTags: [],
  },
  linkedin: {
    inviteText: "Продолжить профессиональный диалог",
    inviteUrl: "https://example.com/professional-channel",
    order: "hashtags_then_invite",
  },
});

function cleanUrl(value, field, issues) {
  try {
    const url = new URL(String(value ?? ""));
    if (!new Set(["https:", "http:"]).has(url.protocol)) throw new Error("unsupported");
    return url.toString();
  } catch {
    issues.push(`${field}: требуется полный http(s) URL.`);
    return "";
  }
}

export function normalizeTag(value) {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

export function uniqueTags(values = []) {
  return [...new Set(values.map(normalizeTag).filter(Boolean))];
}

export function renderTags(values, limit) {
  return uniqueTags(values)
    .slice(0, limit)
    .map((tag) => `#${tag}`)
    .join(" ");
}

export function normalizePolicy(input = DEFAULT_POLICY) {
  const issues = [];
  const order = Array.isArray(input.platformOrder) ? input.platformOrder : [];
  if (
    order.length !== DEFAULT_PLATFORM_ORDER.length ||
    DEFAULT_PLATFORM_ORDER.some((platform, index) => order[index] !== platform)
  ) {
    issues.push("platformOrder: требуется фиксированный порядок пяти площадок.");
  }

  const tagLimits = {};
  for (const platform of DEFAULT_PLATFORM_ORDER) {
    const limit = Number(input.tagLimits?.[platform]);
    if (!Number.isInteger(limit) || limit < 0 || limit > 20) {
      issues.push(`tagLimits.${platform}: требуется целое число от 0 до 20.`);
    }
    tagLimits[platform] = limit;
  }

  const telegramUrl = cleanUrl(input.telegram?.transitionUrl, "telegram.transitionUrl", issues);
  const linkedinUrl = cleanUrl(input.linkedin?.inviteUrl, "linkedin.inviteUrl", issues);
  const linkedinOrder = input.linkedin?.order;
  if (!new Set(["hashtags_then_invite", "invite_then_hashtags"]).has(linkedinOrder)) {
    issues.push("linkedin.order: неизвестный порядок.");
  }

  if (issues.length) {
    const error = new Error("Конфигурация площадок не прошла проверку.");
    error.issues = issues;
    throw error;
  }

  return {
    policyVersion: String(input.policyVersion || "local-unversioned"),
    platformOrder: [...DEFAULT_PLATFORM_ORDER],
    platformLabels: Object.fromEntries(
      DEFAULT_PLATFORM_ORDER.map((platform) => [
        platform,
        String(input.platformLabels?.[platform] || DEFAULT_POLICY.platformLabels[platform]),
      ]),
    ),
    tagLimits,
    telegram: {
      transitionLabel: String(input.telegram?.transitionLabel || "Перейти в связанный канал"),
      transitionUrl: telegramUrl,
      bannedTags: uniqueTags(input.telegram?.bannedTags || []).map((tag) => tag.toLocaleLowerCase("ru-RU")),
    },
    linkedin: {
      inviteText: String(input.linkedin?.inviteText || "Продолжить профессиональный диалог"),
      inviteUrl: linkedinUrl,
      order: linkedinOrder,
    },
  };
}
