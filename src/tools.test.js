import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { textToJson, jsonToText, minify, diffBlocks, applyCopy, jsonLines, linesText, splitSame, jsonStatus, errorLocation, formatSize, normalizeJson, decodeJwt, jwtTimeNotes, base64Encode, base64Decode, urlEncode, urlDecode, findAll, repairJson, qrSvg, uuids, UUID_VERSIONS, formatHtml, htmlPreview, hexEncode, hexDecode, htmlEscape, htmlUnescape, unicodeEscape, unicodeUnescape, lineTool, describeTime, hash, HASH_ALGOS, regexMatches, regexReplace, MAX_MATCHES, jsonToCsv, csvToJson, CSV_DELIMS, jsonToTs, yamlToJson, jsonToYaml, jsonQuery } from './tools.js';
import jsQR from 'jsqr';
import * as yaml from 'js-yaml';
import { JSONPath } from 'jsonpath-plus';

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
  for (const f of [textToJson, jsonToText, minify, s => lineTool(s, 'sort'), describeTime, jsonToCsv, csvToJson, jsonToTs]) {
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

const changes = blocks => blocks.filter(b => b.type === 'change').length;

test('identical texts give only same blocks', () => {
  assert.deepEqual(diffBlocks('a\nb\n', 'a\nb\n'), [{ type: 'same', lines: ['a', 'b', ''] }]);
});
test('replacement is one change block', () => {
  assert.deepEqual(diffBlocks('a\nb\nc', 'a\nB\nc'), [
    { type: 'same', lines: ['a'] },
    { type: 'change', left: ['b'], right: ['B'] },
    { type: 'same', lines: ['c'] },
  ]);
});
test('pure addition and pure deletion', () => {
  assert.deepEqual(diffBlocks('a', 'a\nd'), [{ type: 'same', lines: ['a'] }, { type: 'change', left: [], right: ['d'] }]);
  assert.deepEqual(diffBlocks('a\nd', 'a'), [{ type: 'same', lines: ['a'] }, { type: 'change', left: ['d'], right: [] }]);
});
test('missing final newline does not swallow the last shared line', () => {
  // regression: raw diffLines treated 'c' and 'c\n' as different lines
  assert.equal(changes(diffBlocks('a\nb\nc', 'a\nB\nc\nd')), 2);
});

test('copy one line to the right replaces that line only', () => {
  const r = applyCopy('a\nb\nc\nd', 'a\nB\nC\nd', { block: 0, row: 1, dir: 'right' });
  assert.deepEqual(r, { left: 'a\nb\nc\nd', right: 'a\nB\nc\nd' });
});
test('copy one line to the left', () => {
  const r = applyCopy('a\nb\nc\nd', 'a\nB\nC\nd', { block: 0, row: 0, dir: 'left' });
  assert.deepEqual(r, { left: 'a\nB\nc\nd', right: 'a\nB\nC\nd' });
});
test('copying a line into a gap inserts it', () => {
  assert.equal(applyCopy('a\nb', 'a', { block: 0, row: 0, dir: 'right' }).right, 'a\nb');
});
test('copying a gap deletes the other side\'s line', () => {
  assert.equal(applyCopy('a', 'a\nb', { block: 0, row: 0, dir: 'right' }).right, 'a');
});
test('copy whole block in each direction', () => {
  const L = 'a\nb\nc', R = 'a\nB\nc\nd';
  assert.equal(applyCopy(L, R, { block: 0, dir: 'left' }).left, 'a\nB\nc');
  assert.equal(applyCopy(L, R, { block: 1, dir: 'right' }).right, 'a\nB\nc');
});

const pairs = [
  ['a\nb\nc\nx\n', 'a\nB\nc\ny\n'],
  ['a\nb', 'a\nb\n'],              // trailing newline mismatch
  ['a\r\nb\r\n', 'a\r\nB\r\n'],    // CRLF
  ['', 'x\ny'],                    // one side empty
  ['x\ny', ''],
];
for (const dir of ['right', 'left']) {
  test(`copying every block to the ${dir} makes the sides identical`, () => {
    for (let [L, R] of pairs) {
      const want = dir === 'right' ? L : R;
      for (let i = 0; changes(diffBlocks(L, R)); i++) {
        assert.ok(i < 10, `no progress on ${JSON.stringify([L, R])}`);
        ({ left: L, right: R } = applyCopy(L, R, { block: 0, dir }));
      }
      assert.equal(L, want);
      assert.equal(R, want);
    }
  });
}
test('copy is a no-op on an out-of-range block', () => {
  assert.deepEqual(applyCopy('a\nb', 'a\nB', { block: 5, dir: 'right' }), { left: 'a\nb', right: 'a\nB' });
});

test('very different large texts fail fast instead of freezing', () => {
  const rand = n => Array.from({ length: n }, () => Math.random().toString(36).slice(2)).join('\n');
  const t = Date.now();
  assert.throws(() => diffBlocks(rand(10000), rand(10000)), /too different/);
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t}ms`);
});

const indentStr = i => typeof i === 'number' ? ' '.repeat(i) : i;
const samples = [
  { a: 1, b: [1, 2, { c: null }], d: {}, e: [], f: 'x"y\n😀 Tiếng', g: true, h: -1.5e-7 },
  [], {}, 1, 'str', null, false, [[[]]], { '': { k: [{}] } }, [1, [2, [3, { x: [] }]]],
];
for (const indent of [2, 4, '\t']) {
  test(`jsonLines text equals JSON.stringify (indent ${JSON.stringify(indent)})`, () => {
    for (const v of samples) assert.equal(linesText(jsonLines(v, indent), indent), JSON.stringify(v, null, indent));
  });
}
test('jsonLines marks folds, counts and token classes', () => {
  const lines = jsonLines({ a: [1, 'x'], b: {} }, 2);
  assert.deepEqual(lines.map(l => [l.depth, l.end, l.count, l.kind]), [
    [0, 6, 2, '{'], [1, 4, 2, '['], [2, undefined, undefined, undefined], [2, undefined, undefined, undefined],
    [1, undefined, undefined, undefined], [1, undefined, undefined, undefined], [0, undefined, undefined, undefined],
  ]);
  assert.deepEqual(lines[1].parts, [['key', '"a"'], ['punc', ': '], ['punc', '[']]);
  assert.deepEqual(lines[2].parts, [['num', '1'], ['punc', ',']]);
  assert.deepEqual(lines[3].parts, [['str', '"x"']]);
  assert.deepEqual(lines[5].parts, [['key', '"b"'], ['punc', ': '], ['punc', '{}']]);
});
test('every fold ends on its matching closing line', () => {
  for (const v of samples) {
    const lines = jsonLines(v, 2);
    lines.forEach((l, i) => {
      if (l.end == null) return;
      assert.ok(l.end > i);
      assert.equal(lines[l.end].depth, l.depth);
      assert.equal(lines[l.end].parts[0][1], l.kind === '{' ? '}' : ']');
    });
  }
});
test('jsonLines can sort keys A→Z at every depth, including numeric-looking keys', () => {
  const text = linesText(jsonLines({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] }, 10: 0, 2: 0 }, 2, true), 2);
  assert.equal(text.replace(/\s+/g, ''), '{"10":0,"2":0,"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
});

const nums = n => Array.from({ length: n }, (_, i) => String(i));
test('splitSame keeps 3 lines of context on each side of a middle run', () => {
  assert.deepEqual(splitSame(nums(10), {}), { head: ['0', '1', '2'], hidden: ['3', '4', '5', '6'], tail: ['7', '8', '9'] });
});
test('splitSame shows only trailing context before the first change and leading context after the last', () => {
  assert.deepEqual(splitSame(nums(10), { first: true }), { head: [], hidden: nums(7), tail: ['7', '8', '9'] });
  assert.deepEqual(splitSame(nums(10), { last: true }), { head: ['0', '1', '2'], hidden: nums(10).slice(3), tail: [] });
});
test('splitSame never hides a single line', () => {
  assert.deepEqual(splitSame(nums(7), {}), { head: nums(7), hidden: [], tail: [] });
  assert.equal(splitSame(nums(8), {}).hidden.length, 2);
});
test('splitSame parts always rejoin to the input', () => {
  for (let n = 0; n <= 12; n++) for (const first of [false, true]) for (const last of [false, true]) {
    const { head, hidden, tail } = splitSame(nums(n), { first, last });
    assert.deepEqual([...head, ...hidden, ...tail], nums(n));
  }
});

test('jsonStatus: empty and valid input', () => {
  assert.deepEqual(jsonStatus(''), { empty: true, ok: false, lines: 0, bytes: 0 });
  assert.deepEqual(jsonStatus('  \n'), { empty: true, ok: false, lines: 2, bytes: 3 });
  assert.deepEqual(jsonStatus('{"a":1}'), { empty: false, ok: true, lines: 1, bytes: 7 });
});
test('jsonStatus counts UTF-8 bytes, not characters', () => {
  assert.equal(jsonStatus('"😀ế"').bytes, 9);
});
test('jsonStatus locates a parse error (V8 message with position and line/column)', () => {
  const st = jsonStatus('{\n "a": 1,\n}');
  assert.equal(st.ok, false);
  assert.deepEqual([st.error.pos, st.error.line, st.error.col], [11, 3, 1]);
  assert.ok(st.error.message.length > 0);
});
const text3 = '{\n "a": 1,\n}';
test('errorLocation reads Firefox, position-only and Safari messages', () => {
  assert.deepEqual(errorLocation('JSON.parse: expected double-quoted property name at line 3 column 1 of the JSON data', text3), { pos: 11, line: 3, col: 1 });
  assert.deepEqual(errorLocation('Unexpected token } in JSON at position 11', text3), { pos: 11, line: 3, col: 1 });
  assert.deepEqual(errorLocation("JSON Parse error: Expected '}'", text3), {});
});
test('formatSize boundaries', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1023), '1023 B');
  assert.equal(formatSize(1024), '1.0 KB');
  assert.equal(formatSize(12.4 * 1024), '12.4 KB');
  assert.equal(formatSize(1024 * 1024), '1.0 MB');
});
test('errorLocation reads V8 "Unexpected token" messages, which quote a snippet instead of a position', () => {
  const msg = t => { try { JSON.parse(t); } catch (e) { return e.message; } };
  const t1 = '{\n  "a": 1,\n  "b": [1, 2,]\n}';             // "...snippet" form
  assert.deepEqual(errorLocation(msg(t1), t1), { pos: 25, line: 3, col: 14 });
  const t2 = '[1,2,]' + ' '.repeat(40);                       // "snippet..." form
  assert.equal(errorLocation(msg(t2), t2).pos, 5);
  const t3 = '{"a": tru}';                                     // short text quoted whole
  assert.equal(errorLocation(msg(t3), t3).pos, 9);
  const t4 = '{"a":';                                          // unexpected end
  assert.deepEqual(errorLocation(msg(t4), t4), { pos: 5, line: 1, col: 6 });
});
test('jsonStatus gives a line for a trailing-comma error in Chrome/Node', () => {
  const st = jsonStatus('{\n  "a": 1,\n  "b": [1, 2,]\n}');
  assert.equal(st.error.line, 3);
});

test('normalizeJson makes key order and formatting irrelevant', () => {
  const a = normalizeJson('{"b":1,"a":{"d":2,"c":3}}');
  const b = normalizeJson('{\n "a": {"c":3,  "d":2},\n "b":1}');
  assert.equal(a, b);
  assert.equal(a, '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}');
  assert.equal(normalizeJson('  '), '');
  assert.throws(() => normalizeJson('{"a":'));
});

const b64url = s => Buffer.from(s).toString('base64url');
const token = (h, p, sig = 'c2ln') => `${b64url(JSON.stringify(h))}.${b64url(JSON.stringify(p))}.${sig}`;
test('decodeJwt decodes header and payload, including UTF-8 and a Bearer prefix', () => {
  const t = token({ alg: 'HS256', typ: 'JWT' }, { sub: '42', name: 'Nguyễn Ann' });
  assert.deepEqual(decodeJwt(t), { header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: '42', name: 'Nguyễn Ann' }, signature: 'c2ln' });
  assert.deepEqual(decodeJwt('Bearer ' + t + '\n').payload, { sub: '42', name: 'Nguyễn Ann' });
});
test('decodeJwt explains what is wrong with a bad token', () => {
  assert.throws(() => decodeJwt('a.b.c.d.e'), /encrypted/);
  assert.throws(() => decodeJwt('abc.def'), /three parts/);
  assert.throws(() => decodeJwt('!!!.' + b64url('{}') + '.x'), /header/);
  assert.throws(() => decodeJwt(b64url('{}') + '.' + b64url('not json') + '.x'), /payload/);
  assert.equal(decodeJwt('   '), null);
});
test('jwtTimeNotes describes iat, nbf and exp relative to now', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0) / 1000;
  assert.deepEqual(jwtTimeNotes({ iat: now - 60, nbf: now + 3600, exp: now + 7200, name: 'x' }, now), [
    'Issued 1 minute ago (2026-11-07 11:59:00 UTC)',
    'Becomes valid in 1 hour (2026-11-07 13:00:00 UTC)',
    'Expires in 2 hours (2026-11-07 14:00:00 UTC)',
  ]);
  assert.deepEqual(jwtTimeNotes({ exp: now - 3 * 86400 }, now), ['Expired 3 days ago (2026-11-04 12:00:00 UTC)']);
  assert.deepEqual(jwtTimeNotes({ exp: 'soon' }, now), []);
});

test('base64 round-trips UTF-8 text and accepts URL-safe input without padding', () => {
  assert.equal(base64Encode('hi'), 'aGk=');
  const s = 'Xin chào, thế giới! 😀';
  assert.equal(base64Decode(base64Encode(s)), s);
  assert.equal(base64Decode('aGk'), 'hi');
  assert.equal(base64Decode(Buffer.from('?>?').toString('base64url')), '?>?');
  assert.equal(base64Decode(' aG\nk= '), 'hi');
  assert.equal(base64Encode(''), '');
});
test('base64 handles large input and reports bad or binary data', () => {
  const big = 'é'.repeat(600000);
  assert.equal(base64Decode(base64Encode(big)), big);
  assert.throws(() => base64Decode('not base64!'), /Base64/);
  assert.throws(() => base64Decode('/w=='), /UTF-8/);
});
test('URL encode/decode', () => {
  assert.equal(urlEncode('a b&c=đ'), 'a%20b%26c%3D%C4%91');
  assert.equal(urlDecode('a+b%20c%C4%91'), 'a b cđ');
  assert.throws(() => urlDecode('%E0%A4%A'), /URL/);
});

test('findAll: case-insensitive plain-text matches with offsets into the original text', () => {
  assert.deepEqual(findAll('Ann ann ANN', 'ann'), [[0, 3], [4, 7], [8, 11]]);
  assert.deepEqual(findAll('a.b axb (a.b)', 'a.b'), [[0, 3], [9, 12]]); // '.' is literal
  assert.deepEqual(findAll('İx ix', 'ix'), [[3, 5]]);
  assert.deepEqual(findAll('aaaa', 'aa'), [[0, 2], [2, 4]]);
  assert.deepEqual(findAll('aaaa', 'a', 2), [[0, 1], [1, 2]]);
  assert.deepEqual(findAll('abc', ''), []);
});
test('findAll options: match case, whole word, regex', () => {
  assert.deepEqual(findAll('Ann ann', 'ann', Infinity, { matchCase: true }), [[4, 7]]);
  // whole word: letters, digits and _ from any language count as word characters
  assert.deepEqual(findAll('id userId id_x (id) chàoid', 'id', Infinity, { wholeWord: true }), [[0, 2], [16, 18]]);
  assert.deepEqual(findAll('a-1 b-22 c-333', String.raw`\w-\d{2,}`, Infinity, { regex: true }), [[4, 8], [9, 14]]);
  assert.deepEqual(findAll('cat category cats', 'cat|cats', Infinity, { regex: true, wholeWord: true }), [[0, 3], [13, 17]]);
  assert.deepEqual(findAll('a\nb\nab', '^b', Infinity, { regex: true }), [[2, 3]]); // ^ and $ work per line
  assert.deepEqual(findAll('abc', 'x*', Infinity, { regex: true }), []); // empty matches are skipped
  assert.deepEqual(findAll('a.b axb', 'a.b', Infinity, { wholeWord: true }), [[0, 3]]); // still literal without regex
  assert.throws(() => findAll('abc', '(', Infinity, { regex: true }), SyntaxError);
});

test('repairJson fixes comments, trailing commas, quotes, bare keys and Python literals', () => {
  const broken = `{
  // owner
  name: 'Ann "A"',  /* nickname */
  'it\\'s': True,
  tags: ['x', 'y',],
  none: None, n: NaN, low: -Infinity,
}`;
  assert.equal(repairJson(broken), `{
  "name": "Ann \\"A\\"",
  "it's": true,
  "tags": ["x", "y"],
  "none": null, "n": null, "low": null
}`);
});
test('repairJson escapes raw line breaks and tabs inside strings', () => {
  assert.deepEqual(JSON.parse(repairJson('{"a": "line1\nline2\tend"}')), { a: 'line1\nline2\tend' });
});
test('repairJson leaves comment-like text inside strings alone', () => {
  assert.equal(repairJson('{"url": "http://x.com/*a*/"}'), '{"url": "http://x.com/*a*/"}');
});
test('repairJson keeps unicode bare keys and valid JSON as is', () => {
  assert.equal(repairJson('{café: 1}'), '{"café": 1}');
  assert.equal(repairJson('[1, {"a": [true, null]}]'), '[1, {"a": [true, null]}]');
  assert.equal(repairJson('  '), '');
});
test('repairJson throws when it cannot produce valid JSON', () => {
  assert.throws(() => repairJson('{"a": 1 "b": 2}'));
  assert.throws(() => repairJson('{a: foo}'));
});

// Paints qrSvg's rectangles at 4 px per module and reads them back with jsQR, the decoder the QR tool uses.
function scanSvg(svg) {
  const n = Number(svg.match(/viewBox="0 0 (\d+)/)[1]), px = 4, w = n * px;
  const rgba = new Uint8ClampedArray(w * w * 4).fill(255);
  for (const [, x, y, run] of svg.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < run * px; dx++) {
      const i = ((y * px + dy) * w + x * px + dx) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
    }
  }
  return jsQR(rgba, w, w)?.data;
}
test('qrSvg round-trips through the decoder, UTF-8 included', () => {
  for (const s of ['https://example.com/?q=1', 'Xin chào, thế giới! 🎉', 'line 1\nline 2', 'x'.repeat(1000)]) assert.equal(scanSvg(qrSvg(s)), s);
});
test('qrSvg returns empty for blank text and throws when too long', () => {
  assert.equal(qrSvg(''), '');
  assert.equal(qrSvg('  \n'), '');
  assert.throws(() => qrSvg('x'.repeat(5000)), /too big/);
});

test('uuids makes distinct v4 UUIDs, one per line', () => {
  const ids = uuids(50).split('\n');
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('uuids rejects a bad count', () => {
  for (const n of [0, 1001, 1.5, NaN]) assert.throws(() => uuids(n), /1 to 1000/);
});

const uuidRe = v => new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${v}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0, 123);
const ticks = BigInt(NOW) * 10000n + 122192928000000000n;
test('uuids sets the version and variant for every supported version', () => {
  for (const v of UUID_VERSIONS) {
    const ids = uuids(20, v).split('\n');
    assert.equal(new Set(ids).size, 20);
    for (const id of ids) assert.match(id, uuidRe(v));
  }
});
test('uuids v7 holds the Unix ms and a batch ascends', () => {
  const ids = uuids(100, 7, NOW).split('\n');
  for (const id of ids) assert.equal(parseInt(id.replace('-', '').slice(0, 12), 16), NOW);
  assert.deepEqual(ids, [...ids].sort());
});
test('uuids v1 and v6 hold the 100 ns timestamp since 1582', () => {
  const [a1, b1] = uuids(2, 1, NOW).split('\n').map(h => h.split('-'));
  assert.equal(BigInt('0x' + a1[2].slice(1) + a1[1] + a1[0]), ticks);
  assert.equal(BigInt('0x' + b1[2].slice(1) + b1[1] + b1[0]), ticks + 1n);
  const ids6 = uuids(50, 6, NOW).split('\n');
  const p = ids6[0].split('-');
  assert.equal(BigInt('0x' + p[0] + p[1] + p[2].slice(1)), ticks);
  assert.deepEqual(ids6, [...ids6].sort());
  for (const id of [...ids6, a1.join('-')]) assert.equal(parseInt(id.split('-')[4].slice(0, 2), 16) & 1, 1); // multicast bit
});
test('uuids rejects an unsupported version', () => {
  for (const v of [2, 3, 5, 8]) assert.throws(() => uuids(1, v), /not supported/);
});

test('formatHtml indents nested tags and keeps short elements on one line', () => {
  const src = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hi</title></head><body><div   class="a"\n id=b><p>Hello <b>world</b></p><br><img src="a.png" alt="x > y"/><div></div></div></body></html>';
  assert.equal(formatHtml(src), [
    '<!DOCTYPE html>', '<html>', '  <head>', '    <meta charset="utf-8">', '    <title>Hi</title>', '  </head>', '  <body>',
    '    <div class="a" id=b>', '      <p>', '        Hello', '        <b>world</b>', '      </p>', '      <br>',
    '      <img src="a.png" alt="x > y"/>', '      <div></div>', '    </div>', '  </body>', '</html>',
  ].join('\n'));
});

test('formatHtml keeps pre exactly, re-indents script, and is stable', () => {
  const src = '<div><pre>  a\n    b </pre><script>\n        if (a < b) {\n          go();\n        }\n</script><!-- note --></div>';
  const out = formatHtml(src);
  assert.equal(out, '<div>\n  <pre>  a\n    b </pre>\n  <script>\n    if (a < b) {\n      go();\n    }\n  </script>\n  <!-- note -->\n</div>');
  assert.equal(formatHtml(out), out);
});

test('formatHtml copes with broken HTML', () => {
  assert.equal(formatHtml('  \n '), '');
  assert.equal(formatHtml('a < b</span><ul><li>x<li>y</ul>'), 'a\n< b\n</span>\n<ul>\n  <li>\n    x\n    <li>\n      y\n</ul>');
  assert.equal(formatHtml('<script>x'), '<script>\n  x');
  // lowercasing 'İ' adds a character; the close tag must still be found in the right place
  assert.equal(formatHtml('<p>İstanbul</p><SCRIPT>x()</SCRIPT><p>after</p>'), '<p>İstanbul</p>\n<SCRIPT>x()</SCRIPT>\n<p>after</p>');
  // a quote opens a value only after "=", as in browsers
  assert.equal(formatHtml("<div><img alt=don't src=a.png><p>Bob's day</p></div>"), "<div>\n  <img alt=don't src=a.png>\n  <p>Bob's day</p>\n</div>");
  assert.equal(formatHtml('<a  href = "x > <y"\n title=\'it\'s\'>z</a>'), '<a href="x > <y" title=\'it\'s\'>z</a>');
});

test('formatHtml stays fast on tags that never close', () => {
  const t = performance.now();
  formatHtml('<a '.repeat(20000) + "'");
  formatHtml('<a title="'.repeat(20000));
  assert.ok(performance.now() - t < 500, `took ${performance.now() - t} ms`);
});

test('htmlPreview puts the no-network policy after the doctype', () => {
  assert.match(htmlPreview('<!doctype html><p>x'), /^<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none';.*<p>x$/);
  assert.match(htmlPreview('<p>x'), /^<meta http-equiv="Content-Security-Policy"/);
});

test('encoders map empty input to empty output', () => {
  for (const f of [hexEncode, hexDecode, htmlEscape, htmlUnescape, unicodeEscape, unicodeUnescape]) assert.equal(f(''), '');
  assert.equal(hexDecode(' \n'), '');
});
test('hexEncode gives lowercase UTF-8 hex', () => {
  assert.equal(hexEncode('Hi é😀'), '486920c3a9f09f9880');
});
test('hexDecode ignores separators, 0x prefixes and case', () => {
  for (const h of ['486920c3a9f09f9880', '48:69 20 C3A9 0xf0 0x9f 0x98 0x80', '48-69-20-c3-a9-f0-9f-98-80', '48,69,20,c3,a9,f0,9f,98,80']) {
    assert.equal(hexDecode(h), 'Hi é😀');
  }
});
test('hexDecode rejects odd digits, non-hex and non-UTF-8', () => {
  assert.throws(() => hexDecode('486'), /two digits/);
  assert.throws(() => hexDecode('zz'), /not valid hex/);
  assert.throws(() => hexDecode('ff'), /isn't UTF-8/);
});
test('htmlEscape escapes the five special characters and htmlUnescape reverses it', () => {
  const src = `<a href="x">Tom & Jerry's</a>`;
  const esc = '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;';
  assert.equal(htmlEscape(src), esc);
  assert.equal(htmlUnescape(esc), src);
});
test('htmlUnescape decodes numbers and common names in one pass, leaving the rest', () => {
  assert.equal(htmlUnescape('&amp;lt; &#233; &#x1F600; &copy; &bogus; &#x110000;'), '&lt; é 😀 © &bogus; &#x110000;');
});
test('unicodeEscape escapes non-ASCII code units and unicodeUnescape reverses it', () => {
  assert.equal(unicodeEscape('é😀a\n'), '\\u00e9\\ud83d\\ude00a\n');
  assert.equal(unicodeUnescape('\\u00e9\\ud83d\\ude00a\n'), 'é😀a\n');
});
test('unicodeUnescape decodes \\u{…} and leaves malformed escapes', () => {
  assert.equal(unicodeUnescape('\\u{1F600} \\u12 \\u{110000}'), '😀 \\u12 \\u{110000}');
});

