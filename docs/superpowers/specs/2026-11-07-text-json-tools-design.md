# Text & JSON Tools — Design

Date: 2026-11-07

## Goal

A public, static website with five browser-only utilities:

0. **JSON Format**: a Postman-style pretty view with syntax colours, line numbers, folding, indent choice, key sorting and search.
1. **Text → JSON** — unescape a JSON string literal into pretty JSON.
2. **JSON → text** — escape JSON into a single string literal.
3. **JSON simplify** — minify formatted JSON to one line.
4. **Compare & merge**: a WinMerge-style side-by-side line diff. You copy changes left or right one line or one block at a time.

Success: a user pastes input, gets correct output or a clear error, and copies the result. No data leaves the browser.

## Non-goals

No backend, accounts, history, share links, file upload, or analytics.

## Constraints

- Static files only, deployable to GitHub Pages / Netlify as-is. No build step.
- Plain HTML + CSS + JS (ES modules).
- One runtime dependency: `jsdiff` (`diff@9.0.0`), loaded in the browser from
  `vendor/diff-9.0.0.js` (the jsDelivr `+esm` bundle, kept in the repo so a blocked CDN cannot blank the page) through an import map
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

The active tab comes from the URL hash: `#format`, `#text-to-json`, `#json-to-text`, `#minify`, `#compare`.
An empty or unknown hash shows `#format`.

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
- `diffBlocks(left, right)` → an array of blocks from jsdiff `diffArrays`, run
  over `left.split('\n')` and `right.split('\n')`. Splitting into lines keeps a
  missing final newline or CRLF from changing the merge.
  - `{ type: 'same', lines: string[] }` for unchanged runs.
  - `{ type: 'change', left: string[], right: string[] }` for a removed run, an
    added run, or a removed run followed by an added run, which together form
    one block. A side with no lines is `[]`.
- `applyCopy(left, right, { block, row?, dir })` → `{ left, right }`. This is the
  WinMerge-style copy. `dir: 'right'` copies left → right and `'left'` copies
  right → left. `block` is the change-block index.
  - Without `row`, the whole block is copied.
  - With `row`, only that line of the block is copied. If the target has a line
    there, it is replaced. If the target has a gap, the line is inserted. If the
    source has a gap, the target's line is deleted.
  - An out-of-range `block` changes nothing. The source side is never changed.
- `jsonLines(value, indent = 2, sort = false)` → one entry per output line:
  `{ depth, parts: [[cls, text], …] }`.
  - `cls` is one of `key`, `str`, `num`, `bool`, `null` or `punc`.
  - A line that opens a non-empty object or array also has `kind` (`'{'` or
    `'['`), `count` (the number of children) and `end` (the index of its closing
    line).
  - Empty `{}` and `[]` stay on one line.
  - With `sort`, object keys are ordered A→Z with `localeCompare` at every depth.
    This includes numeric-looking keys, which a plain object would reorder.
- `linesText(lines, indent)` joins the lines with the indent string (a number of
  spaces, or `'\t'`). Unsorted, the result is byte-identical to
  `JSON.stringify(value, null, indent)`.

Empty input to the three JSON tools returns `''` without an error.

## UI

- **JSON Format:** a toolbar with Indent (2 spaces, 4 spaces or Tab), "Sort keys
  A→Z", Expand all, Collapse all, a search box and a match count. Below it, the
  JSON input panel sits next to the Pretty panel.
  - The Pretty view is a `<div>` that re-renders 150ms after typing stops. It
    shows a line-number gutter, a ▾/▸ fold button on each non-empty
    object/array, and coloured tokens.
  - A folded node shows `{…} 3 keys` or `[…] 2 items`. Line numbers keep their
    original values while folded.
  - Collapse all keeps the root open.
  - Search highlights matches inside single tokens and unfolds their ancestors.
    Enter and Shift+Enter cycle through the matches.
  - The Pretty panel's Copy and Download give `linesText` output, without line
    numbers or fold markers.
  - Invalid JSON clears the view and shows the parse error.
- **Panels (every tool):** each textarea sits in a `.panel` with a header row:
  its label on the left and icon buttons on the right.
  - Every panel has **Copy** and **Download**. Download saves a `.json` file for
    JSON panels and a `.txt` file otherwise, named after the label (for example
    `one-line-json.json`).
  - Editable panels also have **Paste** and **Clear**.
  - Under 600px the buttons show only their icons. The label still shows while a
    button flashes feedback such as "Copied", and `aria-label` keeps the name for
    screen readers.
  - Paste and Clear go through `execCommand('insertText' | 'delete')`, so
    Cmd/Ctrl+Z undoes them and they fire `input` like typing.
  - If the browser blocks clipboard reading, the section's error line tells the
    user to press Ctrl/⌘+V instead.
- **JSON tools (3 tabs):** an input panel, a read-only output panel and an error
  line. Output updates on every `input` event.
- **Compare (WinMerge style):** editable Left and Right panels, then a toolbar:
  Compare, ‹ Prev diff, Next diff ›, Undo, a difference count, and **Swap**.
  Swap exchanges the sides, re-diffs, and can be undone.
  - Below the toolbar is an aligned side-by-side grid with line numbers, which
    are hidden under 600px. Unchanged lines are dimmed. Changed lines are tinted
    red (left) and green (right), and a missing line shows as a hatched gap.
  - Each change block has a header "Difference N of M" with "Block ⇒" and
    "⇐ Block" buttons. Each changed line has → and ← buttons.
  - A copy rewrites the target textarea and re-diffs at once, then keeps focus on
    the same difference index.
  - Undo restores the textareas as they were before each copy, any number of
    times. Typing in a textarea clears the diff and the copy history; the
    textarea's own undo covers typed edits.
  - There is no separate merged-result box. The two sides are the result.
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
  - `diffBlocks`: identical texts give only same blocks. A replacement, a pure
    addition and a pure deletion each give one change block.
  - `applyCopy`, one line at a time: replace, insert into a gap, and copying a
    gap deletes the line.
  - `jsonLines`/`linesText`: equal to `JSON.stringify` for indent 2, 4 and tab
    across nested, empty, unicode, escaped and scalar values. Every fold ends on
    its matching bracket at the same depth. Token classes are right, and sorting
    covers numeric-looking keys.
  - `applyCopy`, whole blocks: each direction, and an out-of-range block is a
    no-op.
  - Copying every block in one direction makes both sides identical, including
    trailing newlines, CRLF and an empty side.
- Manual check in a real browser (Playwright) of each tab after implementation,
  including the error display and copy.
