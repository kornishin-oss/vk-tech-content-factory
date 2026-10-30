import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDrafts } from "./src/core/drafts.mjs";
import { validateLocalAssetManifest } from "./src/core/local-assets.mjs";
import { buildLocalPackage } from "./src/core/package.mjs";
import { createContentPlan, decidePlanItem, revisePlanItem } from "./src/core/planner.mjs";
import { buildResearchBacklog } from "./src/core/research-agent.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function sendJson(response, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Запрос превышает локальный лимит 2 МБ.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function staticPath(pathname) {
  const publicExamples = new Map([
    ["/config/platform-policy.example.json", join(root, "config", "platform-policy.example.json")],
    ["/config/brand-tokens.example.json", join(root, "config", "brand-tokens.example.json")],
    ["/examples/synthetic-workspace.json", join(root, "examples", "synthetic-workspace.json")],
  ]);
  if (publicExamples.has(pathname)) return publicExamples.get(pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = normalize(join(publicRoot, requested));
  return candidate.startsWith(publicRoot) ? candidate : null;
}

function problem(error) {
  return {
    error: error instanceof Error ? error.message : String(error),
    issues: Array.isArray(error?.issues) ? error.issues : [],
  };
}

export const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        service: "content-factory",
        mode: "local-mock",
        bind: "127.0.0.1",
        publicationAuthorized: false,
        stages: { content: "enabled", threeD: "disabled", video: "disabled" },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/research") {
      return sendJson(response, 200, buildResearchBacklog(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/plan") {
      return sendJson(response, 200, createContentPlan(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/plan/revise") {
      const input = await readJson(request);
      return sendJson(response, 200, revisePlanItem(input.plan, input.planItemId, input.patch));
    }

    if (request.method === "POST" && url.pathname === "/api/plan/decide") {
      const input = await readJson(request);
      return sendJson(
        response,
        200,
        decidePlanItem(input.plan, input.planItemId, input.decision, input.meta),
      );
    }

    if (request.method === "POST" && url.pathname === "/api/drafts") {
      return sendJson(response, 200, generateDrafts(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/assets/validate") {
      return sendJson(response, 200, validateLocalAssetManifest(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/package") {
      const packageValue = buildLocalPackage(await readJson(request));
      return sendJson(response, 200, packageValue, {
        "content-disposition": "attachment; filename=content-package.json",
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Метод не поддерживается." });
    }

    const file = staticPath(url.pathname);
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      return sendJson(response, 404, { error: "Не найдено." });
    }
    const stat = statSync(file);
    response.writeHead(200, {
      "content-type": contentTypes[extname(file)] || "application/octet-stream",
      "content-length": stat.size,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (request.method === "HEAD") return response.end();
    return createReadStream(file).pipe(response);
  } catch (error) {
    return sendJson(response, Array.isArray(error?.issues) ? 422 : 400, problem(error));
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Content Factory: http://127.0.0.1:${port}`);
  });
}
