import { beforeAll, expect, test } from 'vitest';
import { installGlobalListeners } from './globals.js';

beforeAll(() => installGlobalListeners());

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
