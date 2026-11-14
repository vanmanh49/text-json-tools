# React Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the UI (`app.js`, `panels.js`, `index.html` markup) as React components, with every tool behaving exactly as it does on `main` today.

**Architecture:** Vite + React 19, plain JavaScript/JSX (no TypeScript). `tools.js` (pure logic) moves to `src/` unchanged. All panel text lives in one small external store (`src/textStore.js`, read with `useSyncExternalStore`) keyed by the existing textarea ids. Any code can then set any panel's text (Send to, samples, Clear all, paste-anywhere), and a keystroke re-renders only the panels subscribed to that id. Tool outputs are derived with `useMemo`, not stored. The DOM-heavy parts that React can't express (search highlights, the Compare location bar, execCommand for undo-able edits) stay imperative inside effects and refs.

**Tech Stack:** react 19.3.1, react-dom 19.3.1, vite 8.3.8, @vitejs/plugin-react 6.3.0, diff 9.0.0 (now a runtime dependency, bundled), vitest 5.1.0, jsdom 31.0.1, @testing-library/react 16.3.3. Pin these exact versions in `package.json` (no `^`).

**Spec:** `docs/superpowers/specs/2026-11-07-text-json-tools-design.md`, the behavior authority, plus `CLAUDE.md` for the invariants. The only behavior change is deployment: "no build step, upload the folder" becomes "a GitHub Actions workflow tests, builds and deploys `dist/` to GitHub Pages on every push to `main`" (Task 10). Task 9 updates the spec, README and CLAUDE.md to match.

**Hosting today:** GitHub Pages at `https://vanmanh49.github.io/text-json-tools/`, `build_type: legacy`, serving `main` at `/`. Once this branch merges, legacy mode would serve the unbuilt `index.html` and the site would go blank. So the Pages source must switch to GitHub Actions as part of the merge (Task 10, Step 4).

**Reference while porting:** the old code stays readable with `git show main:app.js` / `git show main:panels.js`. To compare behavior side by side, run `main` in a worktree with `python3 -m http.server 8001`.

## Global Constraints

- Every element id stays as it is on `main` (`fmt-in`, `fmt-out`, `t2j-in`, `t2j-out`, `j2t-in`, `j2t-out`, `min-in`, `min-out`, `jwt-in`, `jwt-out`, `enc-in`, `enc-out`, `left`, `right`, `diff`, `locbar`, `theme`, `remember`, `clear-all`, `to-top`, …). Storage keys use them, and so does `style.css`.
- Every CSS class name stays the same, so `style.css` keeps working. The only CSS edit is the `.editor.searching` selector (Task 8).
- Storage keys and shapes stay verbatim: `tjt:settings` (`{ remember }`, default `true`), `tjt:theme` (`system|light|dark`), `tjt:text:<id>`. Every access goes through the try/catch `store` helper.
- `jwt-in` is private: it is never written to storage, whatever "remember" says.
- Constants stay verbatim: `MAX_DROP = 25 MB`, `MAX_SAVE = 2 MB`, `MAX_TRY_FIX = 1 MB`, `MAX_UNDO = 100`, `MAX_HITS = 2000`, the 200-newline `execCommand` cutoff, status debounce `60ms` (`300ms` above 200,000 chars), Format render debounce `150ms`, search re-run debounce `150ms`. Copy `SEND_TO`, `SEARCH_OPTIONS`, `ICONS`, the samples (`PERSON`, `CONFIG_A/B`, `SAMPLE_JWT`) and every user-visible string from `main` verbatim.
- No `dangerouslySetInnerHTML` and no `innerHTML` anywhere. Icons become JSX. User text is rendered only as JSX text children.
- `tools.js` keeps its exports and behavior. Only its import path changes.
- `diff` stays pinned at `9.0.0`.
- The inline theme script in `<head>` stays, so the saved theme applies before first paint.

## Review Focus

