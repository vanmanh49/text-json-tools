import { diffArrays } from 'diff';
import QRCode from 'qrcode';

// shortcut: JSON.parse loses precision above 2^53 and keeps only the last duplicate key; swap in a lossless parser if users hit it.

export function textToJson(s) {
  s = s.trim();
  if (!s) return '';
  let v;
  try {
    v = JSON.parse(s);
  } catch (err) {
    // escaped JSON pasted from a log without its outer quotes, e.g. {\"a\":1}
    if (!s.includes('\\"')) throw err;
    try { v = JSON.parse('"' + s + '"'); } catch { throw err; }
  }
  if (typeof v === 'string') v = JSON.parse(v);
  return JSON.stringify(v, null, 2);
}

export function jsonToText(s) {
  return s.trim() ? JSON.stringify(JSON.stringify(JSON.parse(s))) : '';
}

export function minify(s) {
  return s.trim() ? JSON.stringify(JSON.parse(s)) : '';
}

// Diff whole lines (split on \n, rejoined with \n) so a missing final newline or CRLF never alters the merge.
export function diffBlocks(left, right) {
  const blocks = [];
  // jsdiff returns undefined when it gives up; without a cap, two large unrelated texts freeze the tab
  const parts = diffArrays(left.split('\n'), right.split('\n'), { timeout: 1000 });
  if (!parts) throw new Error('These texts are too different to compare quickly. Try smaller pieces.');
  for (const p of parts) {
    if (!p.value.length) continue;
    if (!p.added && !p.removed) { blocks.push({ type: 'same', lines: p.value }); continue; }
    let b = blocks.at(-1);
    if (b?.type !== 'change') blocks.push(b = { type: 'change', left: [], right: [] });
    b[p.removed ? 'left' : 'right'].push(...p.value);
  }
  return blocks;
}

// WinMerge-style copy. dir 'right' copies left → right. `block` is the change-block index;
// with `row`, only that line of the block: replace it, insert it into a gap, or (copying a gap) delete it.
export function applyCopy(left, right, { block, row, dir }) {
  const [src, tgt] = dir === 'right' ? ['left', 'right'] : ['right', 'left'];
  let i = 0;
  const text = diffBlocks(left, right).flatMap(b => {
    if (b.type === 'same') return b.lines;
    if (i++ !== block) return b[tgt];
    if (row == null) return b[src];
    const t = b[tgt].slice();
    if (row < b[src].length && row < t.length) t[row] = b[src][row];
    else if (row < b[src].length) t.push(b[src][row]);
    else t.splice(row, 1);
    return t;
  }).join('\n');
  return dir === 'right' ? { left, right: text } : { left: text, right };
}

// Postman-style pretty view model: one entry per output line, with coloured parts
// ([class, text]) and, on lines that open a non-empty object/array, the index of
// the closing line (`end`), the child `count` and the bracket `kind`.
// Joined with linesText() it is byte-identical to JSON.stringify(value, null, indent).
export function jsonLines(value, indent = 2, sort = false) {
  const lines = [];
  const walk = (v, depth, key, last) => {
    const head = key === undefined ? [] : [['key', JSON.stringify(key)], ['punc', ': ']];
    const comma = last ? [] : [['punc', ',']];
    if (v !== null && typeof v === 'object') {
      const isArr = Array.isArray(v);
      // sorting entries here (not by rebuilding an object) keeps numeric-looking keys in A→Z order too
      const keys = isArr ? null : Object.keys(v);
      if (sort && keys) keys.sort((a, b) => a.localeCompare(b));
      const n = isArr ? v.length : keys.length;
      const [o, c] = isArr ? ['[', ']'] : ['{', '}'];
      if (!n) { lines.push({ depth, parts: [...head, ['punc', o + c], ...comma] }); return; }
      const open = { depth, parts: [...head, ['punc', o]], kind: o, count: n };
      lines.push(open);
      if (isArr) v.forEach((x, i) => walk(x, depth + 1, undefined, i === n - 1));
      else keys.forEach((k, i) => walk(v[k], depth + 1, k, i === n - 1));
      open.end = lines.length;
      lines.push({ depth, parts: [['punc', c], ...comma] });
      return;
    }
    const cls = typeof v === 'string' ? 'str' : typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : 'null';
    lines.push({ depth, parts: [...head, [cls, JSON.stringify(v)], ...comma] });
  };
  walk(value, 0, undefined, true);
  return lines;
}

