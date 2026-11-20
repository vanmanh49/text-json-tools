import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from './App.jsx';
import { textStore } from './textStore.js';
import { GROUPS, NAV } from './useHashTab.js';

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
  expect(hiddenTabs(container)).toHaveLength(NAV.length - 1);
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

test('tool picker closes on pick, outside click and Escape', () => {
  location.hash = '#format';
  const { container } = render(<App />);
  const picker = container.querySelector('.tools-menu');
  expect(picker.querySelector('summary').textContent).toBe('JSON Format');
  picker.open = true;
  fireEvent.click(picker.querySelector('a[href="#uuid"]'));
  expect(picker.open).toBe(false);
  picker.open = true;
  fireEvent.pointerDown(container.querySelector('main'));
  expect(picker.open).toBe(false);
  picker.open = true;
  fireEvent.pointerDown(picker.querySelector('summary'));
  expect(picker.open).toBe(true); // a click inside leaves it to the summary's own toggle
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(picker.open).toBe(false);
  expect(document.activeElement).toBe(picker.querySelector('summary'));
});

const summaries = c => [...c.querySelectorAll('nav details.menu > summary')].map(s => s.textContent);

test('nav shows one menu per group, the current one named after the tool', () => {
  location.hash = '#format';
  const { container } = render(<App />);
  expect(summaries(container)).toEqual(['JSON Format', 'Text', 'Encode', 'More']);
  act(() => { location.hash = '#jwt'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(summaries(container)).toEqual(['JSON', 'Text', 'JWT Decode', 'More']);
});

test('picking a tool in a group menu closes it', () => {
  const { container } = render(<App />);
  const link = container.querySelector('nav a[href="#jwt"]');
  const menu = link.closest('details');
  menu.open = true;
  fireEvent.click(link);
  expect(menu.open).toBe(false);
});

test('tool picker lists tools under group headings', () => {
  const { container } = render(<App />);
  expect([...container.querySelectorAll('.tools-menu .tool-group')].map(p => p.textContent)).toEqual(GROUPS);
});

const pinnedHrefs = c => [...c.querySelectorAll('nav a.pinned')].map(a => a.getAttribute('href'));

test('pinning a tool adds a tab and saves it', () => {
  const { container } = render(<App />);
  fireEvent.click(container.querySelector('nav button[aria-label="Pin UUID"]'));
  expect(pinnedHrefs(container)).toEqual(['#uuid']);
  expect(localStorage.getItem('tjt:pins')).toBe('["uuid"]');
  const btn = container.querySelector('nav button[aria-label="Unpin UUID"]');
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(btn);
  expect(pinnedHrefs(container)).toEqual([]);
  expect(localStorage.getItem('tjt:pins')).toBe('[]');
});

test('pins load from storage in order, dropping unknown ids', () => {
  localStorage.setItem('tjt:pins', '["qr","nope","format"]');
  const { container } = render(<App />);
  expect(pinnedHrefs(container)).toEqual(['#qr', '#format']);
  expect(container.querySelector('.tools-menu .tool-group').textContent).toBe('Pinned');
  expect(container.querySelector('.tools-menu .tool-list a').getAttribute('href')).toBe('#qr');
});

test('a seventh pin is disabled', () => {
  localStorage.setItem('tjt:pins', JSON.stringify(NAV.slice(0, 6).map(n => n[0])));
  const { container } = render(<App />);
  const free = [...container.querySelectorAll('button.pin[aria-pressed="false"]')];
  expect(free.length).toBeGreaterThan(0);
  expect(free.every(b => b.disabled)).toBe(true);
});

test('broken pin storage is ignored', () => {
  localStorage.setItem('tjt:pins', '{oops');
  const { container } = render(<App />);
  expect(pinnedHrefs(container)).toEqual([]);
});

test('pinned tabs show a pin icon hidden from screen readers', () => {
  localStorage.setItem('tjt:pins', '["uuid"]');
  const { container } = render(<App />);
  const tab = container.querySelector('nav a.pinned');
  expect(tab.querySelector('svg.pin-icon[aria-hidden="true"]')).not.toBeNull();
  expect(tab.querySelector('svg.pin-icon path[fill="currentColor"]')).not.toBeNull(); // solid: reads as pinned, not "pin me"
  expect(tab.textContent).toBe('UUID');
});
