import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import FormatTool from './FormatTool.jsx';
import { textStore } from '../textStore.js';
import { jsonLines } from '../tools.js';

vi.mock('../tools.js', async importOriginal => {
  const real = await importOriginal();
  return { ...real, jsonLines: vi.fn(real.jsonLines) };
});

const SAMPLE = '{"b":[1,{"c":2}],"a":null}';

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  textStore.set('fmt-in', '');
  vi.useRealTimers();
  location.hash = '';
});

// Two acts: the debounce timer is set by an effect, which runs when the first act ends.
const type = text => { act(() => textStore.set('fmt-in', text)); act(() => vi.advanceTimersByTime(150)); };
const view = c => c.querySelector('#fmt-out');

test('pretty copy text equals JSON.stringify', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.assign(navigator, { clipboard: { writeText } });
  const { container } = render(<FormatTool />);
  act(() => textStore.set('fmt-in', SAMPLE));
  act(() => vi.advanceTimersByTime(149));
  expect(view(container).children).toHaveLength(0); // still debounced
  act(() => vi.advanceTimersByTime(1));
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[1]); });
  expect(writeText).toHaveBeenCalledWith(JSON.stringify(JSON.parse(SAMPLE), null, 2));
});

test('sort keys A→Z orders keys', () => {
  const { container } = render(<FormatTool />);
  type('{"b":1,"a":2}');
  const keys = () => [...view(container).querySelectorAll('.key')].map(k => k.textContent);
  expect(keys()).toEqual(['"b"', '"a"']);
  fireEvent.click(container.querySelector('#fmt-sort'));
  expect(keys()).toEqual(['"a"', '"b"']);
});

test('tab indent sets --indent to 4ch right away', () => {
  const { container } = render(<FormatTool />);
  type(SAMPLE);
  fireEvent.change(container.querySelector('#fmt-indent'), { target: { value: 'tab' } });
  expect(view(container).style.getPropertyValue('--indent')).toBe('4ch');
  expect(view(container).querySelector('.line').style.getPropertyValue('--d')).toBe('0');
});

test('fold hides kids and keeps line numbers', () => {
  const { container } = render(<FormatTool />);
  type(SAMPLE);
  const lastLn = () => [...view(container).querySelectorAll('.ln')].at(-1).textContent;
  expect(lastLn()).toBe('9');
  const fold = view(container).querySelector('.node .node .fold');
  expect(fold.getAttribute('aria-label')).toBe('Fold line 2');
  fireEvent.click(fold);
  const node = fold.closest('.node');
  expect(node.classList.contains('collapsed')).toBe(true);
  expect(fold.textContent).toBe('▸');
  expect(fold.getAttribute('aria-expanded')).toBe('false');
  expect(node.querySelector('.summary').textContent).toBe('…], 2 items');
  expect(node.lastElementChild.classList.contains('line')).toBe(true); // the closing line CSS hides
  expect(lastLn()).toBe('9');
});

test('collapse all keeps root open', () => {
  const { container } = render(<FormatTool />);
  type(SAMPLE);
  fireEvent.click(container.querySelector('#fmt-collapse'));
  const nodes = [...view(container).querySelectorAll('.node')];
  expect(nodes.map(n => n.classList.contains('collapsed'))).toEqual([false, true, true]);
  fireEvent.click(container.querySelector('#fmt-expand'));
  expect(view(container).querySelectorAll('.collapsed')).toHaveLength(0);
});

test('expand and collapse disabled states', () => {
  const { container } = render(<FormatTool />);
  const expand = container.querySelector('#fmt-expand'), collapse = container.querySelector('#fmt-collapse');
  expect([expand.disabled, collapse.disabled]).toEqual([true, true]);
  type('{"a":1}');
  expect([expand.disabled, collapse.disabled]).toEqual([false, true]);
  type(SAMPLE);
  expect([expand.disabled, collapse.disabled]).toEqual([false, false]);
});

test('invalid input clears the view and leaves .err empty', () => {
  const { container } = render(<FormatTool />);
  type(SAMPLE);
  expect(view(container).children.length).toBeGreaterThan(0);
  type('{bad');
  expect(view(container).children).toHaveLength(0);
  expect(container.querySelector('.err').textContent).toBe('');
});

test('typing before the debounce settles does not re-walk the Pretty tree', () => {
  render(<FormatTool />);
  type(SAMPLE);
  // Rows reads every node's closing line (parts.map) each time it renders; Line is memoised, so only a Rows re-render touches it.
  const spies = jsonLines.mock.results.at(-1).value.map(l => vi.spyOn(l.parts, 'map'));
  act(() => textStore.set('fmt-in', SAMPLE + ' ')); // FormatTool re-renders, but src and lines are unchanged
  expect(spies.reduce((n, s) => n + s.mock.calls.length, 0)).toBe(0);
});