test('lineTool sorts naturally and drops one trailing newline', () => {
  assert.equal(lineTool('b\nItem10\na\nitem2\nItem1\n', 'sort'), 'a\nb\nItem1\nitem2\nItem10');
  assert.equal(lineTool('b\nItem10\na\nitem2\nItem1\n', 'sort-desc'), 'Item10\nitem2\nItem1\nb\na');
});
test('lineTool sorts Vietnamese like localeCompare', () => {
  assert.equal(lineTool('ả\nă\na', 'sort'), ['ả', 'ă', 'a'].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join('\n'));
});
test('lineTool unique keeps the first and handles CRLF', () => {
  assert.equal(lineTool('x\r\ny\r\nx', 'unique'), 'x\ny');
});
test('lineTool no-empty and trim', () => {
  assert.equal(lineTool(' a \n\n  \nb', 'no-empty'), ' a \nb');
  assert.equal(lineTool(' a \n\n  \nb', 'trim'), 'a\n\n\nb');
});
test('lineTool reverse, upper, lower and unknown op', () => {
  assert.equal(lineTool('a\nB\nc', 'reverse'), 'c\nB\na');
  assert.equal(lineTool('a\nB', 'upper'), 'A\nB');
  assert.equal(lineTool('a\nB', 'lower'), 'a\nb');
  assert.throws(() => lineTool('x', 'nope'));
});
test('describeTime reads 10 digits as seconds and 13 as milliseconds', () => {
  const s = describeTime('1700000000', 1700000060000);
  assert.match(s, /^Read as       Unix seconds$/m);
  assert.match(s, /^ISO 8601      2023-11-14T22:13:20\.000Z$/m);
  assert.match(s, /^Relative      1 minute ago$/m);
  const ms = describeTime('1700000000000', 1700000060000);
  assert.match(ms, /^Read as       Unix milliseconds$/m);
  assert.match(ms, /^ISO 8601      2023-11-14T22:13:20\.000Z$/m);
});
test('describeTime reads date text and says when it is local time', () => {
  assert.match(describeTime('2023-11-14T22:13:20Z'), /^Unix seconds  1700000000$/m);
  assert.match(describeTime('2023-11-14 22:13:20'), /^Read as       date text \(local time/m);
  assert.match(describeTime('1700000000', 1699999940000), /^Relative      in 1 minute$/m);
  assert.throws(() => describeTime('soon'), /can read/);
});

test('hash gives lowercase hex SHA digests of UTF-8 text', async () => {
  assert.equal(await hash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await hash('abc', 'SHA-1'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.deepEqual(HASH_ALGOS, ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);
});
test('hash handles emoji as UTF-8 and empty input as empty', async () => {
  const want = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode('😀'))), b => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await hash('😀', 'SHA-512'), want);
  assert.equal(await hash(''), '');
});
test('hash explains a missing crypto.subtle', async () => {
  vi.stubGlobal('crypto', {});
  try { await assert.rejects(hash('x'), /https/); } finally { vi.unstubAllGlobals(); }
});