export function linesText(lines, indent = 2) {
  const ind = typeof indent === 'number' ? ' '.repeat(indent) : indent;
  return lines.map(l => ind.repeat(l.depth) + l.parts.map(p => p[1]).join('')).join('\n');
}

// Collapse a long unchanged run in the diff view, keeping `ctx` lines of context next to changes.
// `first`/`last`: the run starts or ends the file, so it only needs context on its inner side.
// Never hides fewer than 2 lines (a "1 unchanged line" toggle would cost as much space as the line).
export function splitSame(lines, { first = false, last = false } = {}, ctx = 3) {
  const headN = first ? 0 : ctx, tailN = last ? 0 : ctx;
  if (lines.length - headN - tailN < 2) return { head: lines, hidden: [], tail: [] };
  return { head: lines.slice(0, headN), hidden: lines.slice(headN, lines.length - tailN), tail: lines.slice(lines.length - tailN) };
}

// Where a JSON.parse error points, from the engine's message (formats differ per browser).
// V8/Chrome: "... at position 12 (line 3 column 1)"; Firefox: "... at line 3 column 1 of the JSON data";
// older V8: "... at position 12"; Safari: no position at all → {}.
export function errorLocation(message, text) {
  let m = message.match(/line (\d+) column (\d+)/);
  if (m) {
    const line = +m[1], col = +m[2];
    let pos = 0;
    for (let l = 1; l < line; l++) pos = text.indexOf('\n', pos) + 1;
    return { pos: pos + col - 1, line, col };
  }
  m = message.match(/position (\d+)/);
  let pos = m ? +m[1] : snippetPosition(message, text);
  if (pos == null) return {};
  pos = Math.min(pos, text.length);
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  return { pos, line, col: pos - before.lastIndexOf('\n') };
}

// V8 "Unexpected token" errors quote up to 10 characters each side of the bad token instead of
// giving its position: `Unexpected token ']', ..."b": [1, 2,]" is not valid JSON`. A leading "..."
// means the token is 10 characters into the snippet; only a trailing "..." means the snippet starts
// the text; no dots means the whole (short) text is quoted.
// shortcut: in the short and repeated-snippet cases the first match is taken, which can point a few
// characters early on very repetitive input.
function snippetPosition(message, text) {
  if (/^Unexpected end of JSON input/.test(message)) return text.length;
  const m = message.match(/^Unexpected token '([\s\S])', (\.\.\.)?"([\s\S]*)"(\.\.\.)? is not valid JSON$/);
  if (!m) return null;
  const [, token, lead, snippet, trail] = m;
  if (lead) { const start = text.indexOf(snippet); return start < 0 ? null : start + 10; }
  if (trail) return snippet.length - 10;
  const at = text.indexOf(token);
  return at < 0 ? null : at;
}

// Live status for a panel: line count, UTF-8 size, and whether the text parses as JSON.
export function jsonStatus(text) {
  const lines = text ? text.split('\n').length : 0;
  const bytes = new TextEncoder().encode(text).length;
  if (!text.trim()) return { empty: true, ok: false, lines, bytes };
  try {
    JSON.parse(text);
    return { empty: false, ok: true, lines, bytes };
  } catch (e) {
    return { empty: false, ok: false, lines, bytes, error: { message: e.message, ...errorLocation(e.message, text) } };
  }
}

