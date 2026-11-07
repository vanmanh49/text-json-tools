import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToJson, jsonToText, minify, diffBlocks, applyCopy } from './tools.js';

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

test('page loads jsdiff from a local file, not a CDN', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const src = map.imports.diff;
  assert.match(src, /^\.\//, 'import map must point at a local path so a blocked CDN cannot blank the page');
  const mod = await import(new URL(src, import.meta.url));
  assert.equal(typeof mod.diffArrays, 'function');
});
test('very different large texts fail fast instead of freezing', () => {
  const rand = n => Array.from({ length: n }, () => Math.random().toString(36).slice(2)).join('\n');
  const t = Date.now();
  assert.throws(() => diffBlocks(rand(10000), rand(10000)), /too different/);
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t}ms`);
});