test('regexMatches lists matches with numbered and named groups', () => {
  assert.deepEqual(JSON.parse(regexMatches('ann@x.com, bo@y.org', '(\\w+)@(?<host>[\\w.]+)', 'g')), {
    count: 2,
    matches: [
      { match: 'ann@x.com', index: 0, groups: ['ann', 'x.com'], named: { host: 'x.com' } },
      { match: 'bo@y.org', index: 11, groups: ['bo', 'y.org'], named: { host: 'y.org' } },
    ],
  });
});
test('regexMatches takes only the first match without g and keeps empty matches with it', () => {
  assert.equal(JSON.parse(regexMatches('ann@x.com, bo@y.org', '\\w+@', '')).count, 1);
  assert.equal(JSON.parse(regexMatches('ab', 'x*', 'g')).count, 3);
  assert.deepEqual(JSON.parse(regexMatches('a', '(b)?a', 'g')).matches[0].groups, [null]);
  assert.deepEqual(JSON.parse(regexMatches('a', 'a', 'g')).matches[0], { match: 'a', index: 0 });
});
test('regexMatches counts every match but lists at most MAX_MATCHES', () => {
  const r = JSON.parse(regexMatches('a'.repeat(1500), 'a', 'g'));
  assert.equal(MAX_MATCHES, 1000);
  assert.equal(r.count, 1500);
  assert.equal(r.matches.length, 1000);
});
test('regexMatches throws on a bad pattern or flags, and is empty for empty input', () => {
  assert.throws(() => regexMatches('a', '(', 'g'));
  assert.throws(() => regexMatches('a', 'a', 'q'));
  assert.equal(regexMatches('', 'a', 'g'), '');
  assert.equal(regexMatches('a', '', 'g'), '');
});
test('regexReplace uses JS replacement patterns', () => {
  assert.equal(regexReplace('ann@x.com', '(\\w+)@(?<h>\\w+)', 'g', '$<h>:$1'), 'x:ann.com');
  assert.equal(regexReplace('a1b2', '\\d', 'g', ''), 'ab');
  assert.equal(regexReplace('a1b2', '\\d', '', '#'), 'a#b2');
});

