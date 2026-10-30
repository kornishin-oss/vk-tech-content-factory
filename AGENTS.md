# Shared agent contract

This public repository contains code and synthetic fixtures only. Codex, Claude Code and other local agents must follow the same boundaries.

## Source priority

1. The user's current instruction.
2. Locally supplied `VK_TECH_BRAND_PROFILE.md`.
3. Locally supplied `VK_TECH_REFERENCE_GUIDE.md`.
4. Original local logos, fonts and approved images.
5. A working local profile such as `config/brand-profile.local.json`, explicitly labelled unverified.

Never treat a filename, a text manifest, a Figma link or a generated approximation as an original asset. Do not call deck-derived colours official.

## Product rules

- Keep the content line first: ideas, research questions, factual basis, plan, approval, platform drafts and a local package.
- Render the exact selected horizon and group slots by week.
- A source link is not factual confirmation. Approval must require a current human confirmation tied to the exact topic, angle, objective, fact and sources.
- Preserve one dominant message, readable typography, whitespace and a disciplined grid.
- Do not add a logo, 3D object or author photo automatically.
- Treat 3D profile, 3D video and Presentation Studio as later tracks.

## Public repository boundary

Do not commit real photos, video, audio, voice samples, fonts, logos, brandbooks, customer materials, tokens, cookies, sessions, API keys or private generated content. Use ignored local paths described in `docs/LOCAL_ASSETS.md`.

## Verification

Run:

```bash
npm test
npm run check:public
```

Label author checks as self-check. A second model may review the exact commit, but its opinion does not replace owner acceptance or original brand assets.
