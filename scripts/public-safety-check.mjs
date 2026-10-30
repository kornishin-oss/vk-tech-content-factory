import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
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

export function trackedPathsFromGit(repositoryRoot = root) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).split("\0").filter(Boolean);
}

export async function inspectTrackedPaths(paths, repositoryRoot = root) {
  const issues = [];
  for (const rel of paths) {
    const parts = rel.split("/");
    if (parts.some((part) => forbiddenPathParts.has(part))) {
      issues.push(`${rel}: tracked path is inside a local/private directory`);
      continue;
    }
    const path = join(repositoryRoot, rel);
    const extension = extname(path).toLocaleLowerCase("en-US");
    if (forbiddenExtensions.has(extension)) issues.push(`${rel}: forbidden extension ${extension}`);
    if ([".json", ".js", ".mjs", ".md", ".html", ".css", ".yml", ".yaml", ""].includes(extension)) {
      const text = await readFile(path, "utf8");
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(text)) issues.push(`${rel}: matched ${pattern}`);
      }
    }
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const issues = await inspectTrackedPaths(trackedPathsFromGit(root), root);
  if (issues.length) {
    console.error("Public repository safety check failed:\n" + issues.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Public repository safety check: PASS");
  }
}
