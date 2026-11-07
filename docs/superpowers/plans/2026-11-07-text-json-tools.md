# Text & JSON Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static website with four browser-only tools: Text → JSON (unescape), JSON → text (escape), JSON simplify (minify), and text Compare & merge.

**Architecture:** Pure logic lives in `tools.js` (no DOM) and is unit-tested with `node --test`. `app.js` only wires the DOM to those functions. `index.html` loads jsdiff through an import map, so the browser and Node both import the bare specifier `"diff"`.

**Tech Stack:** HTML, CSS, vanilla JS ES modules, jsdiff `diff@9.0.0`, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-07-text-json-tools-design.md`

## Global Constraints

- No build step. Static files deployable to GitHub Pages / Netlify as they are.
- The only dependency is `diff@9.0.0`. The browser loads it from `https://cdn.jsdelivr.net/npm/diff@9.0.0/libesm/index.js` via an import map, and Node gets it as a devDependency of the same version.
- `package.json` sets `"type": "module"` and `"test": "node --test"`.
- No backend, accounts, history, share links, file upload, or analytics.
- Works at phone width (16px side gutter, no horizontal page scroll), light and dark theme.
- Tabs come from the URL hash: `#text-to-json`, `#json-to-text`, `#minify`, `#compare`. An empty or unknown hash shows `#text-to-json`.
- Invalid input to a tool makes it throw an `Error`. The UI clears the output and shows `err.message`.
- Code comment at the JSON functions: `// shortcut: JSON.parse loses precision above 2^53 and keeps only the last duplicate key; swap in a lossless parser if users hit it.`

## Review Focus

1. **Whitespace-only input** (a pasted blank line) to the JSON tools → returns `''` and shows no error. Pinned in Task 1.
2. **Trailing-newline mismatch in Compare** (`'a\nb'` vs `'a\nb\n'`) → merge all-left reproduces left exactly, and all-right reproduces right exactly. Pinned in Task 2.
3. **One side empty in Compare** → one change block, and the merge reproduces the chosen side. Pinned in Task 2.
4. **HTML or markup in the compared text** (`<b>x</b>`) → shown literally in the diff view, never parsed as HTML. Rendering uses `textContent`. Pinned in Task 4.
5. **Unicode and emoji** survive a JSON → text → JSON round trip unchanged. Pinned in Task 1.

---

### Task 1: Project setup + JSON functions

**Files:**
- Create: `package.json`, `.gitignore` (`node_modules/`), `tools.js`, `tools.test.js`

**Interfaces:**
- Produces, exported from `tools.js`:
  - `textToJson(s: string): string`
  - `jsonToText(s: string): string`
  - `minify(s: string): string`

- [ ] **Step 1: Create `package.json` and install**

`{"name":"text-json-tools","private":true,"type":"module","scripts":{"test":"node --test"},"devDependencies":{"diff":"9.0.0"}}`, then run `npm install`.

- [ ] **Step 2: Write the failing tests in `tools.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToJson, jsonToText, minify } from './tools.js';

test('textToJson unescapes a quoted string', () => {
  assert.equal(textToJson(String.raw`"{\"name\":\"Ann\",\"age\":3}"`), '{\n  "name": "Ann",\n  "age": 3\n}');
});
test('textToJson handles escaped JSON without outer quotes', () => {
  assert.equal(textToJson(String.raw`{\"a\":1}`), '{\n  "a": 1\n}');
});
test('textToJson pretty-prints plain JSON', () => {
  assert.equal(textToJson('{"a":1}'), '{\n  "a": 1\n}');
});
test('textToJson throws on invalid input', () => {
  assert.throws(() => textToJson('nope'));
});
test('empty or whitespace-only input returns empty string', () => {
  for (const f of [textToJson, jsonToText, minify]) {
    assert.equal(f(''), '');
    assert.equal(f('  \n\t '), '');
  }
});
test('jsonToText escapes into one string literal', () => {
  assert.equal(jsonToText('{ "name": "Ann" }'), String.raw`"{\"name\":\"Ann\"}"`);
});
test('jsonToText -> textToJson round trip keeps unicode', () => {
  const x = '{"emoji":"😀","vi":"Tiếng Việt","nested":{"a":[1,2]}}';
  assert.equal(textToJson(jsonToText(x)), JSON.stringify(JSON.parse(x), null, 2));
});
test('jsonToText throws on invalid input', () => {
  assert.throws(() => jsonToText('{a:1}'));
});
test('minify puts JSON on one line', () => {
  assert.equal(minify('{\n  "a": [1, 2],\n  "b": "x y"\n}'), '{"a":[1,2],"b":"x y"}');
});
test('minify throws on invalid input', () => {
  assert.throws(() => minify('{"a":'));
});
```

- [ ] **Step 3: Run `npm test`**. It should FAIL because `tools.js` does not exist yet.

- [ ] **Step 4: Implement the three functions in `tools.js`**

Follow the algorithms in the spec's "Functions" section exactly. Trimmed input that is empty returns `''`. In `textToJson`, the no-outer-quotes retry runs only when the first parse fails and the input contains `\"`. If that retry also fails, rethrow the **first** error, because it describes the user's input. Add the shortcut comment from Global Constraints.

