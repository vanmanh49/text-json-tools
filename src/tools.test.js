import { test } from 'vitest';
import assert from 'node:assert/strict';
import { textToJson, jsonToText, minify, diffBlocks, applyCopy, jsonLines, linesText, splitSame, jsonStatus, errorLocation, formatSize, normalizeJson, decodeJwt, jwtTimeNotes, base64Encode, base64Decode, urlEncode, urlDecode, findAll, repairJson } from './tools.js';

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