test('jsonToCsv writes a header from all keys and quotes where needed', () => {
  assert.equal(jsonToCsv('[{"a":1,"b":"x,y"},{"b":"say \\"hi\\"","c":null,"d":{"e":[1]}}]'), 'a,b,c,d\n1,"x,y",,\n,"say ""hi""",,"{""e"":[1]}"');
});
test('JSON → CSV → JSON keeps delimiters, quotes, newlines, CRLF and edge spaces', () => {
  const rows = [{ name: 'a,b', note: 'line1\r\nline2', q: '"x"', sp: ' pad ', semi: 'a;b', tab: 'a\tb' }];
  for (const [d] of CSV_DELIMS) assert.deepEqual(JSON.parse(csvToJson(jsonToCsv(JSON.stringify(rows), d), d)), rows);
});
test('csvToJson strips a BOM, names blank headers, skips blank lines and pads short rows', () => {
  assert.deepEqual(JSON.parse(csvToJson('﻿a,,a2\r\n1,2\r\n\r\n3\r\n')), [{ a: '1', column2: '2', a2: '' }, { a: '3', column2: '', a2: '' }]);
});
test('csvToJson rejects repeated headers, long rows and unclosed quotes', () => {
  assert.throws(() => csvToJson('a,a\n1,2'), /appears twice/);
  assert.throws(() => csvToJson('a\n1,2'), /Row 2 has 2 fields/);
  assert.throws(() => csvToJson('a\n"1'), /Row 2 has a quote that never closes/);
});
test('csvToJson keeps values as text and a stray quote as written', () => {
  assert.deepEqual(JSON.parse(csvToJson('id;n\n007;a"b', ';')), [{ id: '007', n: 'a"b' }]);
});
test('jsonToCsv handles arrays of arrays, primitives and a single object', () => {
  assert.equal(jsonToCsv('[[1,2],[3]]'), '1,2\n3');
  assert.equal(jsonToCsv('["x","y"]'), 'value\nx\ny');
  assert.equal(jsonToCsv('{"a":1}'), 'a\n1');
  assert.equal(jsonToCsv('[]'), '');
});
test('jsonToCsv rejects mixed items and top-level primitives', () => {
  assert.throws(() => jsonToCsv('[{"a":1},2]'), /item 2 is a number/);
  assert.throws(() => jsonToCsv('3'), /array or object/);
});