- [ ] **Step 5: Run `npm test`**. Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore tools.js tools.test.js
git commit -m "Add JSON escape, unescape and minify functions"
```

---

### Task 2: Diff blocks + merge

**Files:**
- Modify: `tools.js`, `tools.test.js`

**Interfaces:**
- Consumes: `diffLines` from `"diff"`
- Produces, exported from `tools.js`:
  - `diffBlocks(left: string, right: string): Block[]`, where `Block = {type:'same', text:string} | {type:'change', left:string, right:string}`
  - `merge(blocks: Block[], choices: ('left'|'right')[]): string`. `choices[i]` belongs to the i-th **change** block (same blocks are not counted). A missing entry means `'right'`.

- [ ] **Step 1: Add the failing tests**

```js
import { diffBlocks, merge } from './tools.js';

test('identical texts give only same blocks', () => {
  assert.deepEqual(diffBlocks('a\nb\n', 'a\nb\n'), [{ type: 'same', text: 'a\nb\n' }]);
});
test('replacement is one change block', () => {
  assert.deepEqual(diffBlocks('a\nb\nc\n', 'a\nB\nc\n'), [
    { type: 'same', text: 'a\n' },
    { type: 'change', left: 'b\n', right: 'B\n' },
    { type: 'same', text: 'c\n' },
  ]);
});
test('pure addition and pure deletion', () => {
  assert.deepEqual(diffBlocks('a\n', 'a\nd\n'), [{ type: 'same', text: 'a\n' }, { type: 'change', left: '', right: 'd\n' }]);
  assert.deepEqual(diffBlocks('a\nd\n', 'a\n'), [{ type: 'same', text: 'a\n' }, { type: 'change', left: 'd\n', right: '' }]);
});
test('merge defaults to right, all-left gives left', () => {
  const L = 'a\nb\nc\n', R = 'a\nB\nc\nd\n';
  const blocks = diffBlocks(L, R);
  const n = blocks.filter(b => b.type === 'change').length;
  assert.equal(merge(blocks, []), R);
  assert.equal(merge(blocks, Array(n).fill('left')), L);
});
test('merge picks per block', () => {
  const blocks = diffBlocks('a\nb\nc\nx\n', 'a\nB\nc\ny\n');
  assert.equal(merge(blocks, ['left', 'right']), 'a\nb\nc\ny\n');
});
test('trailing newline mismatch round-trips exactly', () => {
  const L = 'a\nb', R = 'a\nb\n';
  const blocks = diffBlocks(L, R);
  const n = blocks.filter(b => b.type === 'change').length;
  assert.equal(merge(blocks, Array(n).fill('left')), L);
  assert.equal(merge(blocks, []), R);
});
test('one side empty', () => {
  const blocks = diffBlocks('', 'x\ny\n');
  assert.deepEqual(blocks, [{ type: 'change', left: '', right: 'x\ny\n' }]);
  assert.equal(merge(blocks, ['left']), '');
});
```

- [ ] **Step 2: Run `npm test`**. The new tests should FAIL because the functions are not exported yet.

- [ ] **Step 3: Implement `diffBlocks` and `merge` in `tools.js`**

Go through the `diffLines(left, right)` parts, skipping any part whose `value` is `''`. A part that is neither `added` nor `removed` becomes a same block. Otherwise, append its `value` to the open change block's `left` (removed) or `right` (added), and open a new block if the last block is not a change block. This merges a removed run followed by an added run into one block. `merge` concatenates same blocks' `text` and each change block's chosen side.

- [ ] **Step 4: Run `npm test`**. Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tools.js tools.test.js
git commit -m "Add line diff blocks and merge"
```

---

### Task 3: Page shell, tabs and the three JSON tools

**Files:**
- Create: `index.html`, `style.css`, `app.js`

