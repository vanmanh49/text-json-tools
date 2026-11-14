import { afterEach, beforeEach, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TextToJson, JsonToText, Minify, Jwt, Encode } from './TransformTool.jsx';
import { textStore } from '../textStore.js';
import { SAMPLES } from '../samples.js';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  for (const id of ['t2j-in', 'j2t-in', 'min-in', 'jwt-in', 'enc-in']) textStore.set(id, '');
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
