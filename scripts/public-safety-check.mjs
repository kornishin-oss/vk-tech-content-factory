import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const forbiddenExtensions = new Set([
  ".docx", ".pptx", ".pdf", ".zip", ".jpg", ".jpeg", ".png", ".webp",
  ".gif", ".mp3", ".wav", ".mp4", ".mov", ".glb", ".gltf", ".fbx", ".obj",
  ".otf", ".ttf", ".woff", ".woff2", ".pem", ".key", ".p12", ".svg", ".ico",
  ".psd", ".ai", ".sketch", ".fig",
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

export function inspectTrackedFile(rel, buffer) {
  const issues = [];
  const parts = rel.split("/");
  if (parts.some((part) => forbiddenPathParts.has(part))) {
    issues.push(`${rel}: tracked path is inside a local/private directory`);
    return issues;
  }
  const extension = extname(rel).toLocaleLowerCase("en-US");
  if (forbiddenExtensions.has(extension)) {
    issues.push(`${rel}: forbidden extension ${extension}`);
    return issues;
  }
  if (buffer.includes(0)) {
    issues.push(`${rel}: binary content is not allowed in the code-only repository`);
    return issues;
  }
  const text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) {
    issues.push(`${rel}: file is not valid UTF-8 text`);
    return issues;
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) issues.push(`${rel}: matched ${pattern}`);
  }
  return issues;
}

export async function inspectTrackedPaths(paths, repositoryRoot = root) {
  const issues = [];
  for (const rel of paths) {
    const pathIssues = inspectTrackedFile(rel, Buffer.alloc(0));
    if (pathIssues.length) {
      issues.push(...pathIssues);
      continue;
    }
    const path = join(repositoryRoot, rel);
    issues.push(...inspectTrackedFile(rel, await readFile(path)));
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
