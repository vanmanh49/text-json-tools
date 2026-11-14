# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, browser-only website with seven tools: JSON Format (Postman-style pretty view), Compare & Merge (WinMerge-style side-by-side diff with per-line and per-block copy left/right), Text → JSON (unescape), JSON → Text (escape), JSON Minify, JWT Decode, and Encode/Decode (Base64, URL). No backend. Built with Vite and React 19; the output in `dist/` is plain static files. The design spec and plans are in `docs/superpowers/`. The spec is the authority on behavior, so update it when behavior changes.

## Commands

```bash
npm install                     # React, jsdiff, Vite, Vitest
npm run dev                     # dev server with hot reload
npm test                        # vitest run (jsdom)
npx vitest run -t "copy"        # run tests whose name matches
npm run build                   # writes dist/
npm run preview                 # serves dist/ locally
```

There is no linter. Deploy: push to `main`; `.github/workflows/deploy.yml` runs the tests, builds and publishes to Pages. Failing tests block the deploy. `vite.config.js` sets `base: './'`, so `dist/` also works from any sub-path on any static host.

## Architecture

- **File map** (all under `src/`):
  - `main.jsx` calls `installGlobalListeners()` and renders `App`.
  - `App.jsx`: top bar, tabs, theme, settings menu (remember text, Clear all). Toggles `body.app` for every tool except Compare. That class makes the section fill the screen so its panels scroll inside; Compare scrolls the page because of its sticky toolbar and location bar. Focuses the first editable textarea of the tab when it opens.
  - `useHashTab.js`: the current tab, from `location.hash` (`TABS`; unknown or empty → `format`).
  - `store.js`: the try/catch `store` helper around `localStorage`, `settings()`, `MAX_SAVE`.
  - `textStore.js`: the text of every editable panel, by textarea id (`EDITABLE_IDS`), with `useText(id)`, debounced saving and the "too large / not saved" notes.
  - `setText.js`: replaces a textarea's text so Cmd/Ctrl+Z can undo it.
  - `globals.js`: page-wide listeners (drop guard, Ctrl/⌘+F, `beforeinput` undo guard, paste).
  - `samples.js`: "Try a sample" text per textarea id.
  - `ui/IconButton.jsx`: `IconButton` and the static `ICONS` map; `flash()` for "Copied".
  - `ui/Panel.jsx`: one panel: header buttons (Copy, Paste, Clear, Download, Send to), `.editor` with the textarea (or the Pretty view as `children`), empty state, file drop, `StatusBar`.
  - `ui/StatusBar.jsx`: lines, size, JSON validity, Go to error, Fix JSON.
  - `ui/SearchBox.jsx`: the search box and its toggles.
  - `tools/TransformTool.jsx`: Text → JSON, JSON → Text, Minify, JWT and Encode/Decode, all one input panel → function → output panel.
  - `tools/FormatTool.jsx`, `tools/CompareTool.jsx`: the two bigger tools.
  - `tools.js` holds all logic as pure string functions with no DOM: `textToJson`, `jsonToText`, `minify`, `diffBlocks`, `applyCopy`, `splitSame`, `jsonLines`, `linesText`, `normalizeJson`, `decodeJwt`, `jwtTimeNotes`, `base64Encode`/`base64Decode`, `urlEncode`/`urlDecode`, `jsonStatus`/`errorLocation`, `repairJson` (the status bar's Fix JSON), `findAll`, `formatSize`. Invalid input makes them throw `Error`, and empty or whitespace-only input returns `''`. Any new tool logic goes here, with tests in `tools.test.js`.
- **Text goes through `textStore`.**
  - Editable textareas are controlled: their value is `useText(id)` and `onChange` calls `textStore.set`.
  - Never `t.value = …` plus a synthetic input event: React ignores it, so go through `textStore.set`.
  - Paste, Clear, samples, drop and Fix JSON call `setText(id, text)`. It uses `execCommand` so the browser's undo still works, then makes sure the store has the text. It uses `execCommand` only when the textarea really has focus; otherwise the command would edit whichever box is focused. It also skips `insertText` for text with more than 200 newlines, because its cost grows roughly quadratically with line count (minutes for 20,000 lines). `delete` and undo stay linear.
  - Send to writes the target id with `textStore.set` and switches the hash.
- **Tools render their own `<section data-tab="...">` and toolbar.** `App.jsx` passes `hidden`. `SearchBox` goes at the end of the toolbar and gets `sectionRef`, `hidden` and a `version` that changes when the tool's output changes.
  - Adding a one-in, one-out tool: a `TransformTool` wrapper with its ids and function, an entry in `NAV`, `TOOLS` and `SECTIONS` in `App.jsx`, the input id in `EDITABLE_IDS`, and a sample.
  - Panels whose input is JSON show parse errors in the status bar, so the tool's `.err` line stays empty for them.
  - Every tool call is wrapped in try/catch, and the message goes to the `.err` line.
  - Disabled states are computed in render from the text; nothing has to refresh them.
- **Status bar:** the text it checks is debounced inside `StatusBar`, so typing in one panel never re-checks another; keep it that way, or a big broken JSON on one tab stalls typing on all of them. Fix JSON tries `repairJson` up front only for text up to 1 MB (`MAX_TRY_FIX`); above that it runs on click.
- **Search** (`SearchBox.jsx`):
  - The Aa / ab / .* toggles (`SEARCH_OPTIONS`) are passed straight to `findAll` as `{ matchCase, wholeWord, regex }`.
  - Matches are CSS Custom Highlight API ranges (`find`, `find-current`), painted on the Compare diff's `.txt` spans, the Pretty view's token spans and, for textareas, on a transparent copy of the text (`.hl`) placed before the textarea. CSS makes the textarea transparent while its `.hl` is not empty.
  - Panel renders `.hl` empty and SearchBox alone fills it through the DOM, so it never fights React. `.hl` must keep the textarea's font, padding and wrapping, or the highlights drift.
  - It re-runs on `version`, on store text changes and resize (debounced 150 ms), and when the section stops being `hidden`.
  - Going to a match clicks `.fold` (Pretty view) and `.expand` (Compare) open, then scrolls straight away. Both click handlers render with `flushSync` so the rows are in the DOM before the scroll. Keep that.
- **Page-wide shortcuts** (`globals.js`): Ctrl/⌘+F focuses the visible section's `input[type="search"]`. A `paste` event outside an editable field goes to the first empty editable textarea of the visible section. A `beforeinput` guard cancels `history*` (undo/redo) aimed at any element other than the focused one, because the browser's undo history is page-wide and Ctrl/⌘+Z in a search box used to wipe the panels. Keep it.
- **Drop:** a window-level `dragover`/`drop` guard cancels file drops outside the input panels, which would otherwise open the file in the tab and lose unsaved text. It checks for `Files` so dragging selected text into a textarea still works. Files above 25 MB are refused.
- **React rules:**
  - Don't toggle classes by hand on nodes whose `className` React renders from state (`.node`, `.change`, `.inputs`); the next render overwrites them. The only hand-toggled classes are `.dropping` on `.editor` and `.flashing` on a button, whose `className` never changes.
  - No `innerHTML` / `dangerouslySetInnerHTML`. User text is only ever a JSX text child or a DOM text node.
  - Every element id and class name matches the pre-React app; CSS and tests depend on them.
- **Storage:** `tjt:settings` (`{ remember }`), `tjt:theme`, `tjt:text:<textarea id>`. Every access goes through `store`. An inline script in `index.html`'s `<head>` applies the theme before first paint. Ids in `PRIVATE_IDS` (the JWT token box, rendered with `data-private`) are never written to storage, whatever the "remember" setting says. Add any box that may hold secrets there.
- **Tests** (Vitest + jsdom + Testing Library, next to the code as `*.test.js(x)`):
  - jsdom has no `ResizeObserver` and no `scrollIntoView`. Tests that render Compare, search, or the whole `App` stub them: `vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })` and `Element.prototype.scrollIntoView = () => {}` (restore both in `afterEach`).
  - Reset the store in `afterEach` (`textStore.set(id, '')`), because it is module state shared by the tests in a file.
- **Fonts** are in `public/fonts/` (IBM Plex, SIL OFL 1.1) and copied to `dist/fonts/` as they are.
- When testing in a browser, use `npm run dev`, or `npm run build && npm run preview` for the real output, in a fresh tab.

## Compare & merge invariants

- `diffBlocks` splits both texts on `'\n'` and runs jsdiff `diffArrays` over the lines. It does **not** use `diffLines`, because `diffLines` treats a last line with no newline (`c`) as different from `c\n`. That swallowed shared lines into changes and made per-block merges produce garbage such as `a\ncd`.
- Block shapes:
  - Unchanged runs: `{type:'same', lines:string[]}`
  - Changes: `{type:'change', left:string[], right:string[]}`
- `applyCopy(left, right, { block, row?, dir })` → `{ left, right }` is the only way the UI changes text.
  - It re-diffs, rewrites the target side's slice for change block `block` (the whole block, or one `row`), and joins the lines with `'\n'`.
  - Copying one row replaces the target line, inserts the line into a gap, or deletes the target line when the source has a gap.
- Invariant, covered by tests: copying every block in one direction leaves both sides byte-identical. This includes trailing newlines, CRLF and an empty side.
- Compare UI state in `tools/CompareTool.jsx`:
  - Compare as JSON (`#json-mode`) rewrites both sides with `normalizeJson` before `compare()` and pushes the originals onto `history`. Every diff and copy afterwards works on that visible, normalized text.
  - `history` is a ref holding a stack of `{left, right}` snapshots taken by `snapshot()` before each copy, swap or Compare as JSON, which is what Undo pops. It keeps the last 100 (`MAX_UNDO`), because each one holds a full copy of the changed side.
  - Any text change that isn't a copy, undo or swap (typing, Send to, Paste, a sample) clears it and drops the stale diff, because restoring a snapshot would throw away that text.
  - After a copy, `compare(index)` re-renders and moves focus back to the same difference.
- Long diffs:
  - Unchanged runs collapse with `splitSame` into a hidden `.hidden-lines` box behind an "⋯ N unchanged lines" `.expand` button (`expanded` Set state). Line-number counters still advance through hidden rows.
  - `updateLocbar()` places the ticks from each `.change` element's `offsetTop / diff.offsetHeight`, so it must re-run whenever the diff's layout changes. It does after render, after an expand, through the ResizeObserver, and on resize, and it skips `setTicks` when nothing moved. `.diff` is `position: relative` so that `offsetTop` is measured from the diff.
  - The keyboard shortcuts check `document.activeElement` (not `e.target`) so they don't fire while typing; on macOS, Option+arrows move by word in a textarea.
- `diffArrays` runs with `{ timeout: 1000 }`. When it gives up it returns `undefined`, and `diffBlocks` throws a "too different" error instead of freezing the tab.
- The diff view renders user text only as JSX text. Never use `innerHTML` or `dangerouslySetInnerHTML`, because the compared text can contain markup.

## JSON Format view

- `jsonLines` is the single source for both the coloured view and the copied text.
  - `linesText(jsonLines(v, i), i) === JSON.stringify(v, null, i)` is tested.
  - Change formatting in `jsonLines` only; never format the copy text separately.
- The Pretty view is a `<div>`, not a textarea. `FormatTool` passes it to `Panel` as `children` with its text as `value`, which is what the panel's Copy/Download buttons read.
- `Panel` adds Paste and Clear only for editable panels (not `readOnly`, no `children`).
- Folding works through nesting. `tree()` nests each non-empty object/array as `.node > (.line, .kids, .line)` using `end`, and `.node.collapsed` hides `.kids` and the closing line through CSS. The folded lines are the `collapsed` Set state, reset when the lines change. Line numbers are fixed per line, so they keep their values while folded.
- Search is the shared `SearchBox`: it paints highlight ranges on the token spans (no `<mark>`, no re-render), and going to a match inside a folded node clicks its `.fold` buttons open.
- Shared class names: `.ln` is used by both the Compare grid (`.diff .ln`) and the Pretty view (`.pretty .ln`). Scope any rule for one of them, or it breaks the other. An unscoped mobile `.ln { display: none }` once collapsed the Pretty view's columns.

## Known, accepted limits

- `JSON.parse` loses precision above 2^53 and keeps only the last duplicate key. This is marked with a `shortcut:` comment in `tools.js`.
- Text → JSON unescapes only one level.
- CRLF and LF versions of a line count as different lines.
