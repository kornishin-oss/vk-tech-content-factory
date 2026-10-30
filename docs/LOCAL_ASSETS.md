# Local assets

Real photos and brand materials are deliberately outside Git.

Recommended local layout:

```text
local-assets/
├── photos/
├── brand/
│   └── brand-tokens.local.json
├── audio/
└── video/
```

The app also looks for ignored `config/brand-profile.local.json`. This local profile may define the palette, content-series labels, category-to-mode mapping and author label. It is served only by the local Node process and remains excluded from Git.

The visual composer supports local OTF/TTF selection for headline and text roles through the browser `FontFace` API. Font bytes stay in browser memory and are cleared on refresh. Do not describe a fallback font as VK Sans; load the original local font files when they are legally available.

The browser visual composer reads a selected photo and token JSON directly with the File API. It does not send either file to the local Node server. Refreshing the page clears the selected file handles.

Only use an asset when its owner and permitted purpose are known. The code cannot establish publication rights.
