# Content Factory — local MVP

Public code, local content.

The MVP turns text ideas and source notes into:

`ideas → research backlog → 1–5 week plan → human approval → five platform drafts → local package`

It also includes a browser-only static visual composer. A local photo and a local brand-token JSON file can be selected in the browser; neither file is uploaded to the server or committed to Git.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm start
```

Open <http://127.0.0.1:4173>.

## Verify

```bash
npm test
npm run check:public
```

## Current boundary

- local server bound to `127.0.0.1`;
- deterministic mock workflow, without external AI or paid providers;
- human approval is required before draft generation;
- five platform adapters are configured through a local policy file;
- no publishing, scheduling or account login;
- no 3D or video generation in this stage.

## Public repository boundary

This repository must contain only code, documentation, synthetic fixtures and example configuration. Do not commit:

- real photos, video, audio or voice samples;
- logos, fonts, brandbooks, Figma exports or 3D files;
- customer or internal company materials;
- tokens, cookies, sessions or API keys;
- generated content containing private source data.

Use `local-assets/`, `local-data/` and `config/*.local.json`; these paths are ignored by Git. See [Local assets](docs/LOCAL_ASSETS.md).

## Repository status and licence

The repository is publicly readable, but no open-source licence has been granted yet. Public visibility does not by itself grant reuse rights. A licence can be added later by the repository owner.

## Roadmap

1. Content line and static visuals from local assets.
2. Local 3D profile of the author.
3. 3D video through an authenticated provider on the author's computer.

See [Architecture](docs/ARCHITECTURE.md) and [Roadmap](docs/ROADMAP.md).
