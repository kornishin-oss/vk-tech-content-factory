# Architecture

## Runtime

- `server.mjs` — dependency-free local HTTP server on `127.0.0.1`;
- `src/core/research-agent.mjs` — normalises ideas and source notes into a research backlog;
- `src/core/planner.mjs` — creates a one-to-five-week plan and records human decisions;
- `src/core/drafts.mjs` — creates five platform drafts from an approved plan item and confirmed evidence;
- `src/core/package.mjs` — builds a local JSON package with a publication-disabled manifest;
- `src/core/local-assets.mjs` — validates asset manifests and blocks embedded media or secrets;
- `public/` — local workbench and browser-only visual composer.

## Evidence boundary

The default research adapter does not browse the web. It turns operator-provided account references, URLs and notes into a backlog. Every candidate records its evidence status. A future web-research provider must preserve URLs, retrieval dates, rights notes and unresolved conflicts.

## Human boundary

Draft generation requires an approved plan item and at least one confirmed evidence item. Manual draft changes remain human-authored. Packaging never means publication approval.

## Provider boundary

External AI, 3D and video providers are future adapters. The default application runs without accounts or paid calls.
