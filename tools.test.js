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
