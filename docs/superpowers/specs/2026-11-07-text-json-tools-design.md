# Text & JSON Tools — Design

Date: 2026-11-07

## Goal

A public, static website with four browser-only utilities:

1. **Text → JSON** — unescape a JSON string literal into pretty JSON.
2. **JSON → text** — escape JSON into a single string literal.
3. **JSON simplify** — minify formatted JSON to one line.
4. **Compare & merge** — line diff two texts, pick left/right per change, copy the merged result.

Success: a user pastes input, gets correct output or a clear error, and copies the result. No data leaves the browser.

## Non-goals

No backend, accounts, history, share links, file upload, or analytics.

## Constraints

- Static files only, deployable to GitHub Pages / Netlify as-is. No build step.
- Plain HTML + CSS + JS (ES modules).
- One runtime dependency: `jsdiff` (`diff@9.0.0`), loaded in the browser from
  `https://cdn.jsdelivr.net/npm/diff@9.0.0/+esm` through an import map
  that maps the bare specifier `"diff"`. Node tests resolve the same `"diff"` from
  `node_modules` (devDependency, same version).
- Works on desktop and phone widths, light and dark theme.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell, tab nav, one section per tool, import map |
| `style.css` | Layout, color tokens, light/dark, responsive |
| `app.js` | DOM wiring: tabs, input events, copy, rendering. No tool logic. |
| `tools.js` | Pure functions, no DOM |
| `tools.test.js` | `node --test` suite for `tools.js` |
| `package.json` | `"type": "module"`, devDependency `diff@9.0.0`, `"test": "node --test"` |

The active tab comes from the URL hash: `#text-to-json`, `#json-to-text`, `#minify`, `#compare`.
An empty or unknown hash shows `#text-to-json`.

## Functions (`tools.js`)

All of them take strings. Invalid input makes them throw an `Error` whose message
the UI shows.

- `textToJson(s)`
  1. `v = JSON.parse(s.trim())`. If that fails and the input contains `\"`, retry with
     `JSON.parse('"' + s.trim() + '"')`, which handles `{\"a\":1}` copied from logs
     without its outer quotes.
  2. If `v` is a string, `v = JSON.parse(v)` (the unescape step).
  3. Return `JSON.stringify(v, null, 2)`.
- `jsonToText(s)` → `JSON.stringify(JSON.stringify(JSON.parse(s)))`.
  Example: `{ "name": "Ann" }` → `"{\"name\":\"Ann\"}"`.
- `minify(s)` → `JSON.stringify(JSON.parse(s))`.
- `diffBlocks(left, right)` → an array of blocks from jsdiff `diffLines`:
  - `{ type: 'same', text }` for unchanged runs.
  - `{ type: 'change', left, right }` for a removed run, an added run, or a removed
    run followed by an added run, which together form one block. A side with no
    lines is `''`.
- `merge(blocks, choices)` → a string. `choices[i]` is `'left'` or `'right'` for
  change block `i` in index order. It defaults to `'right'`. Same blocks are
  copied as they are.

Empty input to the three JSON tools returns `''` without an error.

## UI

- **JSON tools (3 tabs):** an input textarea, a read-only output textarea, a Copy
  button, and an error line. Output updates on every `input` event.
- **Compare:** left and right textareas and a Compare button. The diff view shows
  same blocks dimmed. Each change block shows its left text (red tint) and right
  text (green tint) with "Use left" / "Use right" buttons, and the active choice
  is highlighted. Below it is a read-only merged-result textarea with a Copy
  button, recomputed on every pick. Editing either input clears the diff until
  Compare is pressed again.
- Copy uses `navigator.clipboard.writeText` and shows "Copied" briefly.
- Controls are native buttons and labelled textareas, so they work with the
  keyboard and screen readers.

## Error handling

- Every tool call in `app.js` is wrapped in try/catch. On error, the output is
  cleared and `err.message` is shown in the error line. Modern browsers include
  the position or line and column in it.
- Known limit, noted in code: `JSON.parse` loses precision on integers above
  2^53 and keeps only the last of any duplicate keys.

## Testing

- `tools.test.js` with `node:test` and `node:assert`:
  - `textToJson`: quoted escaped string, unquoted `{\"a\":1}`, plain JSON object
    (pretty-printed as is), invalid input throws, empty → `''`.
  - `jsonToText`: round trip `textToJson(jsonToText(x))` equals pretty `x`;
    invalid input throws.
  - `minify`: multi-line → one line; invalid input throws.
  - `diffBlocks` + `merge`: identical texts → only same blocks; a replacement, a
    pure addition, and a pure deletion each give one change block; merge with
    all-left equals left; merge with all-right (default) equals right.
- Manual check in a real browser (Playwright) of each tab after implementation,
  including the error display and copy.
