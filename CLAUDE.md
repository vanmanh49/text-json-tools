# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, browser-only website with five tools: JSON Format (Postman-style pretty view), Text → JSON (unescape), JSON → Text (escape), JSON Minify, and Compare & Merge (WinMerge-style side-by-side diff with per-line and per-block copy left/right). No backend, no build step, no framework. The design spec and plan are in `docs/superpowers/`. The spec is the authority on behavior, so update it when behavior changes.

## Commands

```bash
npm install                                   # dev only: installs jsdiff for the tests
npm test                                      # node --test, runs tools.test.js
node --test --test-name-pattern="copy"        # run tests whose name matches
python3 -m http.server 8000                   # serve locally; ES modules need http://, not file://
```

There is no linter or bundler. To deploy, upload the folder as it is.

## Architecture

- **`tools.js`** holds all logic as pure string functions with no DOM: `textToJson`, `jsonToText`, `minify`, `diffBlocks`, `applyCopy`, `jsonLines`, `linesText`. Invalid input makes them throw `Error`, and empty or whitespace-only input returns `''`. Any new tool logic goes here, with tests in `tools.test.js`.
- **`panels.js`** holds the chrome shared by every panel:
  - It exports `iconButton`, `setText`, `onRefresh` / `refreshButtons` and `initPanels({ samples })`. `app.js` calls `initPanels` last, after every tool has added its listeners, because restoring saved text fires `input`.
  - It wraps each panel's textarea (or the Pretty `<div>`) in an `.editor` and appends a `.status`. Whether a panel counts as JSON comes from its `.tools[data-ext="json"]`.
  - It reads the status for that text from `jsonStatus()` / `errorLocation()` in `tools.js`, and debounces the update.
  - Send to, drop, samples, Paste and Clear all go through `setText()`.
  - Storage: `tjt:settings` (`{ remember }`), `tjt:theme`, `tjt:text:<textarea id>`. Every access goes through the try/catch `store` helper. An inline script in `<head>` applies the theme before first paint.
- **`app.js`** only wires the DOM to those functions:
  - Tabs come from `location.hash`, and each section is a `<section data-tab="...">`. `showTab()` adds `body.app` to every tool except Compare. That class makes the section fill the screen so its panels scroll inside; Compare scrolls the page because of its sticky toolbar and location bar.
  - Panels whose input is JSON show parse errors in the status bar, so the tool's `.err` line stays empty for them.
  - The three JSON tools share one loop over a `{tab: fn}` map. Adding a JSON tool means two things:
    - a new section in `index.html` with an `.in` panel, an `.out` panel and an `.err` line
    - one entry in the map
  - Panel buttons are generated, not written in HTML:
    - Each `<div class="tools" data-for="<textarea id>" data-ext="json|txt">` gets Copy and Download.
    - Paste and Clear are added only when the textarea isn't `readonly`.
    - They are built with `iconButton(icon, label, onClick)` from the `ICONS` map. That map is static SVG markup and is the only `innerHTML` in the app.
  - Disabled states: each tool pushes a check into `buttonChecks`. `refreshButtons()` runs them on every `input` event. Code that changes text **without** an `input` event must call `refreshButtons()` itself: Compare copy, undo and swap, and the debounced Format `render()`.
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
  - `history` is a stack of `{left, right}` snapshots taken before each copy, which is what Undo pops.
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
- Search wraps matches in `<mark>` inside token spans. Before a new search, `highlight()` rebuilds the view and carries over which nodes were folded.
- Shared class names: `.ln` is used by both the Compare grid (`.diff .ln`) and the Pretty view (`.pretty .ln`). Scope any rule for one of them, or it breaks the other. An unscoped mobile `.ln { display: none }` once collapsed the Pretty view's columns.

## Known, accepted limits

- `JSON.parse` loses precision above 2^53 and keeps only the last duplicate key. This is marked with a `shortcut:` comment in `tools.js`.
- Text → JSON unescapes only one level.
- CRLF and LF versions of a line count as different lines.
