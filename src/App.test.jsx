import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from './App.jsx';
import { textStore } from './textStore.js';

beforeEach(() => {
  localStorage.clear();
  location.hash = '';
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); // jsdom has none; Compare observes #diff
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const hiddenTabs = c => [...c.querySelectorAll('section[data-tab]')].filter(s => s.hidden).map(s => s.dataset.tab);

test('unknown hash shows format', () => {
  location.hash = '#nope';
  const { container } = render(<App />);
  expect(container.querySelector('section[data-tab="format"]').hidden).toBe(false);
  expect(hiddenTabs(container)).toHaveLength(6);
});

test('hashchange switches tab and sets aria-current', () => {
  location.hash = '#format';
  const { container } = render(<App />);
  act(() => { location.hash = '#jwt'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(container.querySelector('section[data-tab="jwt"]').hidden).toBe(false);
  expect(container.querySelector('section[data-tab="format"]').hidden).toBe(true);
  expect(container.querySelector('nav a[aria-current="page"]').getAttribute('href')).toBe('#jwt');
  expect(container.querySelectorAll('nav a[aria-current]')).toHaveLength(1);
  expect(document.body.classList.contains('app')).toBe(true);
});

test('theme button cycles and saves', () => {
  const { container } = render(<App />);
  const btn = container.querySelector('#theme');
  const seen = [];
  for (let i = 0; i < 3; i++) { fireEvent.click(btn); seen.push(localStorage.getItem('tjt:theme')); }
  expect(seen).toEqual(['light', 'dark', 'system']);
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

test('clear all needs two clicks', () => {
  textStore.set('left', 'keep me');
  const { container } = render(<App />);
  const btn = container.querySelector('#clear-all');
  fireEvent.click(btn);
  expect(btn.textContent).toBe('Click again to clear every panel');
  expect(textStore.get('left')).toBe('keep me');
  fireEvent.click(btn);
  expect(textStore.get('left')).toBe('');
  expect(btn.textContent).toBe('Clear all panels');
});

test('opening a tool focuses its input', () => {
  location.hash = '#minify';
  render(<App />);
  expect(document.activeElement.id).toBe('min-in');
});