// Turns "almost JSON" (JS objects, JSONC, Python dicts) into JSON, keeping the layout: drops // and /* */
// comments and trailing commas, turns 'single' quotes into double, quotes bare keys, maps True/False/None/
// undefined/NaN/Infinity, and escapes raw control characters inside strings. Throws if the result still isn't JSON.
// shortcut: doesn't insert missing commas or complete truncated input; add that if users ask for it.
const BARE = new Map([['true', 'true'], ['false', 'false'], ['null', 'null'], ['True', 'true'], ['False', 'false'],
  ['None', 'null'], ['undefined', 'null'], ['NaN', 'null'], ['Infinity', 'null']]);
export function repairJson(s) {
  if (!s.trim()) return '';
  const o = [], n = s.length; // pieces; whitespace goes in one char at a time so it can be looked back over
  const isWs = p => p === ' ' || p === '\t' || p === '\n' || p === '\r';
  for (let i = 0; i < n;) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let str = '"', j = i + 1;
      for (; j < n && s[j] !== c; j++) {
        const d = s[j];
        if (d === '\\') { j++; str += s[j] === "'" ? "'" : '\\' + (s[j] ?? ''); }
        else if (d === '"') str += '\\"';
        else if (d < ' ') str += JSON.stringify(d).slice(1, -1);
        else str += d;
      }
      o.push(str + '"');
      i = j + 1;
    } else if (c === '/' && (s[i + 1] === '/' || s[i + 1] === '*')) {
      if (s[i + 1] === '/') while (i < n && s[i] !== '\n' && s[i] !== '\r') i++;
      else { const e = s.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; }
      while (o.at(-1) === ' ' || o.at(-1) === '\t') o.pop();
      if (!o.length || o.at(-1) === '\n') { // the comment had its own line: drop that line
        while (s[i] === ' ' || s[i] === '\t') i++;
        if (s[i] === '\r') i++;
        if (s[i] === '\n') i++;
      }
    } else if (/[\p{L}_$]/u.test(c)) {
      let j = i + 1;
      while (j < n && /[\p{L}\p{N}_$]/u.test(s[j])) j++;
      const w = s.slice(i, j);
      let k = j;
      while (isWs(s[k])) k++;
      if (s[k] === ':') o.push(JSON.stringify(w));
      else {
        if (w === 'Infinity' && o.at(-1) === '-') o.pop();
        o.push(BARE.get(w) ?? w);
      }
      i = j;
    } else {
      if (c === '}' || c === ']') {
        let k = o.length;
        while (k && isWs(o[k - 1])) k--;
        if (o[k - 1] === ',') o.splice(k - 1, 1);
      }
      o.push(c);
      i++;
    }
  }
  const out = o.join('');
  JSON.parse(out);
  return out;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Compare as JSON: one canonical layout (keys A→Z, 2-space indent) so only real data differences show.
export function normalizeJson(s) {
  return s.trim() ? linesText(jsonLines(JSON.parse(s), 2, true), 2) : '';
}

// UTF-8-safe Base64. Bytes go through String.fromCharCode in chunks (spreading a big array overflows the stack).
export function base64Encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Accepts standard and URL-safe Base64, with or without padding and line breaks.
export function base64Decode(s) {
  let b = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!b) return '';
  b += '='.repeat((4 - (b.length % 4)) % 4);
  let bin;
  try { bin = atob(b); } catch { throw new Error('This is not valid Base64.'); }
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error("The decoded data isn't UTF-8 text (it may be an image or other binary file)."); }
}

export const urlEncode = s => encodeURIComponent(s);
// '+' means a space in query strings; a literal plus is always encoded as %2B, so this is safe.
export function urlDecode(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); }
  catch { throw new Error('This is not valid URL encoding (a % must be followed by two hex digits).'); }
}

// Decodes a JWT's header and payload in the browser. Does NOT verify the signature.
export function decodeJwt(s) {
  const t = s.trim().replace(/^Bearer\s+/i, '');
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length === 5) throw new Error("This is an encrypted token (JWE). It can't be read without the key.");
  if (parts.length !== 3) throw new Error('A JWT has three parts separated by dots (header.payload.signature).');
  const part = (text, name) => {
    try { return JSON.parse(base64Decode(text)); }
    catch { throw new Error(`The ${name} is not valid Base64URL-encoded JSON.`); }
  };
  return { header: part(parts[0], 'header'), payload: part(parts[1], 'payload'), signature: parts[2] };
}

