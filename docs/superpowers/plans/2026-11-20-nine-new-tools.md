# Nine New Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the tab bar, then add eight new tabs (Line Tools, Timestamp, Hash, Regex Tester, JSON ⇄ CSV, JSON → TypeScript, YAML ⇄ JSON, JSON Query) and six Encode/Decode modes (Hex, HTML entities, Unicode escapes).

**Architecture:** Every tool is a `TransformTool` wrapper (one input panel → pure function in `tools.js` → read-only output panel) with its options in the toolbar, the way `Encode` already works. Task 3 lets `TransformTool` take an async function, which Hash (`crypto.subtle`) and the two lazily imported libraries (YAML, JSONPath) use. Library-backed functions in `tools.js` take the library module as a parameter, so `tools.js` keeps no imports and the components do the lazy `import()`.

**Tech Stack:** React 19, Vite, Vitest + jsdom + Testing Library. New runtime dependencies (Tasks 7 and 8 only): `js-yaml@5.5.0`, `jsonpath-plus@11.3.0`.

**Spec:** `docs/superpowers/specs/2026-11-07-text-json-tools-design.md`. This plan carries the design of the new tools, because the user skipped the design round. Each task copies its tool's behaviour into the spec's UI section, so the spec stays the authority.

## Global Constraints

- Browser only: no request leaves the page. The new libraries are bundled from npm and loaded with `import()` into their own chunks, like `jsqr`.
- Logic lives in `src/tools.js` as pure functions with no DOM. Invalid input throws `Error` with a message a person can act on. Empty or whitespace-only input returns `''` (async ones resolve to `''`). Tests go in `src/tools.test.js` (`test` + `node:assert/strict`, as in the existing tests).
- Dependency versions are exact (`"js-yaml": "5.5.0"`, no `^`), matching `package.json`'s current style. Update the spec's Constraints dependency list when one is added.
- User text is only ever a JSX text child or a textarea value. No `innerHTML` / `dangerouslySetInnerHTML`.
- Text goes through `textStore` / `setText` (see CLAUDE.md). Toolbar options (mode, path, pattern) are plain `useState` and are not saved.
- Any input box that may hold secrets goes in `PRIVATE_IDS` (`src/textStore.js`).
- The tool's `.err` line stays empty for JSON input panels (`inExt="json"`), because their status bar shows the parse error.
- Commit messages carry no AI attribution (user's global CLAUDE.md).
- One branch and one PR per task, off the latest `main` (`git switch -c tool/<tab>`), merged before the next starts. `npm test` and `npm run build` pass before each PR.

**Wiring a new tab** (every tool task from 2 on does all of these; "wire it" below means this list):
1. A wrapper component in `src/tools/TransformTool.jsx`, exported, following `Encode`.
2. An entry `[tab, label, group]` in `NAV` (`src/useHashTab.js`), placed in its group's run.
3. An entry in `TOOLS` (`src/App.jsx`) and in the import line.
4. The input id in `EDITABLE_IDS` (`src/textStore.js`), and in `PRIVATE_IDS` when the task says so.
5. A sample in `SAMPLES` (`src/samples.js`).
6. Reset the new input id in `afterEach` of `src/tools/TransformTool.test.jsx`.
7. The spec: a `- **Name (`#tab`):**` bullet in the UI section, the function in the Functions section, the tool count in the Goal line. CLAUDE.md: the tool list in "What this is" and the `tools.js` function list.

## Review Focus

1. **Stale async output.** Typing fast in Hash, or switching YAML direction mid-load, must never show the result for older text. Test in Task 3.
2. **CSV fields with the delimiter, quotes, newlines and CRLF.** JSON → CSV → JSON must round-trip them byte for byte. Test in Task 5.
3. **Characters outside the Basic Multilingual Plane (emoji) and Vietnamese text** in Hex, Unicode escapes, Hash and line sorting. Tests in Tasks 1, 2 and 3.
4. **Ambiguous timestamps.** 10 digits read as seconds, 13 as ms. A date with no zone is read as local time. The output says which reading it used. Test in Task 2.
5. **Switching an option keeps the input text.** Direction or mode pickers change only the function, never the input panel's text. Test in Task 5 (CSV direction); the other pickers share the same pattern.

---

### Task 0: Grouped tab bar

18 tabs can't fit in one row, so the strip becomes one menu per group.

**Files:**
- Modify: `src/useHashTab.js` (NAV gets a group)
- Modify: `src/App.jsx:90-100` (nav and picker)
- Modify: `src/style.css` (nav rules and the 1250 px / 1480 px media queries)
- Modify: `src/App.test.jsx`
- Modify: the spec's **Shell** bullet

**Interfaces:**
- Produces: `NAV: [tab, label, group][]` and `GROUPS: string[]` (unique groups in NAV order), both exported from `src/useHashTab.js`. Groups are `'JSON'`, `'Text'`, `'Encode'`, `'More'`.

Existing tools by group, in this order:
- JSON: format, minify, text-to-json, json-to-text
- Text: compare, html
- Encode: encode, jwt
- More: uuid, qr

`format` stays first in NAV, so it is still the default tab.

- [ ] **Step 1: Write the failing tests** in `src/App.test.jsx`
  - Change `expect(hiddenTabs(container)).toHaveLength(9)` to `toHaveLength(NAV.length - 1)` (import `NAV`), so later tasks don't touch it.
  - `test('nav shows one menu per group, the current one named after the tool')`: at `#format`, the text of `nav details.menu > summary` is `['JSON Format', 'Text', 'Encode', 'More']`. At `#jwt` it is `['JSON', 'Text', 'JWT Decode', 'More']`.
  - `test('picking a tool in a group menu closes it')`: open the Encode group's `details`, click `a[href="#jwt"]`, and `open` is `false`.
  - The existing `nav a[aria-current="page"]` test must pass unchanged, because the links now sit inside the group menus.
  - `test('tool picker lists tools under group headings')`: `.tools-menu .tool-group` texts equal `GROUPS`.
- [ ] **Step 2: Run** `npx vitest run src/App.test.jsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - In `<nav>`, render one `<details className="menu group">` per group. The summary shows the current tool's label when the current tab is in that group, otherwise the group name. A summary in the current group gets `className="current"`, rendered by React from `tab`. Inside each menu, a `.menu-body.tool-list` holds the group's links with `aria-current` as now. A link's `onClick` closes its own `details` (`e.currentTarget.closest('details').open = false`).
  - The `.tools-menu` picker keeps its summary and puts a `<p className="tool-group">{group}</p>` before each group's links.
  - The existing outside-click/Escape handler already covers every `details.menu`.
  - CSS: the strip now fits at any width above 700 px. Drop the `nav { display: none }` / `.tools-menu { display: block }` lines from the 1250 px query (keep its icon-only panel button rules), move them into the 700 px query, and delete the 1251–1480 px query. Style `nav summary.current` like today's `nav a[aria-current="page"]`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Check in a browser** (`npm run dev`) at 1400, 900 and 390 px. The strip shows four menus above 700 px and the picker at 700 px and below, with no horizontal page scroll.
- [ ] **Step 6: Update the spec's Shell bullet** (groups, menus, the 700 px breakpoint) and **commit:** `git commit -am "Group the tool tabs into JSON, Text, Encode and More menus"`.

---

### Task 1: Encode/Decode: Hex, HTML entities, Unicode escapes

**Files:** Modify `src/tools.js` (next to `base64Decode`), `src/tools.test.js`, and `src/tools/TransformTool.jsx` (`ENCODERS`, `<option>`s, `desc`). Update the spec's Encode / Decode bullet.

**Interfaces:**
- Produces: `hexEncode(s)`, `hexDecode(s)`, `htmlEscape(s)`, `htmlUnescape(s)`, `unicodeEscape(s)`, `unicodeUnescape(s)`, each `string → string`.
- Pull the `TextDecoder('utf-8', { fatal: true })` step and its "isn't UTF-8 text" error out of `base64Decode` into a private `utf8(bytes)` helper. `base64Decode` and `hexDecode` both use it.

Rules:
- `hexEncode`: the UTF-8 bytes as lowercase hex with no separators.
- `hexDecode`: ignores whitespace, `:`, `,`, `-` and `0x` prefixes, and accepts either case. Characters other than hex digits throw `'This is not valid hex.'`. An odd digit count throws `'Hex needs two digits per byte.'`. Non-UTF-8 bytes get the shared UTF-8 error.
- `htmlEscape`: `& < > " '` → `&amp; &lt; &gt; &quot; &#39;`.
- `htmlUnescape`: decodes `&#123;` and `&#x1F600;` (code points above 0x10FFFF stay as written) and these named entities: `amp lt gt quot apos nbsp copy reg trade hellip mdash ndash lsquo rsquo ldquo rdquo laquo raquo euro pound yen cent deg times divide middot bull`. Unknown entities stay as written. It decodes one pass only and never throws. Add `// shortcut: only common named entities; add a full table if users paste others.`
- `unicodeEscape`: every UTF-16 code unit above 0x7E → `\uXXXX` (lowercase hex). Everything else stays as is.
- `unicodeUnescape`: decodes `\uXXXX` and `\u{X…}` (1–6 hex digits, ≤ 0x10FFFF). Malformed sequences stay as written. Never throws.
- New `<option>`s after URL decode: `hex-encode` "Hex encode", `hex-decode` "Hex decode", `html-escape` "HTML escape", `html-unescape` "HTML unescape", `unicode-escape` "Unicode escape", `unicode-unescape` "Unicode unescape". New `desc`: "Encode or decode Base64, URL, hex, HTML entities and Unicode escapes. Characters from any language are handled as UTF-8."

- [ ] **Step 1: Write the failing tests** in `src/tools.test.js`
  - `hexEncode('Hi é😀') === '486920c3a9f09f9880'`. `hexDecode` of that, of `'48:69 20 C3A9 0xf0 0x9f 0x98 0x80'`, and of the same with `-` and `,` separators all equal `'Hi é😀'`.
  - `hexDecode('486')` throws `/two digits/`, `hexDecode('zz')` throws `/not valid hex/`, and `hexDecode('ff')` throws `/isn't UTF-8/`.
  - ``htmlEscape(`<a href="x">Tom & Jerry's</a>`) === '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;'``, and `htmlUnescape` of that gives the original back.
  - `htmlUnescape('&amp;lt; &#233; &#x1F600; &copy; &bogus; &#x110000;') === '&lt; é 😀 © &bogus; &#x110000;'`.
  - `unicodeEscape('é😀a\n') === '\\u00e9\\ud83d\\ude00a\n'`. `unicodeUnescape` gives the original back. `unicodeUnescape('\\u{1F600} \\u12 \\u{110000}') === '😀 \\u12 \\u{110000}'`.
  - Extend the existing empty-input test loop with all six.
- [ ] **Step 2: Run** `npx vitest run src/tools.test.js`. Expected: FAIL, the functions aren't exported.
- [ ] **Step 3: Implement** the six functions and the `utf8` helper, then add the `ENCODERS` entries, `<option>`s and `desc`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Update the spec and CLAUDE.md** (Encode bullet, function list) and **commit:** `"Add hex, HTML entity and Unicode escape modes to Encode / Decode"`.

---

### Task 2: Line Tools and Timestamp

These are two tabs in one task because both are small sync wrappers. Make one commit per tool on the same branch.

**Files:** `src/tools.js`, `src/tools.test.js`, `src/tools/TransformTool.jsx`, `src/tools/TransformTool.test.jsx`, and the wiring files.

**Interfaces:**
- Produces: `LINE_OPS: [op, label][]`, `lineTool(s, op) → string`, `describeTime(s, now = Date.now()) → string`.
- Consumes: the private `span(sec)` helper already in `tools.js`.

**Line Tools.** Tab `lines`, label `'Line Tools'`, group Text. Ids `lines-in` / `lines-out` (`txt`), mode `<select id="lines-mode">`. Description: "Sort, dedupe, trim or change the case of lines."
- `LINE_OPS = [['sort','Sort A → Z'], ['sort-desc','Sort Z → A'], ['unique','Remove duplicates'], ['reverse','Reverse order'], ['trim','Trim spaces'], ['no-empty','Remove empty lines'], ['upper','UPPERCASE'], ['lower','lowercase']]`.
- Split on `/\r?\n/`, drop one final empty line (left by a trailing newline), apply the op, join with `'\n'`.
- Sort uses `a.localeCompare(b, undefined, { numeric: true })`. `unique` keeps the first of exact duplicates. `no-empty` drops lines that are empty or whitespace only. An unknown op throws.

**Timestamp.** Tab `time`, label `'Timestamp'`, group More. Ids `time-in` / `time-out` (`txt`). Toolbar: a **Now** button that calls `setText('time-in', String(Math.floor(Date.now() / 1000)))`. Description: "Convert a Unix timestamp to a date, or a date to a timestamp."
- Input that is all digits (optional `-`, optional decimal) is a timestamp, read by its absolute value: below 1e11 as seconds, below 1e14 as ms, below 1e17 as µs, otherwise as ns. Any other input goes to `Date.parse`. `NaN` throws `"This isn't a Unix timestamp or a date this browser can read."`.
- The output is exactly these lines, each label padded to 14 characters:
  ```
  Read as       Unix seconds | Unix milliseconds | Unix microseconds | Unix nanoseconds | date text (local time unless it names a zone)
  Unix seconds  <Math.floor(ms / 1000)>
  Unix ms       <ms>
  ISO 8601      <toISOString()>
  UTC           <toUTCString()>
  Local         <new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(date)>
  Relative      <span> ago | in <span> | now
  ```

- [ ] **Step 1: Write the failing tests**
  - `lineTool('b\nItem10\na\nitem2\nItem1\n', 'sort') === 'a\nb\nItem1\nitem2\nItem10'`.
  - `sort-desc` gives the exact reverse of that. `lineTool('x\r\ny\r\nx', 'unique') === 'x\ny'`.
  - `lineTool(' a \n\n  \nb', 'no-empty') === ' a \nb'`. `trim` gives `'a\n\n\nb'`.
  - `lineTool('ả\nă\na', 'sort')` equals `['ả','ă','a'].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).join('\n')`. `lineTool('x', 'nope')` throws.
  - `describeTime('1700000000', 1700000060000)` contains `'Read as       Unix seconds'`, `'ISO 8601      2023-11-14T22:13:20.000Z'` and `'Relative      1 minute ago'`. `describeTime('1700000000000', …)` has `Unix milliseconds` and the same ISO line.
  - `describeTime('2023-11-14T22:13:20Z')` has `'Unix seconds  1700000000'`. `describeTime('2023-11-14 22:13:20')` has `'date text (local time'`. `describeTime('soon')` throws `/can read/`. Extend the empty-input loop with `s => lineTool(s, 'sort')` and `describeTime`.
  - In `TransformTool.test.jsx`, `test('timestamp Now fills the input')`: click **Now** and `#time-in`'s value matches `/^\d{10}$/`.
- [ ] **Step 2: Run** `npx vitest run src/tools.test.js src/tools/TransformTool.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `LINE_OPS`, `lineTool` and the `Lines` wrapper, then wire it and commit `"Add Line Tools: sort, dedupe, trim and change case of lines"`.
- [ ] **Step 4: Implement** `describeTime` and the `Timestamp` wrapper, then wire it.
- [ ] **Step 5: Run** `npm test`. Expected: PASS. **Commit:** `"Add Timestamp tool: Unix time to date and back"`.

---

### Task 3: Async TransformTool, and Hash

**Files:** `src/tools/TransformTool.jsx`, `src/tools/TransformTool.test.jsx`, `src/tools.js`, `src/tools.test.js`, and the wiring files.

**Interfaces:**
- Produces: `TransformTool`'s `fn` may return `string | Promise<string>`. A rejection's message goes to the `.err` line (same rule as a throw). Later tasks rely on this.
- Produces: `HASH_ALGOS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']` and `hash(s, algo = 'SHA-256') → Promise<string>`: lowercase hex of the UTF-8 bytes, resolving to `''` for empty input. With no `crypto.subtle` (a plain-http page) it rejects with `'Hashing needs the page to be opened over https.'`.

**Hash** tab: `hash`, label `'Hash'`, group Encode. Ids `hash-in` (**PRIVATE_IDS**, since it may hold passwords) / `hash-out` (`txt`), `<select id="hash-algo">` defaulting to SHA-256. Description: "SHA-1, SHA-256, SHA-384 or SHA-512 hash of text, as UTF-8, computed in your browser. Text in this box is never saved." Leave out MD5 (no `crypto.subtle` support) and HMAC, and name both as not offered in the spec.

- [ ] **Step 1: Write the failing tests**
  - `src/tools.test.js` (async tests):
    - `await hash('abc')` → `'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'`.
    - `await hash('abc', 'SHA-1')` → `'a9993e364706816aba3e25717850c26c9cd0d89d'`.
    - `await hash('😀')` equals `crypto.subtle.digest` of `TextEncoder` bytes, computed in the test.
    - `await hash('')` → `''`.
    - With `vi.stubGlobal('crypto', {})`, it rejects with `/https/`. Restore the global afterwards.
  - `src/tools/TransformTool.test.jsx`, `test('async output ignores a stale result')`:
    - Render the default `TransformTool` with test ids (`inId="hash-in"`, `outId="t-out"`) and an `fn` that returns promises the test resolves by hand.
    - Set input `'a'`, then `'b'`. Resolve `'b'`'s promise with `'B'`, then `'a'`'s with `'A'`.
    - The output is `'B'`.
    - A rejected promise shows its message on `.err`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement async `fn` in `TransformTool`.** Keep the `useMemo` call. When `out` is a thenable, show `''` until it settles, then set `{ out, error }` from a `useEffect` that ignores the result if its cleanup has run (input or `fn` changed). Sync functions keep today's single-render path.
- [ ] **Step 4: Implement `hash` and the `Hash` wrapper**, then wire it.
- [ ] **Step 5: Run** `npm test`. Expected: PASS. **Commit:** `"Add Hash tool (SHA-1/256/384/512) and async functions in TransformTool"`.

---

### Task 4: Regex Tester

**Files:** `src/tools.js`, `src/tools.test.js`, `src/tools/TransformTool.jsx`, and the wiring files.

**Interfaces:**
- Produces: `MAX_MATCHES = 1000`, `regexMatches(text, pattern, flags) → string` and `regexReplace(text, pattern, flags, replacement) → string`.

Tab `regex`, label `'Regex Tester'`, group Text. Ids `re-in` (`txt`) / `re-out`. The output `ext` is `json` for Matches and `txt` for Replace.

Toolbar:
- `<input id="re-pattern">`, empty by default.
- `<input id="re-flags">`, `'g'` by default, 5em wide.
- `<select id="re-show">`: `matches` "Matches" / `replace` "Replace".
- `<input id="re-replace">`, shown only for Replace.

Description: "Test a JavaScript regular expression: see each match and its groups, or the text after a replace."

Rules:
- Either text or pattern empty → `''`. `new RegExp(pattern, flags)` errors (bad pattern, bad flags) pass through to `.err`.
- `regexMatches` returns `JSON.stringify({ count, matches }, null, 2)`.
  - `count` is the total number of matches.
  - `matches` holds the first `MAX_MATCHES`, each `{ match, index }`, plus `groups: (string|null)[]` when the pattern has numbered groups and `named: {}` when it has named ones. An unmatched group is `null`.
  - With `g`, collect every match through `matchAll`, so empty matches are included and still advance. Without `g`, take only the first.
- `regexReplace` is `text.replace(new RegExp(pattern, flags), replacement)`, which keeps JS `$1` / `$<name>` semantics. An empty replacement deletes the matches.
- Add `// shortcut: a catastrophically backtracking pattern hangs the tab (same as findAll); move matching to a Worker with a timeout if users hit it.`

- [ ] **Step 1: Write the failing tests**
  - `JSON.parse(regexMatches('ann@x.com, bo@y.org', '(\\w+)@(?<host>[\\w.]+)', 'g'))` deep-equals `{ count: 2, matches: [{ match: 'ann@x.com', index: 0, groups: ['ann', 'x.com'], named: { host: 'x.com' } }, { match: 'bo@y.org', index: 11, groups: ['bo', 'y.org'], named: { host: 'y.org' } }] }`.
  - Without `g` the count is 1. `regexMatches('ab', 'x*', 'g')` has count 3 (empty matches at 0, 1 and 2). `regexMatches('a', '(b)?a', 'g')` has `groups: [null]`.
  - A text of 1500 `'a'`s with pattern `'a'` gives count 1500 and 1000 matches. `regexMatches('a', '(', 'g')` throws. `regexMatches('a', 'a', 'q')` throws.
  - `regexReplace('ann@x.com', '(\\w+)@(?<h>\\w+)', 'g', '$<h>:$1')` → `'x:ann.com'`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** both functions and the `Regex` wrapper (fn built with `useCallback` from pattern, flags, show and replacement, like `Encode`), then wire it.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. **Commit:** `"Add Regex Tester: matches with groups, and replace"`.

---

### Task 5: JSON ⇄ CSV

**Files:** `src/tools.js`, `src/tools.test.js`, `src/tools/TransformTool.jsx`, `src/tools/TransformTool.test.jsx`, and the wiring files.

**Interfaces:**
- Produces: `CSV_DELIMS = [[',', 'Comma'], [';', 'Semicolon'], ['\t', 'Tab']]`, `jsonToCsv(s, delim = ',') → string` and `csvToJson(s, delim = ',') → string` (JSON with a 2-space indent).

Tab `csv`, label `'JSON ⇄ CSV'`, group JSON. Ids `csv-in` / `csv-out`. Toolbar: `<select id="csv-dir">` (`json-to-csv` "JSON → CSV", `csv-to-json` "CSV → JSON") and `<select id="csv-delim">`. The input `ext` follows the direction (`json` / `csv`), and the output `ext` is the other one. Description: "Turn a JSON array into CSV, or CSV with a header row into JSON."

`jsonToCsv`:
- An array of objects gets a header row with the union of keys in first-seen order. A missing key is an empty cell.
- An array of arrays becomes rows as they are, with no header. A single object is one row under a header. An array of primitives is one column headed `value`.
- Mixing objects and non-objects throws `` `Each item must be an object (item ${n} is a ${type}).` `` (n counts from 1). A top-level primitive throws `'CSV needs a JSON array or object.'`. `[]` → `''`.
- Cells: strings as they are, numbers and booleans through `String`, `null` as empty, objects and arrays through `JSON.stringify`.
- Quote a cell when it contains the delimiter, `"`, `\n` or `\r`, or starts or ends with whitespace. Double the `"`s inside. Rows are joined with `'\n'`.

`csvToJson` (RFC 4180):
- Quoted fields may hold the delimiter, `""` and newlines. Lines end in LF or CRLF. A leading BOM is stripped, and blank lines and one trailing newline are ignored.
- The first record is the header. A blank header cell becomes `` `column${n}` ``. A repeated header name throws `` `Column name "${name}" appears twice.` ``.
- A record with more fields than the header throws `` `Row ${r} has ${k} fields but the header has ${h}.` ``, where r is the record number and the header is row 1. Fewer fields are filled with `''`.
- An unclosed quote throws `` `Row ${r} has a quote that never closes.` ``. A `"` inside an unquoted field is kept as written.
- Every value stays a string. There's no number guessing, because it would turn `007` into `7`.

Leave out formula-injection escaping (cells starting `=`), because it would change the user's data. Name it as a known limit in the spec.

- [ ] **Step 1: Write the failing tests**
  - `jsonToCsv('[{"a":1,"b":"x,y"},{"b":"say \\"hi\\"","c":null,"d":{"e":[1]}}]') === 'a,b,c,d\n1,"x,y",,\n,"say ""hi""",,"{""e"":[1]}"'`.
  - **Round trip (Review Focus 2):** for `rows = [{ name: 'a,b', note: 'line1\r\nline2', q: '"x"', sp: ' pad ' }]`, `JSON.parse(csvToJson(jsonToCsv(JSON.stringify(rows))))` deep-equals `rows`. Check the same with `';'` and `'\t'`.
  - `csvToJson('﻿a,,a2\r\n1,2\r\n\r\n3\r\n')` deep-equals (after `JSON.parse`) `[{ a: '1', column2: '2', a2: '' }, { a: '3', column2: '', a2: '' }]`.
  - `csvToJson('a,a\n1,2')` throws `/appears twice/`, `csvToJson('a\n1,2')` throws `/Row 2 has 2 fields/`, and `csvToJson('a\n"1')` throws `/never closes/`.
  - `jsonToCsv('[{"a":1},2]')` throws `/item 2 is a number/`, and `jsonToCsv('3')` throws `/array or object/`. `jsonToCsv('[[1,2],[3]]') === '1,2\n3'`, and `jsonToCsv('["x","y"]') === 'value\nx\ny'`.
  - `TransformTool.test.jsx` `test('switching CSV direction keeps the input')` (Review Focus 5): set `csv-in` to `'a\n1'` and change `#csv-dir` to `csv-to-json`. `#csv-in` still holds `'a\n1'`, and `#csv-out` holds `'[\n  {\n    "a": "1"\n  }\n]'`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** both functions (`csvToJson` as a single character-by-character state machine, not a regex) and the `Csv` wrapper, then wire it.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. **Commit:** `"Add JSON ⇄ CSV converter"`.

---

### Task 6: JSON → TypeScript

**Files:** `src/tools.js`, `src/tools.test.js`, `src/tools/TransformTool.jsx`, and the wiring files.

**Interfaces:**
- Produces: `jsonToTs(s) → string`.

Tab `ts`, label `'JSON → TypeScript'`, group JSON. Ids `ts-in` (`json`) / `ts-out` (`ts`). Description: "Generate TypeScript interfaces from a JSON sample."

Rules:
- The root is named `Root`. Every object becomes `export interface Name {` with `  key: type;` lines and a closing `}`. Interfaces are separated by one blank line: root first, then nested ones depth-first in order of appearance.
- Types: `string`, `number`, `boolean`, `null`, a nested object's interface name, `T[]`.
  - A mixed array is `(A | B)[]`, with members in first-seen order.
  - `[]` is `unknown[]`, and `{}` is `Record<string, unknown>`.
- Objects inside one array merge into one interface. A key missing from some of them is optional (`key?:`). A key with different types gets a union in first-seen order.
- Names: a nested object's interface is the PascalCase of its key. An array's element interface is the singular of the key's PascalCase:
  - `-ies` → `-y`
  - a trailing `s` (but not `ss`) is dropped
  - otherwise `Item` is appended
  - Non-alphanumerics split words. A leading digit gets a `T` prefix, and an empty name becomes `Item`. A repeated name gets `2`, `3`, …
- A key that isn't `/^[A-Za-z_$][\w$]*$/` is written with `JSON.stringify(key)`.
- A top-level array is `export type Root = <elem>[];` followed by the element's interfaces, with the element named `RootItem`. A top-level primitive is `export type Root = <type>;`.

- [ ] **Step 1: Write the failing tests**
  - The input `{"id":1,"name":"Ann","tags":["a"],"address":{"city":"Hanoi"},"users":[{"id":1},{"id":2,"email":null}],"first-name":"A"}` gives exactly:
    ```
    export interface Root {
      id: number;
      name: string;
      tags: string[];
      address: Address;
      users: User[];
      "first-name": string;
    }

    export interface Address {
      city: string;
    }

    export interface User {
      id: number;
      email?: null;
    }
    ```
  - `jsonToTs('[1,"a",[]]') === 'export type Root = (number | string | unknown[])[];'` and `jsonToTs('"x"') === 'export type Root = string;'`.
  - `{"a":{"x":1},"b":{"a":{"y":2}}}` produces interfaces `A` and `A2`. `{"categories":[{"v":1}],"data":[{"v":1}]}` produces `Category` and `DataItem`.
  - `{"v":[{"n":1},{"n":"x"}]}` gives `n: number | string;`, and `{"e":{}}` gives `e: Record<string, unknown>;`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `jsonToTs` (two passes: infer a merged shape tree, then name and print it) and the `JsonToTs` wrapper, then wire it.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. **Commit:** `"Add JSON → TypeScript interface generator"`.

---

### Task 7: YAML ⇄ JSON

**Files:** `package.json` / `package-lock.json` (`npm install --save-exact js-yaml@5.5.0`), `src/tools.js`, `src/tools.test.js`, `src/tools/TransformTool.jsx`, the wiring files, and the spec's Constraints dependency list.

**Interfaces:**
- Consumes: async `fn` support in `TransformTool` (Task 3).
- Produces: `yamlToJson(s, yaml) → string` and `jsonToYaml(s, yaml) → string`, where `yaml` is the js-yaml module object.

Tab `yaml`, label `'YAML ⇄ JSON'`, group JSON. Ids `yaml-in` / `yaml-out`. Toolbar: `<select id="yaml-dir">` (`yaml-to-json` "YAML → JSON", `json-to-yaml` "JSON → YAML"). The input and output `ext` follow the direction (`yaml` / `json`). The wrapper's fn is `async s => yamlToJson(s, await import('js-yaml'))` (and the same for the other direction), so js-yaml gets its own chunk. Description: "Convert YAML to JSON or JSON to YAML."

Rules:
- Before writing code, check the export names in `node_modules/js-yaml/dist/js-yaml.d.ts` for 5.5.0. The plan assumes `load`, `dump` and `CORE_SCHEMA`.
- `yamlToJson` is `JSON.stringify(yaml.load(s, { schema: yaml.CORE_SCHEMA }), null, 2)`. CORE_SCHEMA, so `2024-01-01` stays a string and doesn't become a Date. js-yaml's errors (line and column, and "expected a single document" for multiple documents) pass through.
- `jsonToYaml` is `yaml.dump(JSON.parse(s), { lineWidth: -1, noRefs: true })`, with no line folding.
- In the spec, name these as known limits: `.inf` and `.nan` become `null`, comments are lost, and big numbers lose precision as with `JSON.parse`.

- [ ] **Step 1: Write the failing tests** (import `* as yaml from 'js-yaml'` in `tools.test.js`)
  - `yamlToJson('a: 1\nb: [x, "2"]\nd: 2024-01-01\nbase: &b {k: v}\nc:\n  <<: *b\n', yaml)` parses (with `JSON.parse`) to `{ a: 1, b: ['x', '2'], d: '2024-01-01', base: { k: 'v' }, c: { k: 'v' } }`.
  - `yamlToJson('a: [', yaml)` throws `/line/`, and `yamlToJson('a: 1\n---\nb: 2', yaml)` throws.
  - `jsonToYaml('{"a":1,"s":"long text that should not be folded even past eighty characters, really not folded"}', yaml)` has no line break inside the string. The round trip `yamlToJson(jsonToYaml(x))` equals `JSON.stringify(JSON.parse(x), null, 2)` for `x = JSON.stringify(PERSON-like object)`.
  - Empty input → `''` for both.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Install, implement, wire.** Check that `npm run build` prints a separate `js-yaml` chunk.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. **Commit:** `"Add YAML ⇄ JSON converter (js-yaml, loaded on demand)"`.

---

### Task 8: JSON Query (JSONPath)

**Files:** `package.json` / `package-lock.json` (`npm install --save-exact jsonpath-plus@11.3.0`), `src/tools.js`, `src/tools.test.js`, `src/tools/TransformTool.jsx`, the wiring files, and the spec's Constraints.

**Interfaces:**
- Consumes: async `fn` (Task 3).
- Produces: `jsonQuery(s, path, JSONPath) → string`, where `JSONPath` is the named export of `jsonpath-plus`.

Tab `query`, label `'JSON Query'`, group JSON. Ids `query-in` (`json`) / `query-out` (`json`). Toolbar: `<input id="query-path">`, defaulting to `'$'`, wide. The fn is `async s => jsonQuery(s, path, (await import('jsonpath-plus')).JSONPath)`. Description: "Pick values out of JSON with a JSONPath query, such as $.tags[*], $..city or $.items[?(@.price < 10)]."

Rules:
- Empty JSON or an empty path → `''`.
- The result is `JSON.stringify(JSONPath({ path, json: JSON.parse(s), eval: 'safe', wrap: true }), null, 2)`.
- Keep `eval: 'safe'` explicit. jsonpath-plus had a code-execution hole through filter scripts before v10, and `'safe'` runs filters in its own interpreter instead of `eval`. Add a one-line comment saying so.
- Library errors on a bad path pass through.

- [ ] **Step 1: Write the failing tests**
  - With `j = JSON.stringify({ items: [{ n: 'a', price: 5 }, { n: 'b', price: 20 }], tags: ['x', 'y'] })`:
    - `jsonQuery(j, '$.tags[*]', JSONPath)` → `'[\n  "x",\n  "y"\n]'`.
    - `JSON.parse(jsonQuery(j, '$.items[?(@.price < 10)].n', JSONPath))` deep-equals `['a']`.
    - `jsonQuery(j, '$.nope', JSONPath) === '[]'`.
  - `jsonQuery(j, '$.items[?(constructor.constructor("return 1")())]', JSONPath)` throws or returns `'[]'`, and never runs the code.
  - `jsonQuery('', '$', JSONPath) === ''` and `jsonQuery(j, '', JSONPath) === ''`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Install, implement, wire.** Check that `npm run build` prints a separate `jsonpath-plus` chunk.
- [ ] **Step 4: Run** `npm test`. Expected: PASS. **Commit:** `"Add JSON Query tool (JSONPath, loaded on demand)"`.

---

### Task 9: Final check in a browser

- [ ] `npm run build && npm run preview`, in a fresh tab. For each new tab: try the sample, check that an error reaches the `.err` line or the status bar, that Copy and Download work, that search finds text in the output, and that the layout holds at 390 px with no horizontal page scroll.
- [ ] Check that Hash and Encode text is gone after a reload with "Remember my text" on. That's a `PRIVATE_IDS` check.
- [ ] On the Network tab, only the YAML and Query tabs load their chunks, and only when first opened.
