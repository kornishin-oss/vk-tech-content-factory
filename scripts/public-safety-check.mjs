import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const forbiddenExtensions = new Set([
  ".docx", ".pptx", ".pdf", ".zip", ".jpg", ".jpeg", ".png", ".webp",
  ".gif", ".mp3", ".wav", ".mp4", ".mov", ".glb", ".gltf", ".fbx", ".obj",
  ".otf", ".ttf", ".woff", ".woff2", ".pem", ".key", ".p12",
]);
const forbiddenPathParts = new Set([
  "local-assets", "local-data", "private", "exports", "generated", "node_modules", ".git",
]);
const forbiddenPatterns = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["']/i,
  /https:\/\/t\.me\/\+[A-Za-z0-9_-]{8,}/,
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (forbiddenPathParts.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

const issues = [];
for (const path of await files(root)) {
  const rel = relative(root, path);
  const extension = extname(path).toLocaleLowerCase("en-US");
  if (forbiddenExtensions.has(extension)) issues.push(`${rel}: forbidden extension ${extension}`);
  if ([".json", ".js", ".mjs", ".md", ".html", ".css", ".yml", ".yaml", ""].includes(extension)) {
    const text = await readFile(path, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) issues.push(`${rel}: matched ${pattern}`);
    }
  }
}

if (issues.length) {
  console.error("Public repository safety check failed:\n" + issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Public repository safety check: PASS");
}
