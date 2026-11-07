import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToJson, jsonToText, minify, diffBlocks, merge } from './tools.js';

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
  const blocks = diffBlocks('a\nb\nc', 'a\nB\nc\nd');
  assert.equal(changes(blocks), 2);
  assert.equal(merge(blocks, ['left']), 'a\nb\nc\nd');
});
test('merge defaults to right, all-left gives left', () => {
  const L = 'a\nb\nc\n', R = 'a\nB\nc\nd\n';
  const blocks = diffBlocks(L, R);
  assert.equal(merge(blocks, []), R);
  assert.equal(merge(blocks, Array(changes(blocks)).fill('left')), L);
});
test('merge picks per block', () => {
  const blocks = diffBlocks('a\nb\nc\nx\n', 'a\nB\nc\ny\n');
  assert.equal(merge(blocks, ['left', 'right']), 'a\nb\nc\ny\n');
});
test('trailing newline mismatch round-trips exactly', () => {
  const L = 'a\nb', R = 'a\nb\n';
  const blocks = diffBlocks(L, R);
  assert.equal(merge(blocks, Array(changes(blocks)).fill('left')), L);
  assert.equal(merge(blocks, []), R);
});
test('one side empty', () => {
  const blocks = diffBlocks('', 'x\ny');
  assert.deepEqual(blocks, [{ type: 'change', left: [''], right: ['x', 'y'] }]);
  assert.equal(merge(blocks, ['left']), '');
  assert.equal(merge(blocks, []), 'x\ny');
});
test('CRLF text merges back unchanged', () => {
  const L = 'a\r\nb\r\n', R = 'a\r\nB\r\n';
  const blocks = diffBlocks(L, R);
  assert.equal(merge(blocks, ['left']), L);
  assert.equal(merge(blocks, []), R);
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
