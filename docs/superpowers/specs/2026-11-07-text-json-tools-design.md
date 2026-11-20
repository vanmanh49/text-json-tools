# Text & JSON Tools — Design

Date: 2026-11-07

## Goal

A public, static website of browser-only utilities. The first five:

0. **JSON Format**: a Postman-style pretty view with syntax colours, line numbers, folding, indent choice, key sorting and search.
1. **Text → JSON** — unescape a JSON string literal into pretty JSON.
2. **JSON → text** — escape JSON into a single string literal.
3. **JSON Minify**: minify formatted JSON to one line.
4. **Compare & merge**: a WinMerge-style side-by-side line diff. You copy changes left or right one line or one block at a time.

Added since, each described under UI: HTML Format, JWT Decode, Encode / Decode, QR Code, UUID, Line Tools, Timestamp, Hash, Regex Tester, JSON ⇄ CSV, JSON → TypeScript, YAML ⇄ JSON and JSON Query (eighteen tools in all).

Success: a user pastes input, gets correct output or a clear error, and copies the result. No data leaves the browser.

## Non-goals

No backend, accounts, history, share links, file upload, or analytics.

## Constraints

- Static files only. Built with Vite (`npm run build`). GitHub Actions deploys `dist/` to GitHub Pages on every push to `main`; `dist/` also works on any static host.
- React 19 with plain CSS and JS (ES modules, JSX).
- Runtime dependencies: React, React DOM, `jsdiff` (`diff@9.0.0`), `qrcode@1.5.4`, `jsqr@1.4.0`, `js-yaml@5.5.0` and `jsonpath-plus@11.3.0` (each of the last two loaded only when its tool runs), installed
  from npm and bundled into `dist/` by Vite, so the page loads no third-party
  script. The tests import the same `"diff"` from `node_modules`.
- Works on desktop and phone widths, light and dark theme.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell: `#root`, font preloads, the inline script that applies the saved theme before first paint |
| `vite.config.js` | Vite + React, `base: './'`, Vitest with jsdom |
| `public/fonts/` | IBM Plex woff2 subsets, copied to `dist/fonts/` |
| `src/main.jsx`, `src/App.jsx` | Entry, top bar, tab nav, theme, settings menu, one section per tool |
| `src/tools/` | One component per tool: `TransformTool.jsx` (the five one-in, one-out tools), `FormatTool.jsx`, `CompareTool.jsx`, `QrTool.jsx`. No tool logic except reading an image in `QrTool`. |
| `src/ui/` | `Panel`, `StatusBar`, `SearchBox`, `IconButton` |
| `src/textStore.js`, `src/setText.js`, `src/store.js`, `src/globals.js` | Panel text and storage, undo-friendly text replace, page-wide listeners |
| `src/style.css` | Layout, color tokens, light/dark, responsive |
| `src/tools.js` | Pure functions, no DOM |
| `src/**/*.test.js(x)` | Vitest suites: `tools.js` and the components |
| `package.json` | `"type": "module"`, dependencies `react`, `react-dom`, `diff@9.0.0`; scripts `dev`, `build`, `preview`, `"test": "vitest run"` |
| `.github/workflows/deploy.yml` | On push to `main`: tests, build, publish `dist/` to GitHub Pages |

The active tab comes from the URL hash: `#format`, `#compare`, `#text-to-json`, `#json-to-text`, `#minify`, `#html`, `#jwt`, `#encode`, `#qr`, `#uuid`.
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
- `splitSame(lines, { first, last }, ctx = 3)` → `{ head, hidden, tail }`. It
  keeps `ctx` lines next to a change: only the trailing ones when the run starts
  the file, and only the leading ones when it ends it. It never hides fewer than
  2 lines.
- `linesText(lines, indent)` joins the lines with the indent string (a number of
  spaces, or `'\t'`). Unsorted, the result is byte-identical to
  `JSON.stringify(value, null, indent)`.

Empty input to the three JSON tools returns `''` without an error.

## UI

