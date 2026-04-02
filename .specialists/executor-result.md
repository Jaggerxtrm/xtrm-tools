Implemented minimal patch in `xtrm-ui` theme files only.

### Root cause (identified)
`pidex-dark.json` was missing the newer tool-use background token family, so runtime fell back to default success coloring (green) for tool-use blocks.  
Also, dark tool bg tokens were set to `surfaceAlt` instead of true black `surface`.

### Exact changed files
1. `.xtrm/config/pi/extensions/xtrm-ui/themes/pidex-dark.json`
2. `.xtrm/config/pi/extensions/xtrm-ui/themes/pidex-light.json`

(`pidex-dark.json` is present in-repo and now includes explicit tool-use bg tokens.)

### Token(s) now controlling tool-use background (restored)
From `pidex-dark.json`:

- `"toolPendingBg": "surface"`
- `"toolSuccessBg": "surface"`
- `"toolErrorBg": "surface"`
- `"toolUseBg": "surface"`
- `"toolUsePendingBg": "surface"`
- `"toolUseSuccessBg": "surface"`
- `"toolUseErrorBg": "surface"`

With `surface = "#000000"`, tool-use blocks render dark/black again.

### One concise runtime verification step
In Pi TUI, run:
1. `/xtrm-ui-theme dark`
2. Execute any tool call (e.g. `ls`)

Expected: tool-use/result block background is black/dark (not green).