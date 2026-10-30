# Content Factory — local MVP

Public code, local content.

The MVP turns text ideas and source notes into:

`ideas → research backlog → 1–5 week plan → human approval → five platform drafts → local package`

It also includes a local static visual composer with content-series and Matte, Glass or Tone-on-Tone modes. A local photo, local brand-profile JSON and local font files can be selected in the browser. Checksum-pinned original SVG exports can be discovered from ignored `local-assets/figma/manifest.local.json`; the corporate logo stays optional, while product-specific VK Cloud illustrations require an eligible series and explicit context confirmation. No media asset is committed to Git.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm start
```

Open <http://127.0.0.1:4173>.

If port `4173` is already occupied, choose another local port:

```bash
PORT=4174 npm start
```

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

## Codex and Claude Code

The same repository can be opened by both tools. Shared constraints live in [AGENTS.md](AGENTS.md); Claude Code starts from [CLAUDE.md](CLAUDE.md). A second model is used as a reviewer or bounded collaborator, not as a substitute for original brand assets or owner approval.
