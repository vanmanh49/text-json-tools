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
