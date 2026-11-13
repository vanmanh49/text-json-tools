import { diffArrays } from 'diff';

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

// [start, end] of each case-insensitive match of `q` in `text`, at most `limit`. `q` is plain text, not a pattern.
export function findAll(text, q, limit = Infinity) {
  const out = [];
  if (!q) return out;
  // A regex keeps offsets in the original string; lowercasing first can change its length (e.g. 'İ').
  for (const m of text.matchAll(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))) {
    if (out.length >= limit) break;
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}
