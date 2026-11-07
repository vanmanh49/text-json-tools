# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, browser-only website with four tools: Text → JSON (unescape), JSON → Text (escape), JSON Simplify (minify), and Compare & Merge (line diff with per-block left/right picks). No backend, no build step, no framework. The design spec and plan are in `docs/superpowers/`. The spec is the authority on behavior, so update it when behavior changes.

## Commands

```bash
npm install                                   # dev only: installs jsdiff for the tests
npm test                                      # node --test, runs tools.test.js
node --test --test-name-pattern="merge"       # run tests whose name matches
python3 -m http.server 8000                   # serve locally; ES modules need http://, not file://
```

There is no linter or bundler. To deploy, upload the folder as it is.

## Architecture

- **`tools.js`** holds all logic as pure string functions with no DOM: `textToJson`, `jsonToText`, `minify`, `diffBlocks`, `merge`. Invalid input makes them throw `Error`, and empty or whitespace-only input returns `''`. Any new tool logic goes here, with tests in `tools.test.js`.
- **`app.js`** only wires the DOM to those functions:
  - Tabs come from `location.hash`, and each section is a `<section data-tab="...">`.
  - The three JSON tools share one loop over a `{tab: fn}` map. Adding a JSON tool means a new section in `index.html` with `.in` / `.out` / `.err` / `.copy`, plus one map entry.
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
- `merge(blocks, choices)` joins the chosen lines with `'\n'`. `choices[i]` belongs to the i-th change block and defaults to `'right'`.
- Invariant, covered by tests: merging with every block set to left reproduces the left text byte-for-byte, and the same holds for right. This includes trailing newlines and CRLF.
- `diffArrays` runs with `{ timeout: 1000 }`. When it gives up it returns `undefined`, and `diffBlocks` throws a "too different" error instead of freezing the tab.
- The diff view renders user text only through `textContent`. Never use `innerHTML`, because the compared text can contain markup.

## Known, accepted limits

- `JSON.parse` loses precision above 2^53 and keeps only the last duplicate key. This is marked with a `shortcut:` comment in `tools.js`.
- Text → JSON unescapes only one level.
- CRLF and LF versions of a line count as different lines.
