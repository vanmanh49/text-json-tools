import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import CompareTool from './CompareTool.jsx';
import { textStore } from '../textStore.js';
import { SAMPLES } from '../samples.js';

const { left: CONFIG_A, right: CONFIG_B } = SAMPLES.left;
const scrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  textStore.set('left', '');
  textStore.set('right', '');
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = scrollIntoView;
  location.hash = '';
});

const setup = (l, r) => {
  textStore.set('left', l);
  textStore.set('right', r);
  const { container } = render(<CompareTool />);
  const $ = sel => container.querySelector(sel);
  return { container, $, compare: () => fireEvent.click($('#compare-btn')) };
};
const copyButtons = dir => screen.queryAllByRole('button', { name: new RegExp(`^Copy difference \\d+ to ${dir}$`) });

test('copy every block right makes sides identical', () => {
  const { $, compare } = setup(CONFIG_A, CONFIG_B);
  compare();
  expect(copyButtons('right').length).toBeGreaterThan(1);
  for (let b; (b = copyButtons('right')[0]);) fireEvent.click(b); // re-query: each copy re-renders the diff
  expect(textStore.get('left')).toBe(textStore.get('right'));
  expect($('#identical').hidden).toBe(false);
  expect($('#identical').textContent).toBe('✓ The left and right texts are identical.');
});

test('undo restores before the copy', () => {
  const { $, compare } = setup(CONFIG_A, CONFIG_B);
  compare();
  expect($('#undo').disabled).toBe(true);
  fireEvent.click(copyButtons('right')[1]);
  expect(textStore.get('left')).toBe(CONFIG_A);
  expect(textStore.get('right')).not.toBe(CONFIG_B);
  expect($('#diff-count').textContent).toMatch(/^2 of \d+$/); // focus stays on the same difference
  fireEvent.click($('#undo'));
  expect([textStore.get('left'), textStore.get('right')]).toEqual([CONFIG_A, CONFIG_B]);
  expect($('#undo').disabled).toBe(true);
  expect($('#diff').querySelectorAll('.change').length).toBeGreaterThan(0);
});

test('setting left from outside clears diff and undo', () => {
  const { $, compare } = setup(CONFIG_A, CONFIG_B);
  compare();
  fireEvent.click(copyButtons('right')[0]);
  expect($('#undo').disabled).toBe(false);
  act(() => textStore.set('left', 'z'));
  expect($('#diff').children).toHaveLength(0);
  expect($('#undo').disabled).toBe(true);
  expect($('#diff-count').textContent).toBe('');
});

test('compare as JSON rewrites both sides and undo restores originals', () => {
  const { $, compare } = setup('{"b":1,"a":2}', '{"a":2,"b":1}');
  fireEvent.click($('#json-mode'));
  compare();
  expect(textStore.get('left')).toBe(textStore.get('right'));
  expect($('#identical').textContent).toBe('✓ The left and right texts are identical.');
  fireEvent.click($('#undo'));
  expect([textStore.get('left'), textStore.get('right')]).toEqual(['{"b":1,"a":2}', '{"a":2,"b":1}']);
});

test('invalid JSON in compare-as-JSON names the side', () => {
  const { $, compare } = setup('{"a":', '{}');
  fireEvent.click($('#json-mode'));
  compare();
  expect($('.err').textContent).toMatch(/^Left side is not valid JSON/);
  expect($('.err').textContent).toMatch(/Fix it or untick "Compare as JSON"\.$/);
  expect($('#diff').children).toHaveLength(0);
  expect(textStore.get('left')).toBe('{"a":');
});

test('long unchanged run collapses and the counter skips hidden lines', () => {
  const same = Array.from({ length: 20 }, (_, i) => 'line ' + (i + 1)).join('\n');
  const { $, compare } = setup(same + '\nx', same + '\ny');
  compare();
  const more = $('#diff .expand');
  expect(more.textContent).toBe('⋯ 17 unchanged lines');
  expect(more.getAttribute('aria-label')).toBe('Show 17 unchanged lines');
  const box = more.nextElementSibling;
  expect(box.className).toBe('hidden-lines');
  expect(box.hidden).toBe(true);
  expect(box.querySelectorAll('.row')).toHaveLength(17);
  expect($('#diff .change .ln').textContent).toBe('21');
  expect($('.inputs').classList.contains('folded')).toBe(true);
  expect($('#fold-summary').textContent).toBe('Left · 21 lines    Right · 21 lines');
  fireEvent.click(more);
  expect($('#diff .expand')).toBeNull();
  expect(box.hidden).toBe(false);
  expect($('#diff .change .ln').textContent).toBe('21');
});

test('Alt+arrows move between differences and copy, Ctrl+Z undoes', () => {
  const { $, compare } = setup(CONFIG_A, CONFIG_B);
  compare();
  const n = $('#diff').querySelectorAll('.change').length;
  fireEvent.keyDown(document, { key: 'ArrowDown', altKey: true });
  fireEvent.keyDown(document, { key: 'ArrowDown', altKey: true });
  expect($('#diff-count').textContent).toBe(`2 of ${n}`);
  expect($('#diff .change.current')).toBe($('#diff').querySelectorAll('.change')[1]);
  expect(document.activeElement.textContent).toBe('Block ⇒');
  fireEvent.keyDown(document, { key: 'ArrowRight', altKey: true });
  expect($('#diff').querySelectorAll('.change')).toHaveLength(n - 1);
  fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
  expect([textStore.get('left'), textStore.get('right')]).toEqual([CONFIG_A, CONFIG_B]);
});

test('compare and swap are disabled when both sides are empty', () => {
  const { $ } = setup('', '');
  expect([$('#compare-btn').disabled, $('#swap').disabled]).toEqual([true, true]);
  act(() => textStore.set('right', 'a'));
  expect([$('#compare-btn').disabled, $('#swap').disabled]).toEqual([false, false]);
  fireEvent.click($('#swap'));
  expect([textStore.get('left'), textStore.get('right')]).toEqual(['a', '']);
  expect($('#undo').disabled).toBe(false);
});
