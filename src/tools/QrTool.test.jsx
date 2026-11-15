import { afterEach, beforeEach, expect, test } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import QrTool from './QrTool.jsx';
import { textStore } from '../textStore.js';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); textStore.set('qr-in', ''); });

test('text becomes a QR image and is never stored', async () => {
  const { container } = render(<QrTool />);
  expect(container.querySelector('#qr-img')).toBeNull();
  expect(container.querySelector('#qr-png').disabled).toBe(true);
  act(() => textStore.set('qr-in', 'hello'));
  expect(container.querySelector('#qr-img').src).toMatch(/^data:image\/svg\+xml/);
  expect(container.querySelector('#qr-png').disabled).toBe(false);
  await new Promise(r => setTimeout(r, 100)); // past the store's save debounce
  expect(localStorage.getItem('tjt:text:qr-in')).toBeNull();
});

test('too much text shows an error instead of an image', () => {
  const { container } = render(<QrTool />);
  act(() => textStore.set('qr-in', 'x'.repeat(5000)));
  expect(container.querySelector('#qr-img')).toBeNull();
  expect(container.querySelector('.err').textContent).toMatch(/too big/);
});
