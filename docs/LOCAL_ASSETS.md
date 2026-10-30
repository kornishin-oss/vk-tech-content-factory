# Local assets

Real photos and brand materials are deliberately outside Git.

Recommended local layout:

```text
local-assets/
├── photos/
├── figma/
│   ├── manifest.local.json
│   ├── corporate/
│   └── vk-cloud/
├── brand/
│   └── brand-tokens.local.json
├── audio/
└── video/
```

The app also looks for ignored `config/brand-profile.local.json`. This local profile may define the palette, content-series labels, category-to-mode mapping and author label. It is served only by the local Node process and remains excluded from Git.

The visual composer supports local OTF/TTF selection for headline and text roles through the browser `FontFace` API. Font bytes stay in browser memory and are cleared on refresh. Do not describe a fallback font as VK Sans; load the original local font files when they are legally available.

The browser visual composer reads a selected photo and token JSON directly with the File API. It does not send either file to the local Node server. Refreshing the page clears the selected file handles.

## Verified Figma exports

The local server discovers original Figma exports only through ignored `local-assets/figma/manifest.local.json`. Every entry must contain a safe ID, role, classification, relative SVG path, exact SHA-256 and the source Figma file key and node ID. The server rejects path traversal, checksum drift, active SVG content and external SVG links. It returns only browser-safe metadata and a local URL; the filesystem path is never returned to the UI.

Corporate and product assets are intentionally separated:

- `corporate` is reserved for the original VK Tech logo. It is optional and the canvas keeps its aspect ratio;
- `product-specific-reference` is reserved for VK Cloud illustrations. The MVP requires the `SAAS / TECH` or `CLIENT CASE` series and an explicit VK Cloud context confirmation before rendering;
- product-specific illustrations are never selected automatically and are not treated as Yulia's universal visual identity.

The SVG files and the local manifest remain outside Git. The public repository contains only the loader, validation rules and UI controls.

Only use an asset when its owner and permitted purpose are known. The code cannot establish publication rights.