test('jsonToTs writes nested and array-item interfaces, optional keys and quoted names', () => {
  assert.equal(jsonToTs('{"id":1,"name":"Ann","tags":["a"],"address":{"city":"Hanoi"},"users":[{"id":1},{"id":2,"email":null}],"first-name":"A"}'), `export interface Root {
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
}`);
});
test('jsonToTs types top-level arrays and values', () => {
  assert.equal(jsonToTs('[1,"a",[]]'), 'export type Root = (number | string | unknown[])[];');
  assert.equal(jsonToTs('"x"'), 'export type Root = string;');
  assert.equal(jsonToTs('[{"a":true}]'), 'export type Root = RootItem[];\n\nexport interface RootItem {\n  a: boolean;\n}');
});
test('jsonToTs names repeated and plural keys', () => {
  assert.match(jsonToTs('{"a":{"x":1},"b":{"a":{"y":2}}}'), /interface A \{\n  x: number;\n\}[\s\S]*interface A2 \{\n  y: number;\n\}/);
  const t = jsonToTs('{"categories":[{"v":1}],"data":[{"v":1}],"2fa":{"on":true}}');
  assert.match(t, /categories: Category\[\];/);
  assert.match(t, /data: DataItem\[\];/);
  assert.match(t, /"2fa": T2fa;/);
});
test('jsonToTs unions differing types and types empty objects as records', () => {
  assert.match(jsonToTs('{"v":[{"n":1},{"n":"x"}]}'), /  n: number \| string;/);
  assert.match(jsonToTs('{"e":{}}'), /  e: Record<string, unknown>;/);
  assert.match(jsonToTs('{"m":[[1],[2,3]]}'), /  m: number\[\]\[\];/);
});

