import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from '../App.jsx';
import { textStore, EDITABLE_IDS } from '../textStore.js';
import { installGlobalListeners } from '../globals.js';

const scrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => installGlobalListeners()); // document listeners: add them once for the whole file
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  Range.prototype.getBoundingClientRect ??= () => ({ top: 0 }); // jsdom has no layout
});
afterEach(() => {
  cleanup();
  for (const id of EDITABLE_IDS) textStore.set(id, '');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = scrollIntoView;
  location.hash = '';
});

// The hash change queues a hashchange event: let it fire before the test starts.
const open = tab => { location.hash = '#' + tab; const c = render(<App />).container; act(() => vi.runAllTimers()); return c; };
// Two acts: the Format debounce timer is set by an effect, which runs when the first act ends.
const settle = () => act(() => vi.advanceTimersByTime(150));
const box = (c, tab) => c.querySelector(`section[data-tab="${tab}"] input[type="search"]`);
const count = (c, tab) => box(c, tab).closest('.toolbar').querySelector('[role="status"]:last-child').textContent;
const search = (c, tab, q) => fireEvent.change(box(c, tab), { target: { value: q } });
const enter = (c, tab) => fireEvent.keyDown(box(c, tab), { key: 'Enter' });

test('counts matches in the visible panels', () => {
  const c = open('format');
  act(() => textStore.set('fmt-in', '{"a":"aa"}'));
  settle();
  search(c, 'format', 'a');
  // 3 in the textarea, 1 in the key span "a", 2 in the value span "aa"
  expect(count(c, 'format')).toBe('6 matches');
  expect(c.querySelector('section[data-tab="format"] .hl').textContent).toBe('{"a":"aa"}');
  enter(c, 'format');
  expect(count(c, 'format')).toBe('1 of 6');
  search(c, 'format', '');
  expect(count(c, 'format')).toBe('');
  expect(c.querySelector('section[data-tab="format"] .hl').childNodes).toHaveLength(0);
});

test('showing the tab again re-runs its search', () => {
  const c = open('minify');
  search(c, 'minify', 'x');
  expect(count(c, 'minify')).toBe('No matches');
  act(() => { location.hash = '#format'; vi.runAllTimers(); });
  act(() => { textStore.set('min-in', '"x"'); vi.runAllTimers(); }); // hidden: the search waits
  expect(count(c, 'minify')).toBe('No matches');
  act(() => { location.hash = '#minify'; vi.runAllTimers(); });
  expect(count(c, 'minify')).toBe('2 matches');
});

test('invalid regex says so', () => {
  const c = open('minify');
  act(() => textStore.set('min-in', '{"a":1}'));
  fireEvent.click(c.querySelector('section[data-tab="minify"] button[aria-label="Use regular expression"]'));
  search(c, 'minify', '(');
  expect(count(c, 'minify')).toBe('Invalid regex');
  expect(box(c, 'minify').hasAttribute('aria-invalid')).toBe(true);
});

test('text changes re-run the search after 150ms', () => {
  const c = open('minify');
  search(c, 'minify', 'x');
  expect(count(c, 'minify')).toBe('No matches');
  act(() => textStore.set('min-in', '"x"'));
  act(() => vi.advanceTimersByTime(149));
  expect(count(c, 'minify')).toBe('No matches');
  act(() => vi.advanceTimersByTime(1));
  expect(count(c, 'minify')).toBe('2 matches'); // input and output
});

test('going to a match opens its folded node', () => {
  const c = open('format');
  act(() => textStore.set('fmt-in', '{"o":{"deep":1}}'));
  settle();
  fireEvent.click(c.querySelector('#fmt-collapse'));
  expect(c.querySelector('.node.collapsed')).not.toBeNull();
  search(c, 'format', 'deep');
  expect(count(c, 'format')).toBe('2 matches');
  enter(c, 'format'); // the textarea
  enter(c, 'format'); // the Pretty view
  expect(c.querySelector('.node.collapsed')).toBeNull();
});

test('going to a match opens collapsed unchanged lines', () => {
  const lines = n => Array.from({ length: n }, (_, i) => 'k' + i).join('\n');
  textStore.set('left', lines(9) + '\nx');
  textStore.set('right', lines(9) + '\ny');
  const c = open('compare');
  fireEvent.click(c.querySelector('#compare-btn'));
  expect(c.querySelector('.hidden-lines').hidden).toBe(true);
  search(c, 'compare', 'k3');
  expect(count(c, 'compare')).toBe('4 matches'); // both textareas, both diff sides
  for (let i = 0; i < 3; i++) enter(c, 'compare');
  expect(count(c, 'compare')).toBe('3 of 4');
  expect(c.querySelector('.hidden-lines').hidden).toBe(false);
});

test('paste outside a field goes to the first empty input', () => {
  open('compare');
  const e = new Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = { getData: () => 'x' };
  act(() => { document.body.dispatchEvent(e); });
  expect(e.defaultPrevented).toBe(true);
  expect(textStore.get('left')).toBe('x');
});

test('beforeinput history in an unfocused element is cancelled', () => {
  const c = open('minify');
  const t = c.querySelector('#j2t-in');
  expect(document.activeElement).not.toBe(t);
  const e = new InputEvent('beforeinput', { inputType: 'historyUndo', cancelable: true, bubbles: true });
  t.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
});

test('Ctrl+F focuses the open tool search box', () => {
  const c = open('jwt');
  fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
  expect(document.activeElement).toBe(box(c, 'jwt'));
});
