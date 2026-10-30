const FORBIDDEN_KEYS = new Set([
  "data",
  "base64",
  "binary",
  "token",
  "secret",
  "cookie",
  "session",
  "password",
]);

function walk(value, path, issues) {
  if (typeof value === "string" && /^data:/i.test(value.trim())) {
    issues.push(`${path}: встроенные media data URL запрещены.`);
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLocaleLowerCase("en-US"))) {
      issues.push(`${path}.${key}: поле запрещено в публичном manifest.`);
    }
    walk(child, `${path}.${key}`, issues);
  }
}

export function validateLocalAssetManifest(input) {
  const issues = [];
  walk(input, "manifest", issues);
  const assets = Array.isArray(input?.assets) ? input.assets : [];
  assets.forEach((asset, index) => {
    if (!String(asset?.localReference || "").trim()) {
      issues.push(`assets.${index}.localReference: требуется локальная ссылка или имя файла.`);
    }
    if (asset?.rightsConfirmed !== true) {
      issues.push(`assets.${index}.rightsConfirmed: требуется подтверждение прав.`);
    }
  });
  if (issues.length) {
    const error = new Error("Local asset manifest не прошёл проверку.");
    error.issues = issues;
    throw error;
  }
  return {
    schemaVersion: "local-assets/v1",
    assets: assets.map((asset) => ({
      kind: String(asset.kind || "unknown"),
      localReference: String(asset.localReference),
      rightsConfirmed: true,
      note: String(asset.note || ""),
    })),
    transport: "local-only",
    embeddedMedia: false,
  };
}
