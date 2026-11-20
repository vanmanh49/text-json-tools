import { afterEach, beforeEach, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransformTool, { TextToJson, JsonToText, Minify, Jwt, Encode, Timestamp, Regex, Csv, Yaml, Query } from './TransformTool.jsx';
import { textStore } from '../textStore.js';
import { SAMPLES } from '../samples.js';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  for (const id of ['t2j-in', 'j2t-in', 'min-in', 'jwt-in', 'enc-in', 'lines-in', 'time-in', 'hash-in', 're-in', 'csv-in', 'ts-in', 'yaml-in', 'query-in']) textStore.set(id, '');
});

const err = c => c.querySelector('.err').textContent;

test('minify output follows input', () => {
  const { container } = render(<Minify />);
  act(() => textStore.set('min-in', '{\n "a": 1\n}'));
  expect(container.querySelector('#min-out').value).toBe('{"a":1}');
});

test('text-to-json error shows on the err line', () => {
  const { container } = render(<TextToJson />);
  act(() => textStore.set('t2j-in', '"\\x"'));
  expect(err(container)).not.toBe('');
  expect(container.querySelector('#t2j-out').value).toBe('');
});

test('json-to-text input errors stay off the err line', () => {
  const { container } = render(<JsonToText />);
  act(() => textStore.set('j2t-in', '{bad'));
  expect(err(container)).toBe('');
  expect(container.querySelector('#j2t-out').value).toBe('');
});

test('jwt shows expiry notes and never stores the token', () => {
  const { container } = render(<Jwt />);
  act(() => textStore.set('jwt-in', SAMPLES['jwt-in']));
  const list = container.querySelector('#jwt-times');
  expect(list.hidden).toBe(false);
  expect(list.textContent).toContain('Expires in');
  expect(container.querySelector('#jwt-out').value).toContain('"alg": "HS256"');
  expect(localStorage.getItem('tjt:text:jwt-in')).toBeNull();
});

test('jwt list is hidden without a token', () => {
  const { container } = render(<Jwt />);
  expect(container.querySelector('#jwt-times').hidden).toBe(true);
});

test('encode mode change re-runs', () => {
  const { container } = render(<Encode />);
  act(() => textStore.set('enc-in', 'a b'));
  fireEvent.change(container.querySelector('#enc-mode'), { target: { value: 'url-encode' } });
  expect(container.querySelector('#enc-out').value).toBe('a%20b');
});

test('panel messages show on the err line and clear when the input changes', async () => {
  const { container } = render(<Encode />);
  Object.assign(navigator, { clipboard: { readText: () => Promise.reject(new Error('no')) } });
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Paste' })[0]); });
  expect(err(container)).toContain('blocked clipboard');
  act(() => textStore.set('enc-in', 'x'));
  expect(err(container)).toBe('');
});

test('timestamp Now fills the input', () => {
  const { container } = render(<Timestamp />);
  fireEvent.click(screen.getByRole('button', { name: 'Now' }));
  expect(container.querySelector('#time-in').value).toMatch(/^\d{10}$/);
  expect(container.querySelector('#time-out').value).toMatch(/^Read as {7}Unix seconds/);
});

test('async output ignores a stale result and shows a rejection', async () => {
  const pending = {};
  const fn = s => new Promise((res, rej) => { pending[s] = { res, rej }; });
  const { container } = render(<TransformTool tab="t" inId="hash-in" inLabel="In" inExt="txt" outId="t-out" outLabel="Out" outExt="txt" fn={fn} />);
  act(() => textStore.set('hash-in', 'a'));
  act(() => textStore.set('hash-in', 'b'));
  await act(async () => pending.b.res('B'));
  await act(async () => pending.a.res('A'));
  expect(container.querySelector('#t-out').value).toBe('B');
  act(() => textStore.set('hash-in', 'c'));
  await act(async () => pending.c.rej(new Error('boom')));
  expect(err(container)).toBe('boom');
  expect(container.querySelector('#t-out').value).toBe('');
});

test('regex tester shows matches, then the replaced text', () => {
  const { container } = render(<Regex />);
  act(() => textStore.set('re-in', 'a1 b22'));
  fireEvent.change(container.querySelector('#re-pattern'), { target: { value: '\\d+' } });
  expect(JSON.parse(container.querySelector('#re-out').value).count).toBe(2);
  expect(container.querySelector('#re-replace')).toBeNull();
  fireEvent.change(container.querySelector('#re-show'), { target: { value: 'replace' } });
  fireEvent.change(container.querySelector('#re-replace'), { target: { value: '#' } });
  expect(container.querySelector('#re-out').value).toBe('a# b#');
  fireEvent.change(container.querySelector('#re-pattern'), { target: { value: '(' } });
  expect(err(container)).toMatch(/Invalid regular expression/);
});

test('switching CSV direction keeps the input', () => {
  const { container } = render(<Csv />);
  act(() => textStore.set('csv-in', 'a\n1'));
  fireEvent.change(container.querySelector('#csv-dir'), { target: { value: 'csv-to-json' } });
  expect(container.querySelector('#csv-in').value).toBe('a\n1');
  expect(container.querySelector('#csv-out').value).toBe('[\n  {\n    "a": "1"\n  }\n]');
});

test('yaml converts once its tab is shown, in both directions', async () => {
  const { container, rerender } = render(<Yaml hidden />);
  act(() => textStore.set('yaml-in', 'a: 1'));
  await act(async () => {});
  expect(container.querySelector('#yaml-out').value).toBe('');
  rerender(<Yaml hidden={false} />);
  await waitFor(() => expect(container.querySelector('#yaml-out').value).toBe('{\n  "a": 1\n}'));
  act(() => textStore.set('yaml-in', '{"b":[1]}'));
  fireEvent.change(container.querySelector('#yaml-dir'), { target: { value: 'json-to-yaml' } });
  await waitFor(() => expect(container.querySelector('#yaml-out').value).toBe('b:\n  - 1\n'));
});

test('json query runs the path on the input', async () => {
  const { container } = render(<Query />);
  act(() => textStore.set('query-in', '{"a":[{"b":1},{"b":2}]}'));
  fireEvent.change(container.querySelector('#query-path'), { target: { value: '$.a[*].b' } });
  await waitFor(() => expect(container.querySelector('#query-out').value).toBe('[\n  1,\n  2\n]'));
});

test('json-input tools show errors that are not JSON syntax errors', async () => {
  const { container } = render(<Csv />);
  act(() => textStore.set('csv-in', '[{"a":1},2]'));
  expect(err(container)).toBe('Each item must be an object (item 2 is a number).');
  act(() => textStore.set('csv-in', '[{"a":'));
  expect(err(container)).toBe(''); // the status bar explains a parse error
  cleanup();
  const q = render(<Query />).container;
  act(() => textStore.set('query-in', '{"a":[1]}'));
  fireEvent.change(q.querySelector('#query-path'), { target: { value: '$.a[?(@ <)]' } });
  await waitFor(() => expect(err(q)).toBe('Expected expression after < at character 6'));
});