const span = sec => {
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, size] of units) {
    const n = Math.floor(sec / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? 's' : ''}`;
  }
  return 'less than a minute';
};
const utc = sec => new Date(sec * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

// Human-readable notes for the standard time claims (seconds since 1970), in claim order iat, nbf, exp.
export function jwtTimeNotes(payload, now = Date.now() / 1000) {
  const notes = [];
  const at = (claim, past, future) => {
    const v = payload?.[claim];
    if (typeof v !== 'number') return;
    const d = v - now;
    notes.push(`${d < 0 ? `${past} ${span(-d)} ago` : `${future} ${span(d)}`} (${utc(v)})`);
  };
  at('iat', 'Issued', 'Issued in');
  at('nbf', 'Valid since', 'Becomes valid in');
  at('exp', 'Expired', 'Expires in');
  return notes;
}

// [start, end] of each match of `q` in `text`, at most `limit`. Ignores case unless `matchCase`; `q` is plain
// text unless `regex` (then ^ and $ work per line); `wholeWord` needs a non-word character (or the edge) on
// both sides, where word characters are letters and digits of any language and _. Empty matches are skipped.
// Throws SyntaxError on a bad regex. A regex also keeps offsets in the original string; lowercasing first can
// change its length (e.g. 'İ').
// shortcut: a catastrophically backtracking regex can hang the tab; it is the user's own pattern on their own text.
export function findAll(text, q, limit = Infinity, { matchCase = false, wholeWord = false, regex = false } = {}) {
  const out = [];
  if (!q) return out;
  let src = regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  for (const m of text.matchAll(new RegExp(src, matchCase ? 'gmu' : 'gimu'))) {
    if (out.length >= limit) break;
    if (m[0]) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

// QR code for `s` (UTF-8, error correction M) as a black-on-white SVG with a 4-module quiet zone.
export function qrSvg(s) {
  if (!s.trim()) return '';
  const { size, data } = QRCode.create(s, { errorCorrectionLevel: 'M' }).modules; // throws when the text is too long
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      let run = 1; // one rectangle per horizontal run of dark modules
      while (x + run < size && data[y * size + x + run]) run++;
      d += `M${x + 4} ${y + 4}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  const n = size + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}"/></svg>`;
}

export const UUID_VERSIONS = [4, 7, 1, 6];
const GREGORIAN = 122192928000000000n; // 100 ns ticks from 1582-10-15 (the v1/v6 epoch) to 1970-01-01

// `count` UUIDs of `version` (RFC 9562), one per line. getRandomValues, not randomUUID, which is missing on plain-http pages.
export function uuids(count, version = 4, now = Date.now()) {
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Count must be a whole number from 1 to 1000.');
  if (!UUID_VERSIONS.includes(version)) throw new Error(`UUID version ${version} is not supported.`);
  const out = Array.from({ length: count }, (_, i) => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    const v = new DataView(b.buffer);
    if (version === 7) { v.setUint32(0, Math.floor(now / 2 ** 16)); v.setUint16(4, now % 2 ** 16); } // 48-bit Unix ms
    if (version === 1 || version === 6) {
      const t = BigInt(now) * 10000n + GREGORIAN + BigInt(i); // one 100 ns tick per UUID keeps a batch unique and ordered
      if (version === 1) { v.setUint32(0, Number(t & 0xffffffffn)); v.setUint16(4, Number((t >> 32n) & 0xffffn)); v.setUint16(6, Number(t >> 48n)); }
      else { v.setUint32(0, Number(t >> 28n)); v.setUint16(4, Number((t >> 12n) & 0xffffn)); v.setUint16(6, Number(t & 0xfffn)); }
      b[10] |= 1; // random node id, so the multicast bit is set (RFC 9562 §6.10)
    }
    b[6] = (b[6] & 0x0f) | (version << 4);
    b[8] = (b[8] & 0x3f) | 0x80; // RFC 9562 variant
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  });
  // A v7 batch shares one millisecond; sorting makes it ascend like a counter would.
  return (version === 7 ? out.sort() : out).join('\n');
}

