import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Panel from './Panel.jsx';
import { textStore } from '../textStore.js';
import { jsonStatus } from '../tools.js';

vi.mock('../tools.js', async importOriginal => {
  const real = await importOriginal();
  return { ...real, jsonStatus: vi.fn(real.jsonStatus) };
});

beforeEach(() => { localStorage.clear(); location.hash = ''; vi.useFakeTimers(); jsonStatus.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); for (const id of ['fmt-in', 'min-in', 'j2t-in']) textStore.set(id, ''); });

const btn = name => screen.getByRole('button', { name });
const settle = (ms = 400) => act(() => { vi.advanceTimersByTime(ms); });

test('empty editable panel shows Paste and sample, disables Copy/Clear/Download', () => {
  render(<Panel id="fmt-in" label="JSON" ext="json" tab="format" />);
  expect(screen.getAllByRole('button', { name: 'Paste' })).toHaveLength(2);
  expect(btn('Try a sample')).toBeTruthy();
  for (const n of ['Copy', 'Clear', 'Download']) expect(btn(n).disabled).toBe(true);
  expect(screen.getAllByRole('button', { name: 'Paste' })[0].disabled).toBe(false);
  expect(document.querySelector('.status').hidden).toBe(true);
});

test('valid JSON shows ✓ Valid JSON with line count', () => {
  const { container } = render(<Panel id="fmt-in" label="JSON" ext="json" tab="format" />);
  act(() => textStore.set('fmt-in', '{"a":1}'));
  settle(60);
  const s = container.querySelector('.status');
  expect(s.hidden).toBe(false);
  expect(s.textContent).toContain('✓ Valid JSON');
  expect(s.textContent).toContain('1 line');
  expect(container.querySelector('.empty').hidden).toBe(true);
});

test('broken but fixable JSON offers Fix JSON, and clicking it repairs', () => {
  render(<Panel id="fmt-in" label="JSON" ext="json" tab="format" />);
  act(() => textStore.set('fmt-in', '{a:1,}'));
  settle(60);
  fireEvent.click(btn('Fix JSON'));
  expect(() => JSON.parse(textStore.get('fmt-in'))).not.toThrow();
});

test("status is not recomputed for another panel's edit", () => {
  render(<><Panel id="fmt-in" label="JSON" ext="json" tab="format" /><Panel id="min-in" label="JSON" ext="json" tab="minify" /></>);
  act(() => textStore.set('fmt-in', '{"a":1}'));
  settle();
  jsonStatus.mockClear();
  act(() => textStore.set('min-in', '[1]'));
  settle();
  expect(jsonStatus.mock.calls.length).toBeGreaterThan(0);
  expect(jsonStatus.mock.calls.every(([t]) => t === '[1]')).toBe(true);
});

test('Send to sets the target and switches tab', () => {
  render(<Panel id="fmt-out" label="One-line JSON" ext="json" tab="format" readOnly value="x" />);
  fireEvent.change(screen.getByLabelText('Send this result to another tool'), { target: { value: 'minify|min-in' } });
  expect(textStore.get('min-in')).toBe('x');
  expect(location.hash).toBe('#minify');
});

test('drop over MAX_DROP shows the size message', () => {
  const onErr = vi.fn();
  const { container } = render(<Panel id="fmt-in" label="JSON" ext="json" tab="format" onErr={onErr} />);
  fireEvent.drop(container.querySelector('.editor'), { dataTransfer: { types: ['Files'], files: [{ size: 26 * 1024 * 1024, name: 'big.json' }] } });
  expect(onErr).toHaveBeenCalledWith('big.json is 26.0 MB. Files up to 25.0 MB can be opened here.');
});