- **JWT Decode (`#jwt`):**
  - `decodeJwt` turns the token into the header and payload, shown as pretty JSON. A `Bearer ` prefix and surrounding whitespace are accepted.
  - The `iat`, `nbf` and `exp` claims are listed in plain English ("Expires in 2 hours (… UTC)"), and expired ones are shown in red.
  - Encrypted tokens (JWE, with 5 parts) and malformed tokens get a clear error.
  - The signature is never checked, and the page says so. The token textarea has `data-private`, so it is never written to browser storage.
- **Encode / Decode (`#encode`):** a mode picker for Base64 encode, Base64 decode, URL encode/decode, Hex encode/decode, HTML escape/unescape and Unicode escape/unescape.
  - Hex: `hexEncode` gives the UTF-8 bytes as lowercase hex with no separators. `hexDecode` ignores whitespace, `:`, `,`, `-` and `0x` prefixes, accepts either case, and rejects non-hex characters, an odd digit count and non-UTF-8 bytes with clear errors.
  - HTML: `htmlEscape` turns `& < > " '` into `&amp; &lt; &gt; &quot; &#39;`. `htmlUnescape` decodes decimal and hex character references and common named entities in one pass (`&amp;lt;` → `&lt;`); unknown names and code points above U+10FFFF stay as written.
  - Unicode: `unicodeEscape` writes every UTF-16 code unit above 0x7E as `\uXXXX`. `unicodeUnescape` decodes `\uXXXX` and `\u{X…}`; malformed escapes stay as written. Neither HTML nor Unicode modes ever error.
  - Base64 handles UTF-8 and accepts the URL-safe alphabet without padding. Binary data gets a clear error instead of garbled text.
  - URL decode treats `+` as a space.
  - The input box has `data-private` (decoded Basic auth headers and keys are common), so it is never written to browser storage; text saved there by an older version is deleted on load.
- **QR Code (`#qr`):** a Text panel and a QR code panel.
  - Typing makes the QR code as you go: `qrSvg` (UTF-8, error correction M, 4-module quiet zone), always black on white. Download saves a 1024 px PNG. Too much text (over about 2.3 KB) gets the library's "too big" error.
  - To read a QR code, drop an image on the QR panel, open one with **Open image**, or press Ctrl/⌘+V with an image (and no text) on the clipboard. The image is scaled to at most 1600 px, drawn on white, and read with `jsQR`, which is loaded only then. The text goes into the Text panel. No code found gives a clear error.
  - The Text box has `data-private` (it may hold Wi-Fi passwords or 2FA secrets), so it is never written to browser storage.
- **HTML Format (`#html`):** an HTML panel, and a Show picker for the right panel: Formatted HTML or Preview.
  - `formatHtml(s)` puts each tag, comment and text run on its own line, two spaces per open element. Void and `/>` tags don't indent. `<p>Short text</p>` (up to 100 characters) and empty elements stay on one line. Tag whitespace collapses to single spaces, quoted attribute values are kept. As in browsers, a quote starts a value only right after `=`, so `alt=don't` doesn't swallow the markup after it. `<pre>` and `<textarea>` contents are kept byte for byte; `<script>` and `<style>` contents are dedented and re-indented. Unclosed tags close when an ancestor closes; stray close tags are printed as they are. It never throws, and formatting its own output changes nothing.
  - Known limits: splitting inline elements onto lines can add a space between them when rendered (`<b>a</b><i>b</i>`), and unclosed `<li>`/`<p>` nest deeper instead of closing at the next sibling.
  - Preview: `<iframe sandbox="">` (no scripts, forms, popups or access to the page) with `srcDoc = htmlPreview(input)`, which inserts, after any doctype, a CSP meta allowing only inline styles and `data:`/`blob:` images and fonts, and `<base target="_blank">` so links open nothing. The formatted text and the preview update 150 ms after typing stops. White background whatever the theme.
- **UUID (`#uuid`):** a Version picker, a Count box (1–1000) and **Generate** above one read-only UUIDs panel.
  - `uuids(count, version)` makes RFC 9562 UUIDs, one per line, from `crypto.getRandomValues` (`crypto.randomUUID` is missing on plain-http pages). A new version, a new count or Generate makes a new set; a bad count gets a clear error.
  - v4: random. v7: 48-bit Unix ms then random; a batch is sorted so it ascends. v1 and v6: 100 ns ticks since 1582-10-15, one tick apart within a batch, a random clock sequence and a random node with the multicast bit set (never the MAC address). v6 is v1 with the time fields reordered so it sorts.
  - v3 and v5 (name-based) are not offered: they need a namespace and name input and MD5 / SHA-1.
  - Nothing is saved; the list is new on every load.