**Interfaces:**
- Consumes: `textToJson`, `jsonToText`, `minify` from `./tools.js`
- Produces DOM contract (used by Task 4):
  - Nav links `<a href="#<tab>">` for the four tab names.
  - One `<section data-tab="<tab>" hidden>` per tab. `app.js` removes `hidden` from the section matching `location.hash` (falling back to `text-to-json`) on load and on `hashchange`, and sets `aria-current="page"` on the active nav link.
  - Each JSON section contains a labelled `textarea.in`, a labelled `textarea.out[readonly]`, `button.copy`, and `p.err[role=alert]`.
  - `copy(text: string, button: HTMLButtonElement)` helper in `app.js`: `navigator.clipboard.writeText`, then the button reads "Copied" for 1.5s.

- [ ] **Step 1: Write `index.html`**

Title "Text & JSON Tools", viewport meta, `<link rel="stylesheet" href="style.css">`, and the import map `{"imports":{"diff":"https://cdn.jsdelivr.net/npm/diff@9.0.0/libesm/index.js"}}` **before** `<script type="module" src="app.js">`. Write the sections from the DOM contract. Leave the compare section empty for Task 4. Each section starts with a one-line description of the tool, using the spec's Goal wording.

- [ ] **Step 2: Write `style.css`**

Color tokens on `:root`, redefined under `@media (prefers-color-scheme: dark)`, and an explicit `body` background. Monospace textareas, `width:100%`, resize vertical. The input and output sit side by side at ≥ 800px and stack below that. Tints for the diff (Task 4): `--del` red-ish, `--add` green-ish, `--same` muted.

- [ ] **Step 3: Write `app.js` for tabs and JSON tools**

Use a map `{ 'text-to-json': textToJson, 'json-to-text': jsonToText, 'minify': minify }`. On each `input` event: try `out.value = fn(in.value); err.textContent = ''`, catch `out.value = ''; err.textContent = e.message`.

- [ ] **Step 4: Verify in a browser**

Run `python3 -m http.server 8000` (ES modules need http://). Open `http://localhost:8000` and check:
- The page loads with the Text → JSON tab, and the console has no errors. In the network panel, the diff module loads with a 200 status.
- Pasting `"{\"name\":\"Ann\"}"` into Text → JSON gives pretty JSON.
- Typing `{a` shows a parse error and an empty output.
- `#minify` in the URL switches the tab. Unknown `#zzz` shows Text → JSON.
- Copy puts the output on the clipboard.
- At 375px width there is no horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css app.js
git commit -m "Add page shell, tabs and JSON tool UI"
```

---

### Task 4: Compare & merge UI

**Files:**
- Modify: `index.html` (compare section), `app.js`, `style.css` (diff rows)

**Interfaces:**
- Consumes: `diffBlocks`, `merge` from `./tools.js`; the `copy` helper and section contract from Task 3
- Produces DOM in `section[data-tab=compare]`: `textarea#left`, `textarea#right` (labelled), `button#compare-btn`, `div#diff`, `textarea#merged[readonly]`, `button.copy`, `p.err[role=alert]`

- [ ] **Step 1: Add the compare markup to `index.html`**

- [ ] **Step 2: Implement compare in `app.js`**

On Compare: `blocks = diffBlocks(left.value, right.value)`, set `choices = []`, then render. Each same block is a `<pre class="same">`. Each change block is a row with `<pre class="del">` (left text), `<pre class="add">` (right text), and buttons "Use left" / "Use right". The active choice gets `aria-pressed="true"`, and the default is right. A click sets `choices[i]`, re-renders the pressed state, and updates `merged.value = merge(blocks, choices)`. **Set all text with `textContent`, never `innerHTML`.** An `input` event on `#left` or `#right` clears `#diff` and `#merged`. If both sides are identical, show "No differences" in `#diff` and set `merged.value = left.value`.

- [ ] **Step 3: Style the diff rows in `style.css`**

`pre` elements wrap (`white-space: pre-wrap`) and show the change tints. On mobile, the left and right sides stack.

- [ ] **Step 4: Verify in a browser**

- Left `a\nb\nc`, right `a\nB\nc\nd` → two change blocks, and merged equals right.
- Clicking "Use left" on block 1 → merged is `a\nb\nc\nd`.
- Left `<b>x</b>` and right `<i>y</i>` → the diff shows the literal tags (Review Focus 4).
- Editing an input clears the diff.
- Copy on merged works.
- At 375px width the rows stack and there is no horizontal scroll.
- Run `npm test`. It still passes.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js style.css
git commit -m "Add compare and merge UI"
```