1. **Typing in one tab while another holds a big broken JSON** (10 MB) must stay smooth. A panel's status is recomputed only when its own text changes. Test: Task 4 (`status is not recomputed for another panel's edit`).
2. **Cmd/Ctrl+Z after Paste, Clear, Fix JSON or a sample** restores the previous text. React must not overwrite the value that `execCommand` set. Test: Task 9 browser check, because jsdom has no `execCommand`.
3. **Programmatic text set without focus or above 200 lines** (Send to a hidden tab, dropping a 5,000-line file) must land. React ignores a synthetic `input` event after `t.value = x`, so the fallback must write to the store. Test: Task 2 (`setText falls back to the store for long text`).
4. **Undo inside the search box** must not undo panel edits. The page-wide `beforeinput` guard has to survive. Test: Task 9 browser check.
5. **Compare after an outside change** (Send to Compare, a sample, Paste): a stale diff and stale undo history must clear exactly as they do after typing. Test: Task 7 (`setting left from outside clears diff and undo`).

---

## File Structure

```
index.html              Vite entry: <head> (meta, icon, font preloads, theme script), <div id="root">
vite.config.js          react plugin, base: './', test: { environment: 'jsdom' }
public/fonts/           moved from vendor/fonts/ (woff2 + OFL.txt), served as-is
src/main.jsx            createRoot, import './style.css', installGlobalListeners(), render <App/>
src/style.css           moved from style.css; font url()s → /fonts/...; .searching selector changed
src/tools.js            moved unchanged
src/tools.test.js       moved; imports `test` from 'vitest'; the import-map test deleted
src/store.js            `store` try/catch helper, settings(), MAX_SAVE
src/textStore.js        external text store + persistence + useText(id)
src/setText.js          setText(id, text): execCommand when focused and ≤200 newlines, else the store
src/globals.js          window listeners: file-drop guard, Ctrl/⌘+F, beforeinput history guard, paste-anywhere
src/App.jsx             topbar, nav, theme, settings menu, to-top, tab routing, the seven sections
src/useHashTab.js       current tab from location.hash
src/samples.js          the sample texts, keyed by textarea id
src/ui/IconButton.jsx   ICONS as JSX, <IconButton icon label onClick/>, flash()
src/ui/Panel.jsx        panel head + tools (Copy/Paste/Clear/Download/Send to) + Editor (empty state, drop, .hl) + StatusBar
src/ui/StatusBar.jsx    lines/size/valid JSON, Fix JSON, Go to error, save note
src/ui/SearchBox.jsx    port of initSearch (imperative, scoped to its section)
src/tools/TransformTool.jsx  the shared in→fn→out section (text-to-json, json-to-text, minify, jwt, encode)
src/tools/FormatTool.jsx     JSON Format + PrettyView
src/tools/CompareTool.jsx    Compare & Merge
src/**/*.test.jsx       component tests next to their files
```

Deleted at the end (Task 9): `app.js`, `panels.js`, `style.css` (root), `vendor/`.

---

### Task 1: Vite scaffold, move logic and tests

**Files:**
- Modify: `package.json`, `index.html`, `.gitignore` (add `dist/`)
- Create: `vite.config.js`, `src/main.jsx`, `src/App.jsx` (placeholder that renders the `<header class="topbar">` markup from `main`'s `index.html`, still static)
- Move: `tools.js` → `src/tools.js`, `tools.test.js` → `src/tools.test.js`, `style.css` → `src/style.css`, `vendor/fonts/*` → `public/fonts/`
- Delete: `vendor/diff-9.0.0.js`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run preview`, `npm test` (= `vitest run`)

- [ ] **Step 1:** Set `package.json`: `dependencies` react, react-dom, diff `9.0.0`; `devDependencies` vite, @vitejs/plugin-react, vitest, jsdom, @testing-library/react, at the exact versions in Tech Stack. Set `scripts`: `dev: vite`, `build: vite build`, `preview: vite preview`, `test: vitest run`. Run `npm install`.
- [ ] **Step 2:** Write `vite.config.js` with `plugins: [react()]`, `base: './'` (the site must work from any sub-path on a static host), and `test: { environment: 'jsdom' }`.
- [ ] **Step 3:** In `src/tools.test.js`, change `import { test } from 'node:test'` to `import { test } from 'vitest'`. Delete the test `page loads jsdiff from a local file, not a CDN`: jsdiff is now bundled, so there's no import map left to check.
- [ ] **Step 4:** In `src/style.css`, change each `url(vendor/fonts/X)` to `url(/fonts/X)`. In `index.html`, keep the `<head>` from `main` (meta, icon, the two preload links with `href="/fonts/..."`, the inline theme script). Remove the `style.css` link and the import map. The body is `<div id="root"></div><script type="module" src="/src/main.jsx"></script>`.
- [ ] **Step 5: Verify**
  Run: `npm test && npm run build && ls dist dist/fonts`
  Expected: all tools tests pass (one fewer than on `main`). `dist/` has `index.html`, `assets/`, `fonts/*.woff2`. `grep -c 'fonts/' dist/assets/*.css` is non-zero, and the paths are relative (no leading `/` with `base: './'`).
- [ ] **Step 6:** Run `npm run dev` and open the page. The topbar renders in IBM Plex Sans, and the Network tab shows no 404s.
- [ ] **Step 7: Commit** `Scaffold Vite + React and move tools into src`

### Task 2: Storage, text store, setText

**Files:**
- Create: `src/store.js`, `src/textStore.js`, `src/setText.js`, `src/textStore.test.js`

**Interfaces:**
- Produces:
  - `store.get(k): string|null`, `store.set(k, v): boolean`, `store.del(k)`, `settings(): { remember: boolean }`, `MAX_SAVE`, ported from `panels.js`.
  - `textStore`:
    - `get(id): string`, `set(id, text)`, `subscribe(fn): unsubscribe`
    - `useText(id): string` (a `useSyncExternalStore` wrapper)
    - `saveNote(id): string` (`''`, `' · too large to remember'` or `' · not saved (browser storage is full or blocked)'`)
    - `setRemember(bool)`, `clearAll()`
  - `PRIVATE_IDS = new Set(['jwt-in'])` and `EDITABLE_IDS`: the 8 editable textarea ids (`fmt-in`, `t2j-in`, `j2t-in`, `min-in`, `jwt-in`, `enc-in`, `left`, `right`).
  - `setText(id: string, text: string): void`

Behavior:

- On module load, each persisted id (editable and not private) is read from `tjt:text:<id>` when `remember` is on.
- `set` notifies subscribers right away. Saving is debounced per id: 60ms, or 300ms above 200,000 chars. Empty text deletes the key. Text above `MAX_SAVE` deletes it and sets the "too large" note. A failed `store.set` sets the "not saved" note.
- `setRemember(on)` writes `tjt:settings`, then saves all persisted ids or deletes them.
- `clearAll()` deletes every `tjt:text:*` for editable ids and sets every editable id to `''`.
- `setText(id, text)`: `document.getElementById(id)`, then `focus()`. If it is now `document.activeElement` and `text` has ≤200 newlines, `select()` and `execCommand('insertText'|'delete')`, which fires a native `input` that the textarea's `onChange` sends to the store. If that path was skipped, or the store value still differs from `text`, call `textStore.set(id, text)` directly. Never `t.value = …; dispatchEvent(input)`: React drops that event.

- [ ] **Step 1: Write failing tests** in `src/textStore.test.js` (reset `localStorage` and re-import the module fresh per test with `vi.resetModules()`; use fake timers for the debounce):
  - `restores saved text on load`: `localStorage['tjt:text:left']='x'`, then import, then `get('left') === 'x'`.
  - `never persists jwt-in`: `set('jwt-in','tok')`, advance 400ms, then `localStorage.getItem('tjt:text:jwt-in') === null`.
  - `too large to remember`: `set('left', 'a'.repeat(2*1024*1024+1))`, advance, then the key is null and `saveNote('left') === ' · too large to remember'`.
  - `remember off deletes saved text`: set a text, advance, `setRemember(false)`, then the key is null and `JSON.parse(localStorage['tjt:settings']).remember === false`.
  - `clearAll empties every editable panel`.
  - `setText falls back to the store for long text`: render a `<textarea id="left">` bound to `useText('left')`, call `setText('left', 'x\n'.repeat(500))`, then `get('left')` equals that text and the textarea's value matches.
- [ ] **Step 2:** Run `npm test -- textStore`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `src/store.js`, `src/textStore.js` and `src/setText.js` per Interfaces.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Add text store with persistence and undo-friendly setText`

### Task 3: App shell: tabs, theme, settings, to-top

**Files:**
- Create: `src/useHashTab.js`, `src/ui/IconButton.jsx`, `src/App.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `store`, `textStore.setRemember/clearAll` (Task 2)
- Produces:
  - `useHashTab(): tab`. `TABS = ['format','compare','text-to-json','json-to-text','minify','jwt','encode']`; an unknown hash gives `'format'`.
  - `<IconButton icon label onClick disabled className id title/>`: renders the same markup as `iconButton` in `panels.js`, with `<span class="label">` and `aria-label`.
  - `flash(buttonEl, text)`: ported.
  - `App` renders every tool section, always mounted, hidden with `hidden={tab !== X}`, in `main`'s order: format, text-to-json, json-to-text, minify, jwt, encode, compare. Tasks 5–7 fill the sections; for now each is an empty `<section data-tab>`.

Behavior to port from `app.js` `showTab` and `panels.js` theme/settings:
- `aria-current="page"` on the active nav link.
- `document.body.classList.toggle('app', tab !== 'compare')` in an effect.
- When the tab changes, unless focus is already inside the section, focus its first `textarea:not([readonly])` with `{ preventScroll: true }`.
- Theme cycles System → Light → Dark and writes `tjt:theme`. Use `delete documentElement.dataset.theme` for system.
- The settings `<details>` has the remember checkbox (calls `setRemember`) and two-click Clear all (`'Click again to clear every panel'`, reset after 3s, then close the `<details>`).
- To-top shows when `scrollY >= 400`.

- [ ] **Step 1: Write failing tests** in `src/App.test.jsx`:
  - `unknown hash shows format`: `location.hash='#nope'`, render; the format section is visible and the others are `hidden`.
  - `hashchange switches tab and sets aria-current`.
  - `theme button cycles and saves`: click 3 times; `localStorage['tjt:theme']` goes `light`, `dark`, `system`.
  - `clear all needs two clicks`: the first click keeps the text; the second click empties `textStore.get('left')`.
- [ ] **Step 2:** Run `npm test -- App`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `App shell: tabs, theme, settings menu`

### Task 4: Panel, status bar, empty state, drop, Send to

**Files:**
- Create: `src/ui/Panel.jsx`, `src/ui/StatusBar.jsx`, `src/samples.js`, `src/ui/Panel.test.jsx`

**Interfaces:**
- Consumes: `useText`, `textStore.set`, `saveNote`, `setText`, `IconButton`, `jsonStatus`, `formatSize`, `repairJson` (from `tools.js`)
- Produces:
  - `<Panel id label ext="json|txt" tab readOnly? value? onErr children?/>`
    - Editable panels: a `<textarea id spellCheck={false}>` controlled by `useText(id)`, with `onChange` calling `textStore.set`.
    - Read-only output panels: pass `value` (a derived string) and get `<textarea readOnly>`.
    - Format's Pretty view: pass `children` (the `<div id="fmt-out" class="pretty">`) plus `value` for Copy/Download.
    - `onErr(message)` reports clipboard, drop and fix errors to the section's `.err` line.
  - `SAMPLES` (`src/samples.js`): textarea id → string, or `{ left, right }`, verbatim from `app.js`.

Ported behavior (`panels.js` `initPanels`, per panel):
- **Header buttons:** Copy flashes `Copied` / `Copy failed`. Paste and Clear appear only when editable. Download names the file `<label slug>.<ext>`. Every button except Paste is disabled while the text is empty.
- **Send to** appears only on read-only panels. It is a `<select class="send-to">` that lists `SEND_TO` minus this tab. Choosing an option calls `textStore.set(targetId, value)`, sets `location.hash`, focuses the target after the tab shows, and resets the select to index 0.
- **Editor:** a `.editor` that holds an empty `<div class="hl"/>` (Task 8 fills it), the textarea or children, and `.empty`. `.empty` is hidden when there's text. Editable panels show Paste (primary) plus Try a sample when `SAMPLES[id]` exists; an `{left,right}` sample sets both and keeps focus on this panel. Below that: `or drop a file here`. Read-only panels show `The result appears here as you type.`
- **Drop:** only on editable panels, only for `Files`, with the `.dropping` class and the `MAX_DROP` message verbatim.
- **StatusBar:**
  - It is hidden when the text is empty.
  - Its input is debounced with the Global Constraints delays, and `jsonStatus` / repair run inside a `useMemo` keyed on the debounced text, so another panel's edit costs nothing.
  - It shows `✓ Valid JSON` / `✗ Line L, column C: <tidy(message)>`, plus Fix JSON (tried up front only below `MAX_TRY_FIX`) and Go to error (editable only). Port `tidy` verbatim.
  - The meta text is `N lines · size` plus `saveNote(id)`.
  - Fix JSON goes through `setText`, so it can be undone.

- [ ] **Step 1: Write failing tests** in `src/ui/Panel.test.jsx`:
  - `empty editable panel shows Paste and sample, disables Copy/Clear/Download`.
  - `valid JSON shows ✓ Valid JSON with line count`: set `'{"a":1}'`, advance timers 60ms, then the status text contains `✓ Valid JSON` and `1 line`.
  - `broken but fixable JSON offers Fix JSON, and clicking it repairs`: `'{a:1,}'` → click `Fix JSON` → `textStore.get(id)` is valid JSON.
  - `status is not recomputed for another panel's edit`: `vi.mock('../tools.js')` with a spy on `jsonStatus`; render two JSON panels; after the first settles, set the other id; the spy is called only with the other panel's text.
  - `Send to sets the target and switches tab`: read-only panel with value `'x'`, choose `Minify` → `textStore.get('min-in') === 'x'` and `location.hash === '#minify'`.
  - `drop over MAX_DROP shows the size message`.
- [ ] **Step 2:** Run `npm test -- Panel`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Panel component: buttons, status bar, empty state, drop, Send to`

### Task 5: Transform tools (Text → JSON, JSON → Text, Minify, JWT, Encode)

**Files:**
- Create: `src/tools/TransformTool.jsx`, `src/tools/TransformTool.test.jsx`
- Modify: `src/App.jsx` (render the five sections)

**Interfaces:**
- Consumes: `Panel`, `useText`, and `textToJson`, `jsonToText`, `minify`, `decodeJwt`, `jwtTimeNotes`, `base64Encode/Decode`, `urlEncode/Decode` from `tools.js`
- Produces: `<TransformTool tab desc inId inLabel inExt outId outLabel outExt fn toolbar? below?/>`
  - The output is `useMemo(() => fn(input))`. On a throw, the output is `''` and the `.err` line shows `e.message`, unless `inExt === 'json'` (the status bar shows those errors instead).
  - **JWT** passes `below`: the `<ul id="jwt-times" class="jwt-times" aria-live="polite">` of `jwtTimeNotes` with class `bad` for `/^Expired/`, hidden when empty.
  - **Encode** passes `toolbar`: the `#enc-mode` select held in component state; `fn` picks from `ENCODERS[mode]`.
  - Copy every section's description text and labels from `main`'s `index.html`.

- [ ] **Step 1: Write failing tests:**
  - `minify output follows input`: set `min-in` to `'{\n "a": 1\n}'`, then `#min-out` has value `'{"a":1}'`.
  - `text-to-json error shows on the err line`: set `t2j-in` to `'"\\x"'`; `.err` is non-empty and the output is empty.
  - `json-to-text input errors stay off the err line`.
  - `jwt shows expiry notes`: with `SAMPLES['jwt-in']`, the list contains `Expires in`.
  - `encode mode change re-runs`: `'a b'` with `url-encode` gives `'a%20b'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5: Commit** `Port the five transform tools`

### Task 6: JSON Format with the Pretty view

**Files:**
- Create: `src/tools/FormatTool.jsx`, `src/tools/FormatTool.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `Panel` (with `children` and `value`), `jsonLines`, `linesText`
- Produces: the `format` section, with the toolbar (`#fmt-indent`, `#fmt-sort`, `#fmt-expand`, `#fmt-collapse`) and the `#fmt-out.pretty` view.

Behavior (port `build()` from `app.js`):
- The input is debounced 150ms, and an indent or sort change re-renders right away.
- The view produces the same DOM shape as `main`, so CSS and search keep working: `.line` (with `--d`), `.ln`, `.fold` or `.fold-pad`, `.code > span.<cls>`, `.node > (.line, .kids, closing .line)`, and `.summary` with `…<closing>` plus `.hint` ` N keys|key|items|item`.
- The view's `--indent` is `4ch` for tab.
- Fold state is `collapsed: Set<lineIndex>`, reset when `lines` changes. A fold button shows `▸`/`▾` with `aria-expanded` and `aria-label="Fold line N"`.
- Leaf lines are memoised components, so toggling one fold doesn't re-render every leaf.
- Expand all clears the set. Collapse all adds every node with depth > 0, keeping the root open. Collapse all is disabled when no node sits inside another; both buttons are disabled when there are no lines.
- The fold click handler wraps its state update in `flushSync`. The search in Task 8 clicks `.fold` and immediately scrolls to the match, so the DOM must already be open.

- [ ] **Step 1: Write failing tests:**
  - `pretty copy text equals JSON.stringify`: input `'{"b":[1,{"c":2}],"a":null}'`, indent 2 → the Panel Copy value equals `JSON.stringify(v,null,2)` (spy `navigator.clipboard.writeText`).
  - `sort keys A→Z orders keys`.
  - `fold hides kids and keeps line numbers`: click the first nested `.fold`; that `.node` has class `collapsed`; the last `.ln` text is unchanged.
  - `collapse all keeps root open`.
  - `invalid input clears the view and leaves .err empty`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Browser check: paste a ~20,000-line JSON. Folding a node responds in under ~100ms (Performance panel).
- [ ] **Step 6: Commit** `Port JSON Format and the Pretty view`

### Task 7: Compare & Merge

**Files:**
- Create: `src/tools/CompareTool.jsx`, `src/tools/CompareTool.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useText('left'|'right')`, `textStore.set`, `Panel`, `IconButton`, and `diffBlocks`, `applyCopy`, `splitSame`, `normalizeJson`, `jsonStatus` from `tools.js`
- Produces: the `compare` section, with the same DOM ids and classes as `main` (`.inputs`/`.folded`, `#fold-summary`, `#edit-texts`, `#compare-btn`, `#json-mode`, `#prev-diff`, `#next-diff`, `#diff-count`, `#undo`, `#swap`, `#identical`, `.diff-wrap`, `#diff`, `#locbar`, `.row`, `.ln`, `.txt del|add|gap`, `.act`, `.change`, `.block-head`, `.expand`, `.hidden-lines`, `.tick`, `.view`, `.hint-keys`).

State model:
- `result = { left, right, blocks } | null` holds the texts the diff was made from.
- The diff is stale whenever `result.left !== left || result.right !== right`. Typing, Send to, Paste and samples all count. An effect on `[left, right]` clears `result` and the undo history when the diff is stale. This replaces `main`'s input listener.
- `history = useRef([])` is capped at `MAX_UNDO`. `current` is an index, `-1` for none. `pendingFocus` is the index to focus after the next commit.
- `compare(focusIndex?)` takes `l`, `r` (default: current texts), sets `result` from `diffBlocks(l, r)`, and sets `pendingFocus`. A thrown error clears the diff and goes to `.err`.
- Copy, Undo, Swap and Compare-as-JSON each:
  1. snapshot `{left, right}` (Undo pops instead),
  2. compute the new texts,
  3. `textStore.set` both sides,
  4. call `compare(index, newLeft, newRight)` in the same handler, so the result matches the new texts and the stale effect leaves it alone.
- A `useLayoutEffect` on `pendingFocus` runs `go(i, false)`: it marks `.change.current`, sets the count to `i+1 of n`, and focuses the change's first button with `preventScroll`.
- Folding: when `total > 0`, `.inputs.folded` and the summary `Left · N lines    Right · N lines`. Edit texts unfolds it and focuses `left`.
- The location bar keeps its imperative measurement:
  - `useLayoutEffect` after each render, a `ResizeObserver` on `#diff`, `resize` and the `⋯` expand all set the `ticks` state: `{ top%, height% }` per `.change`, from `offsetTop / diff.offsetHeight`.
  - `scroll` updates the `.view` box straight through a ref, with no state change.
  - Clicking a tick calls `go(i)`. Clicking the bar scrolls proportionally.
- The `⋯ N unchanged lines` button expands its block through a state Set of expanded block indices, using `flushSync`, for the same reason as Task 6.
- Keyboard: a document `keydown` effect, ignored when the section is hidden or `document.activeElement` is inside a textarea, input or select. Alt+↓/↑/→/← and Ctrl/⌘+Z (only when there is history) behave as on `main`.
- Copy the `Compare as JSON` error message verbatim.
- Compare and Swap are disabled when both sides are empty.

- [ ] **Step 1: Write failing tests:**
  - `copy every block right makes sides identical`: `CONFIG_A`/`CONFIG_B`, click Compare, click every `Block ⇒` (re-query after each), then `get('left') === get('right')` and `#identical` shows `✓ The left and right texts are identical.`
  - `undo restores before the copy`.
  - `setting left from outside clears diff and undo`: compare, copy one, then `textStore.set('left', 'z')` → `#diff` is empty and `#undo` is disabled.
  - `compare as JSON rewrites both sides and undo restores originals`: `'{"b":1,"a":2}'` vs `'{"a":2,"b":1}'` → identical; Undo → the originals come back.
  - `invalid JSON in compare-as-JSON names the side`: the message starts `Left side is not valid JSON`.
  - `long unchanged run collapses and the counter skips hidden lines`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Browser check: the ticks line up with the changes, the view box follows scrolling, and Alt+arrows work while focus is on a diff button.
- [ ] **Step 6: Commit** `Port Compare & Merge`

### Task 8: Search and page-wide listeners

**Files:**
- Create: `src/ui/SearchBox.jsx`, `src/globals.js`
- Modify: `src/App.jsx` (a `<SearchBox>` in each section's `.toolbar`, creating the toolbar where a section has none, as `initSearch` does), `src/main.jsx` (call `installGlobalListeners()` once), `src/style.css`

**Interfaces:**
- Consumes: `findAll`, `setText`, `textStore`
- Produces:
  - `<SearchBox sectionRef version/>`. `version` is any value that changes when the section's text or diff changes. Pass the section's texts plus a render counter from Format and Compare.
  - `installGlobalListeners(): void`

Port `initSearch` and run it imperatively against `sectionRef.current`:
- The box, the Aa/ab/.* toggles (component state) and the `role="status"` count.
- `run()` fills each visible textarea's React-rendered empty `.hl` div with `[text, <br>]` through DOM calls (React renders that div with no children, so this is safe). It sizes the div to `clientWidth` × `clientHeight`, mirrors the scroll position (a scroll listener added once per textarea), and collects `Range`s over `.diff .txt` and `.pretty .code > span:not(.summary)`.
- `CSS.highlights` `find` and `find-current`, only when `canPaint`.
- `go(step)`: inside `flushSync`, clicks the closed `.hidden-lines` expander and the `.fold` buttons of collapsed `.node`s, then scrolls.
- Re-run triggers: an effect on `version` (debounced 150ms, only when the box has text and the section is visible), `resize`, `hashchange`, and box focus.
- Messages verbatim: `Invalid regex`, `No matches`, `N matches`, `2000+`, `i of n`.
- CSS: replace the `.editor.searching` selectors with `.editor:has(> .hl:not(:empty))`, so no class is toggled on a React-owned node. `.hl` keeps the textarea's font, padding and wrapping.

`installGlobalListeners` ports these `panels.js` listeners verbatim:
- the window `dragover`/`drop` guard for `Files`,
- Ctrl/⌘+F, which focuses `section:not([hidden]) input[type="search"]`,
- the `beforeinput` history guard (`e.inputType.startsWith('history') && e.target !== document.activeElement`),
- paste-anywhere, which goes to the first empty editable textarea of the visible section, through `setText(t.id, text)`.

- [ ] **Step 1: Write failing tests** (`src/ui/SearchBox.test.jsx`, mounting `App`):
  - `counts matches in the visible panels`: `fmt-in = '{"a":"aa"}'`, wait for the Format render, type `a` in the format search box → `6 matches`: 3 in the textarea, plus 1 in the key span `"a"` and 2 in the value span `"aa"`. `canPaint` is false in jsdom, so only the count is tested. jsdom may not have `checkVisibility`, so port the check as `t.checkVisibility?.() ?? !t.closest('[hidden]')`.
  - `invalid regex says so`: toggle `.*`, type `(` → `Invalid regex`, and the box has `aria-invalid`.
  - `paste outside a field goes to the first empty input`: dispatch a `paste` event on `document.body` with clipboardData `'x'` on the compare tab → `get('left') === 'x'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5: Commit** `Port search and page-wide shortcuts`

### Task 9: Remove the old app, update docs, full browser check

**Files:**
- Delete: `app.js`, `panels.js`, `vendor/` (fonts already moved)
- Modify:
  - `README.md`: the Run locally, Test, Deploy and Project layout sections.
  - `CLAUDE.md`: Commands; Architecture rewritten for `src/`; drop the import-map/vendor jsdiff section; keep the Compare and Format invariants with the new file names; add the textStore / `setText` rule ("never `t.value = …` plus a synthetic input event: React ignores it, so go through `textStore.set`").
  - `docs/superpowers/specs/2026-11-07-text-json-tools-design.md:23`: "No build step" → "Built with Vite (`npm run build`). GitHub Actions deploys `dist/` to GitHub Pages on every push to `main`; `dist/` also works on any static host."
  - The Deploy sections of README and CLAUDE.md: "Push to `main`; `.github/workflows/deploy.yml` runs the tests, builds and publishes to Pages. Failing tests block the deploy."

- [ ] **Step 1:** Delete the old files, then run `grep -rn "panels.js\|app.js\|vendor/" --include=*.md --include=*.js --include=*.jsx --include=*.html . | grep -v node_modules | grep -v docs/superpowers/plans`. Expected: only the intended historical mentions in the old plan or spec.
- [ ] **Step 2:** Update the three docs as listed.
- [ ] **Step 3:** Run `npm test && npm run build`. Expected: everything passes and the build succeeds.
- [ ] **Step 4: Browser check** on `npm run preview`, in a fresh tab, using Playwright or by hand. Each item must behave as on `main`:
  - Paste and Clear in `fmt-in`, then Cmd/Ctrl+Z restores the previous text (Review Focus 2).
  - Type in the search box, press Cmd/Ctrl+Z a few times: the panel text is untouched (Review Focus 4).
  - With a 10 MB broken JSON in `fmt-in`, typing in Minify stays smooth (Review Focus 1).
  - Drop a 5,000-line file on `left`: it lands (Review Focus 3).
  - Search highlights line up in a textarea, in the Pretty view and in the diff. A match inside a folded node opens it.
  - With the theme set to Dark and a reload, there's no light flash.
  - A JWT is never in `localStorage` (DevTools → Application).
  - Dropping a file outside a panel doesn't navigate away.
  - The layout works on mobile width (375px).
  - There are no console errors.
- [ ] **Step 5:** Serve `dist/` from a sub-path (`mkdir -p /tmp/x/sub && cp -r dist/* /tmp/x/sub && python3 -m http.server -d /tmp/x 8002`, then open `/sub/`). Fonts and JS load, which proves `base: './'` works.
- [ ] **Step 6: Commit** `Remove the pre-React app and update docs`

### Task 10: Deploy with GitHub Actions

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm ci`, `npm test`, `npm run build` → `dist/` (Tasks 1, 9)

The workflow:
- **Triggers:** `push` to `main`, plus `workflow_dispatch`. Also run on `pull_request` to `main`, but there only the test and build steps run, without deploying.
- **Permissions:** `contents: read`, `pages: write`, `id-token: write`. `concurrency: { group: pages, cancel-in-progress: false }`.
- **Job `build`** (ubuntu-latest):
  1. `actions/checkout@v7`
  2. `actions/setup-node@v7` with `node-version: 24`, `cache: npm`
  3. `npm ci`
  4. `npm test`
  5. `npm run build`
  6. `actions/configure-pages@v6`
  7. `actions/upload-pages-artifact@v5` with `path: dist`

  Steps 6 and 7 are skipped on `pull_request`.
- **Job `deploy`:** `needs: build`, `if: github.event_name != 'pull_request'`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`. Runs `actions/deploy-pages@v5` with `id: deployment`.
- The site lives at `/text-json-tools/`. `base: './'` (Task 1) already makes every asset URL relative, so no base flag is needed.

- [ ] **Step 1:** Write `.github/workflows/deploy.yml` as above.
- [ ] **Step 2:** Push the branch and open the PR. Expected: the workflow's `build` job runs on the PR and passes, and `deploy` is skipped.
- [ ] **Step 3: Commit** `Deploy to GitHub Pages with GitHub Actions` (before Step 2's push)
- [ ] **Step 4: At merge time** (ask the user first; this changes the live site):
  1. Switch the Pages source: `gh api -X PUT repos/vanmanh49/text-json-tools/pages -f build_type=workflow`. The current site stays up until the next deployment.
  2. Merge the PR.
  3. Watch the run: `gh run watch`. Expected: `build` and `deploy` succeed.
  4. Open `https://vanmanh49.github.io/text-json-tools/` in a fresh tab: every tool works, there are no 404s for fonts or JS, and `#compare` deep links work.
  5. **Rollback** if it fails: `gh api -X PUT repos/vanmanh49/text-json-tools/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'`, then revert the merge.
