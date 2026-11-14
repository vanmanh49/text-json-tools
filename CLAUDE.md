# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, browser-only website with seven tools: JSON Format (Postman-style pretty view), Compare & Merge (WinMerge-style side-by-side diff with per-line and per-block copy left/right), Text → JSON (unescape), JSON → Text (escape), JSON Minify, JWT Decode, and Encode/Decode (Base64, URL). No backend, no build step, no framework. The design spec and plan are in `docs/superpowers/`. The spec is the authority on behavior, so update it when behavior changes.

## Commands

```bash
npm install                                   # dev only: installs jsdiff for the tests
npm test                                      # node --test, runs tools.test.js
node --test --test-name-pattern="copy"        # run tests whose name matches
python3 -m http.server 8000                   # serve locally; ES modules need http://, not file://
```

There is no linter or bundler. To deploy, upload the folder as it is.

## Architecture

- **`tools.js`** holds all logic as pure string functions with no DOM: `textToJson`, `jsonToText`, `minify`, `diffBlocks`, `applyCopy`, `jsonLines`, `linesText`, `normalizeJson`, `decodeJwt`, `jwtTimeNotes`, `base64Encode`/`base64Decode`, `urlEncode`/`urlDecode`, `jsonStatus`/`errorLocation`, `repairJson` (the status bar's Fix JSON), `findAll`. Invalid input makes them throw `Error`, and empty or whitespace-only input returns `''`. Any new tool logic goes here, with tests in `tools.test.js`.
- **`panels.js`** holds the chrome shared by every panel:
  - It exports `el`, `iconButton`, `setText`, `onRefresh` / `refreshButtons` and `initPanels({ samples })`. `app.js` calls `initPanels` last, after every tool has added its listeners, because restoring saved text fires `input`.
  - It wraps each panel's textarea (or the Pretty `<div>`) in an `.editor` and appends a `.status`. Whether a panel counts as JSON comes from its `.tools[data-ext="json"]`.
  - It reads the status for that text from `jsonStatus()` / `errorLocation()` in `tools.js`, and debounces the update. Every `input` event anywhere refreshes every panel, so a status bar is rebuilt only when its own text changed; keep that check, or a big broken JSON on one tab stalls typing on all of them. Fix JSON tries `repairJson` up front only for text up to 1 MB (`MAX_TRY_FIX`); above that it runs on click.
  - A window-level `dragover`/`drop` guard cancels file drops outside the input panels, which would otherwise open the file in the tab and lose unsaved text. It checks for `Files` so dragging selected text into a textarea still works.
  - Send to, drop, samples, Paste and Clear all go through `setText()`.
  - Textareas with `data-private` (the JWT token box) are never written to storage, whatever the "remember" setting says. Keep that attribute on any box that may hold secrets.
  - Search: `initSearch()` adds a search box to every section, Format included (it covers the Pretty view's token spans too). Matches are CSS Custom Highlight API ranges (`find`, `find-current`), painted on the Compare diff's `.txt` spans and, for textareas, on a transparent copy of the text (`.hl`) placed before the textarea. The textarea itself goes transparent while `.editor.searching` is set. `.hl` must keep the textarea's font, padding and wrapping, or the highlights drift.
  - Shortcuts: Ctrl/⌘+F focuses the visible section's `input[type="search"]`. A `paste` event outside an editable field goes to the first empty editable textarea of the visible section. A `beforeinput` guard cancels `history*` (undo/redo) aimed at any element other than the focused one, because the browser's undo history is page-wide and Ctrl/⌘+Z in a search box used to wipe the panels. Keep it.
  - Storage: `tjt:settings` (`{ remember }`), `tjt:theme`, `tjt:text:<textarea id>`. Every access goes through the try/catch `store` helper. An inline script in `<head>` applies the theme before first paint.
- **`app.js`** only wires the DOM to those functions:
  - Tabs come from `location.hash`, and each section is a `<section data-tab="...">`. `showTab()` focuses the first editable textarea of the tab. Its first call runs after `initPanels`, because wrapping a textarea in `.editor` drops its focus. `showTab()` adds `body.app` to every tool except Compare. That class makes the section fill the screen so its panels scroll inside; Compare scrolls the page because of its sticky toolbar and location bar.
  - Panels whose input is JSON show parse errors in the status bar, so the tool's `.err` line stays empty for them.
  - The JSON tools, JWT and Encode/Decode share one loop over a `{tab: fn}` map. Encode/Decode's function picks the encoder from `#enc-mode`, and changing the mode re-fires `input`.
  - Compare as JSON (`#json-mode`) rewrites both textareas with `normalizeJson` before `compare()` and pushes the originals onto `history`. Every diff and copy afterwards works on that visible, normalized text.
  - Adding a tool to that loop means two things:
    - a new section in `index.html` with an `.in` panel, an `.out` panel and an `.err` line
    - one entry in the map
  - Panel buttons are generated, not written in HTML:
    - Each `<div class="tools" data-for="<textarea id>" data-ext="json|txt">` gets Copy and Download.
    - Paste and Clear are added only when the textarea isn't `readonly`.
    - They are built with `iconButton(icon, label, onClick)` from the `ICONS` map. That map is static SVG markup and is the only `innerHTML` in the app.
  - Disabled states: each tool pushes a check into `buttonChecks`. `refreshButtons()` runs them on every `input` event. Code that changes text **without** an `input` event must call `refreshButtons()` itself. Compare's `compare()` does this, which covers copy, undo, swap and Compare as JSON, and so does the debounced Format `render()`. The search uses the same hook to re-run.
  - Paste and Clear call `setText()`, which uses `execCommand` so the browser's undo still works and an `input` event fires. It uses `execCommand` only when the textarea really has focus; otherwise the command would edit whichever box is focused. It also skips `insertText` for text with more than 200 newlines, because its cost grows roughly quadratically with line count (2.6s for 2,000 lines, minutes for 20,000). `delete` and undo stay linear.
  - When testing in a browser after editing JS, open a fresh tab or hard-reload. `?v=` on the page URL does not refresh the cached `app.js`/`tools.js` modules, and stale JS once looked like a regression. Don't replace it with `t.value = …`.
  - Every tool call is wrapped in try/catch, and the error goes to `err.textContent`.
- **The jsdiff dependency has two copies, and they must stay on the same version:**
  - The browser loads `vendor/diff-9.0.0.js` through the import map in `index.html`.
  - Node tests load `diff` from `node_modules` (devDependency pinned to `9.0.0`).
  - To upgrade: bump `package.json`, then download `https://cdn.jsdelivr.net/npm/diff@<ver>/+esm` into `vendor/` and update the import map.
  - A test checks that the import map points at a local file. Do not switch back to a CDN URL. `app.js` → `tools.js` → `diff` is one static import chain, so if `diff` fails to load, the whole page renders blank.

## Compare & merge invariants

- `diffBlocks` splits both texts on `'\n'` and runs jsdiff `diffArrays` over the lines. It does **not** use `diffLines`, because `diffLines` treats a last line with no newline (`c`) as different from `c\n`. That swallowed shared lines into changes and made per-block merges produce garbage such as `a\ncd`.
- Block shapes:
  - Unchanged runs: `{type:'same', lines:string[]}`
  - Changes: `{type:'change', left:string[], right:string[]}`
- `applyCopy(left, right, { block, row?, dir })` → `{ left, right }` is the only way the UI changes text.
  - It re-diffs, rewrites the target side's slice for change block `block` (the whole block, or one `row`), and joins the lines with `'\n'`.
  - Copying one row replaces the target line, inserts the line into a gap, or deletes the target line when the source has a gap.
- Invariant, covered by tests: copying every block in one direction leaves both sides byte-identical. This includes trailing newlines, CRLF and an empty side.
- Compare UI state in `app.js`:
  - `history` is a stack of `{left, right}` snapshots taken by `snapshot()` before each copy, swap or Compare as JSON, which is what Undo pops. It keeps the last 100 (`MAX_UNDO`), because each one holds a full copy of the changed side.
  - Typing clears it, because restoring a snapshot would throw away typed text.
  - After a copy, `compare(index)` re-renders and moves focus back to the same difference.
- Long diffs:
  - `render()` collapses unchanged runs with `splitSame` into a hidden `.hidden-lines` box behind an "⋯ N unchanged lines" button. Line-number counters still advance through hidden rows.
  - `updateLocbar()` places the ticks from each `.change` element's `offsetTop / diff.offsetHeight`, so it must re-run whenever the diff's layout changes. It does after render, after an expand, through the ResizeObserver, and on resize. `.diff` is `position: relative` so that `offsetTop` is measured from the diff.
  - The keyboard shortcuts check `document.activeElement` (not `e.target`) so they don't fire while typing; on macOS, Option+arrows move by word in a textarea.
- `diffArrays` runs with `{ timeout: 1000 }`. When it gives up it returns `undefined`, and `diffBlocks` throws a "too different" error instead of freezing the tab.
- The diff view renders user text only through `textContent`. Never use `innerHTML`, because the compared text can contain markup.

## JSON Format view

- `jsonLines` is the single source for both the coloured view and the copied text.
  - `linesText(jsonLines(v, i), i) === JSON.stringify(v, null, i)` is tested.
  - Change formatting in `jsonLines` only; never format the copy text separately.
- The Pretty view is a `<div>`, not a textarea, so `app.js` stores its text on `view.value`. That is what the generic panel Copy/Download buttons read.
- Panel tools add Paste and Clear only for `TEXTAREA`s that aren't readonly.
- Folding works through nesting. `build()` nests each non-empty object/array as `.node > (.line, .kids, .line)` using `end`, and `.node.collapsed` hides `.kids` and the closing line through CSS. Line numbers are fixed per line, so they keep their values while folded.
- Search is the shared `initSearch()` one: it paints highlight ranges on the token spans (no `<mark>`, no rebuild), and going to a match inside a folded node clicks its `.fold` buttons open.
- Shared class names: `.ln` is used by both the Compare grid (`.diff .ln`) and the Pretty view (`.pretty .ln`). Scope any rule for one of them, or it breaks the other. An unscoped mobile `.ln { display: none }` once collapsed the Pretty view's columns.

## Known, accepted limits

- `JSON.parse` loses precision above 2^53 and keeps only the last duplicate key. This is marked with a `shortcut:` comment in `tools.js`.
- Text → JSON unescapes only one level.
- CRLF and LF versions of a line count as different lines.