test('yamlToJson keeps dates as text and resolves anchors and merge keys', () => {
  assert.deepEqual(JSON.parse(yamlToJson('a: 1\nb: [x, "2"]\nd: 2024-01-01\nyes: no\nbase: &b {k: v}\nc:\n  <<: *b\n', yaml)),
    { a: 1, b: ['x', '2'], d: '2024-01-01', yes: 'no', base: { k: 'v' }, c: { k: 'v' } });
});
test('yamlToJson reports bad YAML and several documents', () => {
  assert.throws(() => yamlToJson('a: [', yaml), { message: 'unexpected end of the stream within a flow collection (line 1, column 5)' });
  assert.throws(() => yamlToJson('a: 1\n---\nb: 2', yaml), /single document/);
});
test('jsonToYaml does not fold long strings and round-trips', () => {
  const long = '{"a":1,"s":"long text that should not be folded even past eighty characters, really not folded at all"}';
  assert.ok(!jsonToYaml(long, yaml).trim().includes('\n  '));
  const x = JSON.stringify({ name: 'Ann Nguyễn', n: 3, ok: true, none: null, tags: ['dev', 'yes', '007'], nested: { list: [{ a: 1 }] } });
  assert.equal(yamlToJson(jsonToYaml(x, yaml), yaml), JSON.stringify(JSON.parse(x), null, 2));
});
test('yaml functions return empty for empty input', () => {
  assert.equal(yamlToJson('  ', yaml), '');
  assert.equal(jsonToYaml('', yaml), '');
});

