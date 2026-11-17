import { afterEach, beforeAll, expect, test } from 'vitest';
import { installGlobalListeners } from './globals.js';
import { setText } from './setText.js';
import { textStore } from './textStore.js';

beforeAll(() => installGlobalListeners());
afterEach(() => { document.body.replaceChildren(); textStore.set('fmt-in', ''); });

// jsdom has no DragEvent/DataTransfer, so a plain event carries the dataTransfer the guard reads.
const drag = (type, types) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = { types };
  document.body.dispatchEvent(e);
  return e;
};

test('a file dropped outside the input panels is cancelled, so the browser cannot open it over the app', () => {
  expect(drag('dragover', ['Files']).defaultPrevented).toBe(true);
  expect(drag('drop', ['Files']).defaultPrevented).toBe(true);
});

test('dragging selected text is left alone', () => {
  expect(drag('dragover', ['text/plain']).defaultPrevented).toBe(false);
  expect(drag('drop', ['text/plain']).defaultPrevented).toBe(false);
});

const key = (t, k, mods = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
  t.dispatchEvent(e);
  return e.defaultPrevented;
};
const box = () => {
  const t = Object.assign(document.createElement('textarea'), { id: 'fmt-in' });
  document.body.append(t);
  return t;
};
const big = Array.from({ length: 500 }, (_, i) => 'line ' + i).join('\n'); // over 200 newlines: set directly

test('Cmd/Ctrl+Z undoes a big paste and Shift+Cmd/Ctrl+Z or Ctrl+Y redoes it', () => {
  const t = box();
  setText('fmt-in', 'before');
  setText('fmt-in', big);
  expect(key(t, 'z', { metaKey: true })).toBe(true);
  expect(textStore.get('fmt-in')).toBe('before');
  expect(key(t, 'z', { metaKey: true, shiftKey: true })).toBe(true);
  expect(textStore.get('fmt-in')).toBe(big);
  key(t, 'z', { ctrlKey: true });
  expect(key(t, 'y', { ctrlKey: true })).toBe(true);
  expect(textStore.get('fmt-in')).toBe(big);
});

test('typing after a big paste is left to the browser undo first', () => {
  const t = box();
  setText('fmt-in', big);
  textStore.set('fmt-in', big + 'x'); // typed: in the browser's own history
  expect(key(t, 'z', { metaKey: true })).toBe(false);
  expect(textStore.get('fmt-in')).toBe(big + 'x');
  textStore.set('fmt-in', big); // the browser undid the typing
  expect(key(t, 'z', { metaKey: true })).toBe(true);
  expect(textStore.get('fmt-in')).toBe('');
});

test('undo keys elsewhere, or with nothing recorded, are not touched', () => {
  const t = box();
  expect(key(t, 'z', { metaKey: true })).toBe(false);
  expect(key(document.body, 'z', { metaKey: true })).toBe(false);
  setText('fmt-in', big);
  expect(key(t, 'z', { metaKey: true, altKey: true })).toBe(false);
  expect(key(t, 'y', { metaKey: true })).toBe(false); // ⌘Y is not redo on a Mac
});
