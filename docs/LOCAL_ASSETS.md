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

The browser visual composer reads a selected photo and token JSON directly with the File API. It does not send either file to the local Node server. Refreshing the page clears the selected file handles.

Only use an asset when its owner and permitted purpose are known. The code cannot establish publication rights.