const QJ = JSON.stringify({ items: [{ n: 'a', price: 5 }, { n: 'b', price: 20 }], tags: ['x', 'y'] });
test('jsonQuery returns every match as a pretty JSON array', () => {
  assert.equal(jsonQuery(QJ, '$.tags[*]', JSONPath), '[\n  "x",\n  "y"\n]');
  assert.deepEqual(JSON.parse(jsonQuery(QJ, '$.items[?(@.price < 10)].n', JSONPath)), ['a']);
  assert.deepEqual(JSON.parse(jsonQuery(QJ, '$..n', JSONPath)), ['a', 'b']);
  assert.equal(jsonQuery(QJ, '$.nope', JSONPath), '[]');
});
test('jsonQuery never runs code from a filter', () => {
  globalThis.pwned = false;
  try { jsonQuery(QJ, '$.items[?(globalThis.pwned = true)]', JSONPath); } catch { /* refusing is fine */ }
  try { jsonQuery(QJ, '$.items[?(constructor.constructor("globalThis.pwned = true")())]', JSONPath); } catch { /* refusing is fine */ }
  assert.equal(globalThis.pwned, false);
  delete globalThis.pwned;
});
test('jsonQuery is empty for empty JSON or path', () => {
  assert.equal(jsonQuery('', '$', JSONPath), '');
  assert.equal(jsonQuery(QJ, ' ', JSONPath), '');
});
test('describeTime reads a date with no time as local midnight, as it says', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'Asia/Ho_Chi_Minh'; // UTC+7, so UTC and local midnight differ
  try {
    for (const d of ['2024-01-01', '2024-01-01T00:00']) {
      assert.match(describeTime(d), /^ISO 8601      2023-12-31T17:00:00\.000Z$/m, d);
      assert.match(describeTime(d), /^Read as       date text \(local time/m);
    }
    assert.match(describeTime('2024-01'), /^ISO 8601      2023-12-31T17:00:00\.000Z$/m);
    assert.match(describeTime('2024-01-01T00:00Z'), /^ISO 8601      2024-01-01T00:00:00\.000Z$/m);
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
});