const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW_TAGS = new Set(['script', 'style', 'pre', 'textarea']); // their contents are not HTML: never split into tags
// comment | doctype or <?xml?> | tag | text | a stray "<" and the text after it.
// As in browsers, a quote starts a value only right after "=" (so `alt=don't` is plain text); quoted values may hold ">" and "<".
// Each part of a tag matches one way only, and an unquoted "<" ends it, so a tag that never closes fails fast.
const HTML_TOKEN = /<!--[\s\S]*?(?:-->|$)|<[!?][^>]*>?|<(\/?)([a-zA-Z][\w:.-]*)(?:[^<>"'=]|=\s*"[^"]*"|=\s*'[^']*'|=(?!\s*["'])|(?<!=\s*)["'])*>|[^<]+|<[^<]*/g;

// Indent HTML two spaces per level. Contents of <pre> and <textarea> are kept exactly; <script> and <style> are re-indented.
// shortcut: every tag and text run gets its own line, so `<b>a</b><i>b</i>` renders with a space between
// them, and unclosed <li>/<p> nest one level deeper each until their parent closes; use a real parser if users hit it.
export function formatHtml(s) {
  if (!s.trim()) return '';
  const out = [], open = []; // open: [tag name, index of its line in out]
  const pad = () => '  '.repeat(open.length);
  const re = new RegExp(HTML_TOKEN);
  let m;
  while ((m = re.exec(s))) {
    const [tok, close, name] = m;
    if (!name) {
      const t = /^<[!?]/.test(tok) ? tok.trim() : tok.replace(/\s+/g, ' ').trim();
      if (t) out.push(pad() + t);
      continue;
    }
    const tag = name.toLowerCase();
    const text = tok.replace(/\s*=\s*("[^"]*"|'[^']*')|\s+/g, (_, q) => (q ? '=' + q : ' ')); // one line; quoted values kept as they are
    if (close) {
      const at = open.findLastIndex(([n]) => n === tag);
      if (at < 0) { out.push(pad() + text); continue; } // stray close tag
      const line = open[at][1];
      open.length = at;
      const body = out.slice(line + 1);
      // <div></div> and <p>Short text</p> stay on one line.
      if (!body.length) out[line] += text;
      else if (body.length === 1 && !/^\s*</.test(body[0]) && out[line].length + body[0].trim().length + text.length <= 100) out.splice(line, 2, out[line] + body[0].trim() + text);
      else out.push(pad() + text);
      continue;
    }
    out.push(pad() + text);
    if (VOID_TAGS.has(tag) || text.endsWith('/>')) continue;
    open.push([tag, out.length - 1]);
    if (!RAW_TAGS.has(tag)) continue;
    const closeTag = new RegExp('</' + tag, 'ig'); // not s.toLowerCase(): it can change the length ('İ'), so positions would drift
    closeTag.lastIndex = re.lastIndex;
    const end = closeTag.exec(s)?.index ?? s.length;
    const inner = s.slice(re.lastIndex, end);
    re.lastIndex = end;
    if (tag === 'pre' || tag === 'textarea') out[out.length - 1] += inner; // whitespace there is content
    else if (inner.trim()) {
      const lines = inner.replace(/^\s*\n|\s+$/g, '').split('\n');
      const cut = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
      out.push(...lines.map(l => (l.trim() ? pad() + l.slice(cut) : '')));
    }
  }
  return out.join('\n');
}

// The preview's document: no network (so pasted email HTML can't call home) and links can't open anything.
// The iframe's empty sandbox already stops scripts, forms and popups.
const PREVIEW_HEAD = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:"><base target="_blank">';
export const htmlPreview = s => s.replace(/^\s*(<!doctype[^>]*>)?/i, '$1' + PREVIEW_HEAD);
