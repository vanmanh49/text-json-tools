# Text & JSON Tools

A static website with seven text and JSON utilities. Everything runs in the browser and nothing is uploaded.

| Tool | What it does | Example |
|------|--------------|---------|
| **JSON Format** | A Postman-style pretty view with syntax colours, line numbers, ▾/▸ folding, indent of 2, 4 or Tab, sort keys A→Z, search, and Expand/Collapse all. | `{"a":[1,2]}` → coloured, foldable tree |
| **Compare & Merge** | A WinMerge-style side-by-side diff. Copy one changed line (→ ←) or a whole block (Block ⇒ / ⇐ Block) to the other side. **Compare as JSON** ignores key order and formatting. It also has Prev/Next diff, Undo, a sticky toolbar, collapsed unchanged lines, a clickable location bar and keyboard shortcuts (Alt+↓/↑ next/previous, Alt+→/← copy, Ctrl/⌘+Z undo). | |
| **Text → JSON** | Unescapes a JSON string literal into pretty JSON. It also accepts escaped JSON copied from a log without its outer quotes. | `"{\"name\":\"Ann\"}"` → `{ "name": "Ann" }` |
| **JWT Decode** | Shows a token's header and payload, and when it was issued and when it expires. Decoded in your browser and never saved; the signature is not checked. | `eyJhbGciOi…` → header, payload, "Expires in 59 minutes" |
| **Encode / Decode** | Base64 encode and decode (UTF-8, URL-safe), and URL encode and decode. | `Xin chào` ⇄ `WGluIGNow6Bv` |
| **JSON → Text** | Escapes JSON into a single string literal. | `{ "name": "Ann" }` → `"{\"name\":\"Ann\"}"` |
| **JSON Minify** | Minifies formatted JSON onto one line. | multi-line JSON → `{"a":[1,2]}` |

Every tool has a search box: Ctrl/⌘+F jumps to it, and Enter / Shift+Enter go to the next / previous match. Its toggles turn on **Aa** match case, **ab** whole word and **.\*** regular expressions. Opening a tool puts the cursor in its input, and Ctrl/⌘+V pressed anywhere else on the page pastes into that input.

Each tool has its own link: `#format` (the default), `#compare`, `#text-to-json`, `#json-to-text`, `#minify`, `#jwt`, `#encode`.

The app works like a small editor:
- The panels fill the screen.
- Each panel's status bar shows lines, size and whether the JSON is valid. **Go to error** jumps to the problem, and **Fix JSON** repairs almost-JSON: comments, trailing commas, single quotes, unquoted keys and Python's `True`/`False`/`None`.
- Empty panels offer **Paste**, **Try a sample** and drag-and-drop of a file. Files are read in the browser and never uploaded.
- Results can be sent to another tool with **Send to…**.
- Your text is remembered in this browser (you can turn this off with ⚙). The theme can be System, Light or Dark.

Every text panel has its own **Copy** and **Download** buttons. Editable panels also have **Paste** and **Clear**, and Cmd/Ctrl+Z undoes them. Compare also has **Swap**, which exchanges the left and right sides.

## Run locally

```bash
npm install
npm run dev    # open the URL it prints
```

## Test

```bash
npm test       # Vitest with jsdom
```

## Deploy

Push to `main`; `.github/workflows/deploy.yml` runs the tests, builds and publishes to Pages. Failing tests block the deploy.

To host it elsewhere, run `npm run build` and upload `dist/` to any static host, such as Netlify or Vercel. Paths are relative, so it also works from a sub-path.

## Project layout

```
index.html                 page shell; applies the saved theme before first paint
vite.config.js             Vite + React, base './', Vitest with jsdom
public/fonts/              IBM Plex Sans/Mono woff2 subsets (SIL OFL 1.1, see OFL.txt)
src/
  main.jsx                 entry: page-wide listeners, renders App
  App.jsx                  top bar, tabs, theme, settings menu
  style.css                layout, light/dark theme, mobile
  tools.js                 pure logic: textToJson, jsonToText, minify, diffBlocks, applyCopy, jsonLines, …
  tools.test.js            unit tests for tools.js
  store.js                 safe localStorage access, settings
  textStore.js             panel text, remembered in this browser
  setText.js               undo-friendly text replace for Paste, Clear, samples and drops
  globals.js               page-wide drop guard and shortcuts
  samples.js               "Try a sample" text
  useHashTab.js            current tab from the URL hash
  ui/                      IconButton, Panel, StatusBar, SearchBox
  tools/                   TransformTool (five tools), FormatTool, CompareTool
docs/superpowers/          design spec and implementation plans
```

## Known limits

- The JSON tools use `JSON.parse`. Integers above 2^53 lose precision, and duplicate keys keep only the last value.
- Compare gives up after about 1 second on very different large texts and shows a message instead of freezing the tab.
- Windows (CRLF) and Unix (LF) line endings count as different lines.

## Working on this repo with Claude Code

`.claude/settings.json` turns on this project's Claude Code plugins and registers their marketplaces. When you open the repo in Claude Code, it offers to install them:

- From the Anthropic plugin directory: superpowers, context7, playwright, frontend-design, code-review-anthropics, skill-creator, claude-md-management
- From GitHub marketplaces: ponytail (`DietrichGebert/ponytail`) and ui-ux-pro-max (`nextlevelbuilder/ui-ux-pro-max-skill`)

To turn one off just for yourself, set it to `false` in `.claude/settings.local.json`.