- **Line Tools (`#lines`):** an Action picker over one Lines panel → Result panel.
  - `lineTool(s, op)` with `op` from `LINE_OPS`: Sort A → Z, Sort Z → A, Remove duplicates, Reverse order, Trim spaces, Remove empty lines, UPPERCASE, lowercase.
  - Lines split on LF or CRLF; one trailing newline is dropped and the output uses LF. Sorting is natural (`localeCompare` with `numeric`, so `item2` comes before `item10`). Remove duplicates keeps the first of exact copies; Remove empty lines also drops whitespace-only lines.
- **Timestamp (`#time`):** a Timestamp or date panel → Converted panel, with a **Now** button that puts the current Unix seconds in the input.
  - `describeTime(s)`: digits only (optional `-` and decimals) is a Unix timestamp, read by size: below 1e11 seconds, below 1e14 milliseconds, below 1e17 microseconds, else nanoseconds. Anything else goes through `Date.parse`, so a date without a zone is local time. Unreadable input gets a clear error.
  - The output is one labelled line each: Read as (which reading was used), Unix seconds, Unix ms, ISO 8601, UTC, Local (the browser's locale and time zone) and Relative ("5 days ago", "in 2 hours").
- **Hash (`#hash`):** an Algorithm picker (SHA-1, SHA-256 (default), SHA-384, SHA-512) over a Text panel → Hash (hex) panel.
  - `hash(s, algo)` is async: the lowercase hex `crypto.subtle.digest` of the UTF-8 bytes. Whitespace is hashed like any text; only empty input gives empty output. Without `crypto.subtle` (a plain-http page) it says the page must be opened over https.
  - MD5 (not in `crypto.subtle`) and HMAC are not offered.
  - The Text box has `data-private` (it may hold passwords), so it is never written to browser storage.
- **Regex Tester (`#regex`):** Pattern and Flags boxes (Flags `g` by default) and a Show picker (Matches / Replace, with a "With" box for Replace) over a Text panel → Matches or Replaced text panel. The boxes are not saved.
  - `regexMatches(text, pattern, flags)` gives `{ count, matches }` as pretty JSON: every match is counted, the first 1000 (`MAX_MATCHES`) are listed as `{ match, index }` plus `groups` (numbered, unmatched → `null`) and `named` when the pattern has them. Empty matches are included. Without `g` only the first match is taken, as in JavaScript.
  - `regexReplace(text, pattern, flags, replacement)` is `String.prototype.replace`, so `$1`, `$<name>` and `$&` work.
  - A bad pattern or flag shows the browser's message on the error line. Empty text or pattern gives empty output. Known limit: a catastrophically backtracking pattern can hang the tab, as in search.
- **JSON ⇄ CSV (`#csv`):** a Convert picker (JSON → CSV, CSV → JSON) and a Delimiter picker (Comma, Semicolon, Tab). The panel labels and file types follow the direction; switching keeps the input text.
  - `jsonToCsv(s, delim)`: an array of objects gets a header of every key, first seen first, and a missing key is an empty cell. An array of arrays becomes rows with no header, an array of values one `value` column, and a single object one row. Strings are written as they are, `null` as empty, nested objects and arrays as JSON. A cell is quoted when it holds the delimiter, a quote or a line break, or starts or ends with whitespace; quotes inside are doubled. Lines end in LF. Mixing objects with other items, or a top-level value, gets a clear error.
  - `csvToJson(s, delim)`: RFC 4180 (quoted fields may hold the delimiter, `""` and line breaks; LF or CRLF), a leading BOM is dropped and blank lines are skipped. The first row is the header; a blank name becomes `columnN` and a repeated one is an error. Every value stays a string (`007` stays `007`). A row with more fields than the header, or a quote that never closes, is an error naming the row; a shorter row is padded with empty strings.
  - Known limit: cells starting with `=`, `+`, `-` or `@` are not escaped, so a spreadsheet may treat them as formulas; escaping would change the data.
- **JSON → TypeScript (`#ts`):** a JSON panel → TypeScript panel.
  - `jsonToTs(s)` writes `export interface` declarations, root (`Root`) first, then nested ones in the order they appear. Types are `string`, `number`, `boolean`, `null`, an interface name, `T[]`, `(A | B)[]` for mixed arrays, `unknown[]` for an empty array and `Record<string, unknown>` for an empty object.
  - Objects in one array merge into one interface: a key missing from some is optional (`key?:`), and a key with different types gets a union, first seen first.
  - Names: an object's interface is its key in PascalCase; an array's item interface is the singular (`users` → `User`, `categories` → `Category`, otherwise `+Item`, so `data` → `DataItem`). A name starting with a digit gets a `T`, and a repeated name gets `2`, `3`, …. Keys that aren't plain identifiers are quoted.
  - A top-level array or value becomes `export type Root = …;` (array items are `RootItem`).
- **YAML ⇄ JSON (`#yaml`):** a Convert picker (YAML → JSON, JSON → YAML); labels and file types follow the direction.
  - `yamlToJson(s, yaml)` loads one YAML 1.2 document with js-yaml's core schema plus merge keys (`<<`): anchors and aliases resolve, dates and `yes`/`no` stay strings. Errors keep their first line with the place as "(line L, column C)"; several documents are an error.
  - `jsonToYaml(s, yaml)` dumps with no line folding and no anchors.
  - `yaml` is the js-yaml module, passed in by the component, which imports it only when its tab is visible and has text, so it is its own chunk and never loads for other tools.
  - Known limits: comments are lost, `.inf`/`.nan` become `null`, and numbers above 2^53 lose precision as with `JSON.parse`.
- **JSON Query (`#query`):** a Path box (`$` by default, not saved) over a JSON panel → Results panel.
  - `jsonQuery(s, path, JSONPath)` runs jsonpath-plus with `wrap: true`, so the result is always a JSON array of every match (`[]` for none), pretty-printed. Empty JSON or path gives empty output; a bad path shows the library's message.
  - Filters such as `?(@.price < 10)` run with `eval: 'safe'`, the library's own interpreter; nothing in a path is ever run as JavaScript. A test checks that a filter cannot run code.
  - The library is its own chunk, imported only when the tab is visible and has text.
- **Async tools:** a `TransformTool` function may return a promise. The output is empty until it settles, and a result for text that has since changed is dropped, so a slow old result never replaces a newer one. A rejection's message goes to the error line.
- **Compare as JSON:** a checkbox in the Compare toolbar.
  - Before diffing, Compare rewrites both sides with `normalizeJson` (keys A→Z, 2-space indent), so key order and formatting never show as differences.
  - The originals go on the undo stack.
  - An invalid side is named, with its line and column.
- **Shell:**
  - A top bar holds the `{ }` brand, the tool group menus, a theme switch (System → Light → Dark, remembered) and a ⚙ menu.
  - The tools are in four groups, `NAV`'s third field: JSON, Text, Encode and More. Above 700 px the top bar shows one menu per group; the menu of the current tool's group is highlighted and shows that tool's name, the others show the group name. Picking a tool closes its menu.
  - At 700 px and below (phones) the group menus give way to a tool picker: a button showing the current tool's name that opens a list of every tool under group headings, with the current one highlighted. The list scrolls when it is taller than the screen. The brand name is hidden and the picker fills the row. From 1250 px down, panel header buttons show icons only so two panels fit side by side. Picking a tool, a click outside or Escape closes a menu (Escape also for the ⚙ menu).
  - The menu has "Remember my text in this browser" (on by default) and "Clear all panels", which needs a second click to confirm.
  - Format and the three JSON tools fill the screen (`body.app`), and their panels scroll inside. Compare scrolls the page.
  - Under 700px the panels stack and the tabs scroll sideways.
- **Look:**
  - IBM Plex Sans for the interface and IBM Plex Mono for editors, both kept in `public/fonts`.
  - The palette comes from JSON's token colours.
  - Panel buttons are borderless icon buttons. The loud element is the status bar's ok/error edge.
- **Every panel:**
  - A status bar shows the line count and size. JSON panels add "✓ Valid JSON", or "✗ Line L, column C: message" with a **Go to error** link that selects the bad character and scrolls to it.
  - On an editable JSON panel, the error also offers **Fix JSON** when `repairJson` can turn the text into valid JSON. It removes `//` and `/* */` comments and trailing commas, turns single-quoted strings into double-quoted ones, quotes bare keys, maps `True`/`False`/`None` to `true`/`false`/`null` and `undefined`/`NaN`/`Infinity` to `null`, and escapes raw line breaks inside strings, keeping the rest of the layout. It goes through `setText`, so Cmd/Ctrl+Z undoes it. It does not add missing commas, so text that still fails gets no button. Above 1 MB the repair is not tried in advance: the button always shows, and if the repair fails on click the error line says it can't be fixed automatically.
  - Error positions come from `errorLocation()`. It handles V8 positions, V8 "Unexpected token" snippets, Firefox line/column, and Safari (no position).
  - Editable panels show an empty state (Paste, Try a sample, "or drop a file here") and accept a dropped file of up to 25 MB, read locally. A file dropped anywhere else on the page is ignored, so it can't open in the tab and replace the app.
  - Output panels show "The result appears here as you type." and have a **Send to…** menu that fills another tool's input and switches tab.
- **Remembered text:**
  - Editable text is saved to `localStorage` (`tjt:text:<id>`, debounced) and restored on load.
  - Text over 2 MB isn't saved; its status bar says so.
- **Compare:** after a compare with differences, the inputs fold into a "Left · N lines  Right · M lines · Edit texts" bar.
- **JSON Format:** a toolbar with Indent (2 spaces, 4 spaces or Tab), "Sort keys
  A→Z", Expand all, Collapse all, a search box and a match count. Below it, the
  JSON input panel sits next to the Pretty panel.
  - The Pretty view is a `<div>` that re-renders 150ms after typing stops. It
    shows a line-number gutter, a ▾/▸ fold button on each non-empty
    object/array, and coloured tokens.
  - A folded node shows `{…} 3 keys` or `[…] 2 items`. Line numbers keep their
    original values while folded.
  - Collapse all keeps the root open.
  - Search (the shared one below) covers both panels; Pretty-view matches sit
    inside single tokens, and going to one unfolds its ancestors.
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
  - Exception: Paste of text with more than 200 lines sets the value directly,
    because `insertText` slows down roughly quadratically with line count (2.6s
    for 2,000 lines). That also wipes the box's browser undo history, so
    `setText` records the step itself (last 20 per box) and a page-wide keydown
    handler undoes it: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z or Ctrl+Y redo. It
    only acts while the box still shows exactly that text, so anything typed
    afterwards is undone by the browser first. Clear's `delete` stays fast at
    any size, so it is always undoable natively.
  - Buttons that need content are disabled while there is none: Copy, Clear and
    Download on an empty panel (Paste stays enabled), Compare and Swap when both
    sides are empty, and the JSON Format Expand all and Collapse all
    when there is no formatted view. Collapse all is also disabled when nothing
    is nested below the root.
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
  - Undo restores the textareas as they were before each copy, up to the last
    100 steps. Typing in a textarea clears the diff and the copy history; the
    textarea's own undo covers typed edits.
  - There is no separate merged-result box. The two sides are the result.
  - When the sides are identical, the grid is not shown. An inline notice (not a
    dialog) appears below the toolbar instead: "✓ The left and right texts are
    identical." The same notice appears after the last difference is copied
    across. If both sides are empty, the notice says "Both sides are empty.
    Paste or type text to compare."
  - Prev and Next are disabled while the notice shows. Undo stays available.
    Typing hides the notice.
  - **Long content:**
    - The toolbar is sticky at the top of the screen. On phones it is a single
      row that scrolls sideways, with the labels shortened to "‹ Prev" and
      "Next ›".
    - The counter reads "N differences", and changes to "3 of 12" once you move
      to a difference.
    - Unchanged runs collapse to 3 lines of context next to each change
      (`splitSame`). Each collapsed run shows as a "⋯ N unchanged lines" row
      that expands it. Line numbers stay true. A folded run's rows are only
      built when it is expanded (until then it is one hidden block of text the
      search can still find matches in), so files of tens of thousands of lines
      stay quick to compare, copy and undo.
    - A sticky location bar sits to the right of the diff, scaled to the diff's
      height. It has one tick per difference (the current one in the accent
      colour) and a box showing the part of the diff that is on screen. Clicking
      a tick jumps to that difference, and clicking elsewhere on the bar scrolls
      to that point.
    - Keyboard: Alt+↓ / Alt+↑ go to the next or previous difference, Alt+→ /
      Alt+← copy the current difference to the right or left, and Ctrl/⌘+Z
      undoes the last copy. These are ignored while focus is in a textarea,
      input or select.
- **Search (every tool):** every tool, JSON Format included, gets a search box
  (the `SearchBox` component) at the end of its toolbar.
  - Inside the box, on the right, are three toggles, as in VS Code: **Aa** match case, **ab**
    whole word (letters and digits of any language and `_` count as word
    characters), and **.\*** regular expression (`^` and `$` work per line;
    empty matches are skipped). They are off by default, apply to that tool's
    search only, and are not remembered. A regex that doesn't compile shows
    "Invalid regex" and a red box border instead of matches.
  - The visible box is a `.search` wrapper around the borderless input and the
    toggles; it carries the border, the focus ring (while the input has focus)
    and the red invalid border.
  - By default it finds plain text, ignoring case (`findAll`), in every visible panel and,
    on JSON Format, in the Pretty view, and on Compare, in the diff rows. It shows "N matches", then "3 of N" while
    Enter / Shift+Enter move through them. It stops counting at 2,000 ("2000+").
  - Matches are painted with the CSS Custom Highlight API. A textarea doesn't
    show a selection while the search box has focus, so a transparent copy of
    its text (`.hl`) sits behind it and takes the paint. Going to a match in a
    collapsed unchanged run expands that run, and one in a folded Pretty-view
    node unfolds it.
  - The matches refresh when the text changes, on resize, and when the tab is
    shown.
- **Focus and shortcuts (every tool):**
  - Opening a tool puts the cursor in its first editable panel (Compare: Left),
    unless focus is already inside that tool.
  - Ctrl/⌘+F focuses the tool's search box. If that box is disabled, the
    browser's own find opens instead.
  - Ctrl/⌘+V while focus is outside any text box pastes into the tool's
    input. On Compare it goes to the first empty side, otherwise to Left.
  - Ctrl/⌘+Z only undoes the box that has focus. The browser keeps one undo
    history for the page, so without this, undoing in the search box went on
    to undo the panels' last edits and emptied them.
- A floating "↑ Top" button appears once the page is scrolled more than 400px
  (all tools). The JSON Format toolbar is sticky too.
- Controls are native buttons and labelled textareas, so they work with the
  keyboard and screen readers.

## Error handling

- Every tool call in the tool components is wrapped in try/catch. On error, the output is
  cleared and `err.message` is shown in the error line. Modern browsers include
  the position or line and column in it.
- Known limit, noted in code: `JSON.parse` loses precision on integers above
  2^53 and keeps only the last of any duplicate keys.

## Testing

- `src/tools.test.js` with Vitest and `node:assert`:
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
