# Text & JSON Tools

A static website with five text and JSON utilities. Everything runs in the browser and nothing is uploaded.

| Tool | What it does | Example |
|------|--------------|---------|
| **JSON Format** | A Postman-style pretty view with syntax colours, line numbers, ▾/▸ folding, indent of 2, 4 or Tab, sort keys A→Z, search, and Expand/Collapse all. | `{"a":[1,2]}` → coloured, foldable tree |
| **Compare & Merge** | A WinMerge-style side-by-side diff. Copy one changed line (→ ←) or a whole block (Block ⇒ / ⇐ Block) to the other side. It also has Prev/Next diff, Undo, a sticky toolbar, collapsed unchanged lines, a clickable location bar and keyboard shortcuts (Alt+↓/↑ next/previous, Alt+→/← copy, Ctrl/⌘+Z undo). | |
| **Text → JSON** | Unescapes a JSON string literal into pretty JSON. It also accepts escaped JSON copied from a log without its outer quotes. | `"{\"name\":\"Ann\"}"` → `{ "name": "Ann" }` |
| **JSON → Text** | Escapes JSON into a single string literal. | `{ "name": "Ann" }` → `"{\"name\":\"Ann\"}"` |
| **JSON Minify** | Minifies formatted JSON onto one line. | multi-line JSON → `{"a":[1,2]}` |

Each tool has its own link: `#format` (the default), `#compare`, `#text-to-json`, `#json-to-text`, `#minify`.

Every text panel has its own **Copy** and **Download** buttons. Editable panels also have **Paste** and **Clear**, and Cmd/Ctrl+Z undoes them. Compare also has **Swap**, which exchanges the left and right sides.

## Run locally

ES modules need a web server, so opening `index.html` as a file won't work.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Test

```bash
npm install   # dev dependency only: jsdiff, so the tests use the same library as the page
npm test      # node --test
```

## Deploy

Upload the folder as it is to any static host, such as GitHub Pages, Netlify or Vercel. There is no build step. The page needs only `index.html`, `style.css`, `app.js`, `tools.js` and `vendor/`.

## Project layout

```
index.html            page, tabs, import map ("diff" → vendor/diff-9.0.0.js)
style.css             layout, light/dark theme, mobile
app.js                DOM wiring only
tools.js              pure logic: textToJson, jsonToText, minify, diffBlocks, applyCopy
tools.test.js         unit tests
vendor/diff-9.0.0.js  jsdiff 9.0.0 (BSD-3-Clause), stored in the repo so a blocked CDN can't break the page
docs/superpowers/     design spec and implementation plan
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
