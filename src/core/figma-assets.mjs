import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CLASSIFICATIONS = new Set(["corporate", "product-specific-reference"]);
const ROLES = new Set(["logo", "illustration"]);
const FIGMA_SOURCE_PATTERN = /^https:\/\/www\.figma\.com\/design\/[A-Za-z0-9_-]+\//;
const UNSAFE_SVG_PATTERNS = [
  /<script\b/i,
  /<foreignObject\b/i,
  /\son[a-z]+\s*=/i,
  /(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i,
];

function fail(message) {
  const error = new Error("Локальный реестр Figma не прошёл проверку.");
  error.issues = [message];
  throw error;
}

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
}

function string(value, field) {
  const result = String(value || "").trim();
  if (!result) fail(`${field}: требуется непустое значение.`);
  return result;
}

export function loadLocalFigmaAssets(projectRoot) {
  const figmaRoot = resolve(projectRoot, "local-assets", "figma");
  const manifestPath = resolve(figmaRoot, "manifest.local.json");
  if (!existsSync(manifestPath)) {
    return {
      available: false,
      reason: "manifest_missing",
      transport: "local-only",
      publicationAuthorized: false,
      assets: [],
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail("manifest.local.json: файл не читается как JSON.");
  }
  if (manifest?.schemaVersion !== "figma-assets/v1") {
    fail("schemaVersion: ожидается figma-assets/v1.");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    fail("assets: требуется непустой массив.");
  }

  const ids = new Set();
  const assets = manifest.assets.map((entry, index) => {
    const prefix = `assets.${index}`;
    const id = string(entry?.id, `${prefix}.id`);
    if (!ID_PATTERN.test(id)) fail(`${prefix}.id: допустим только безопасный kebab-case.`);
    if (ids.has(id)) fail(`${prefix}.id: значение ${id} повторяется.`);
    ids.add(id);

    const classification = string(entry?.classification, `${prefix}.classification`);
    if (!CLASSIFICATIONS.has(classification)) fail(`${prefix}.classification: неизвестное значение.`);
    const role = string(entry?.role, `${prefix}.role`);
    if (!ROLES.has(role)) fail(`${prefix}.role: неизвестное значение.`);
    if (classification === "corporate" && role !== "logo") {
      fail(`${prefix}: corporate-ассет должен иметь роль logo.`);
    }
    if (classification === "product-specific-reference" && role !== "illustration") {
      fail(`${prefix}: продуктовый ассет должен иметь роль illustration.`);
    }

    const relativePath = string(entry?.relativePath, `${prefix}.relativePath`);
    const filePath = resolve(figmaRoot, relativePath);
    if (!inside(figmaRoot, filePath)) fail(`${prefix}.relativePath: выход из local-assets/figma запрещён.`);
    if (extname(filePath).toLowerCase() !== ".svg") fail(`${prefix}.relativePath: поддерживается только SVG.`);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) fail(`${prefix}.relativePath: файл не найден.`);

    const bytes = readFileSync(filePath);
    const svg = bytes.toString("utf8");
    if (!/^\s*<svg\b/i.test(svg)) fail(`${prefix}.relativePath: файл не является SVG.`);
    if (UNSAFE_SVG_PATTERNS.some((pattern) => pattern.test(svg))) {
      fail(`${prefix}.relativePath: обнаружена запрещённая активная или внешняя ссылка.`);
    }
    const expectedHash = string(entry?.sha256, `${prefix}.sha256`).toLowerCase();
    if (!SHA256_PATTERN.test(expectedHash)) fail(`${prefix}.sha256: ожидается SHA-256 в hex.`);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedHash) fail(`${prefix}.sha256: контрольная сумма файла не совпадает.`);

    const fileKey = string(entry?.figma?.fileKey, `${prefix}.figma.fileKey`);
    const nodeId = string(entry?.figma?.nodeId, `${prefix}.figma.nodeId`);
    const sourceUrl = string(entry?.figma?.sourceUrl, `${prefix}.figma.sourceUrl`);
    if (!FIGMA_SOURCE_PATTERN.test(sourceUrl) || !sourceUrl.includes(fileKey)) {
      fail(`${prefix}.figma.sourceUrl: требуется ссылка на указанный Figma fileKey.`);
    }

    return {
      id,
      name: string(entry?.name, `${prefix}.name`),
      role,
      classification,
      usageNote: String(entry?.usageNote || ""),
      source: { fileKey, nodeId, url: sourceUrl },
      sha256: actualHash,
      filePath,
      byteLength: bytes.length,
      contextCategories: classification === "product-specific-reference" ? ["tech", "case"] : [],
      requiresProductConfirmation: classification === "product-specific-reference",
    };
  });

  return {
    available: true,
    retrievedAt: String(manifest.retrievedAt || ""),
    transport: "local-only",
    publicationAuthorized: false,
    assets,
  };
}

export function publicFigmaAssetRegistry(registry) {
  return {
    available: registry.available,
    reason: registry.reason,
    retrievedAt: registry.retrievedAt,
    transport: registry.transport,
    publicationAuthorized: false,
    assets: registry.assets.map(({ filePath, ...asset }) => ({
      ...asset,
      url: `/local-assets/figma/${encodeURIComponent(asset.id)}`,
    })),
  };
}

export function productAssetAllowed(asset, category, productContextConfirmed) {
  if (!asset || asset.classification !== "product-specific-reference") return true;
  return asset.contextCategories.includes(String(category)) && productContextConfirmed === true;
}
