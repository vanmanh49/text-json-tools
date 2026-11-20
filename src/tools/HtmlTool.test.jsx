import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import HtmlTool from './HtmlTool.jsx';
import { textStore } from '../textStore.js';

afterEach(() => { cleanup(); vi.useRealTimers(); textStore.set('html-in', ''); });

test('formats the input and previews it in a sandboxed frame', () => {
  vi.useFakeTimers();
  const { container } = render(<HtmlTool />);
  act(() => textStore.set('html-in', '<ul><li>a</li></ul><script>alert(1)</script>'));
  act(() => vi.advanceTimersByTime(150));
  expect(container.querySelector('#html-out').value).toBe('<ul>\n  <li>a</li>\n</ul>\n<script>alert(1)</script>');
  fireEvent.change(container.querySelector('#html-view'), { target: { value: 'preview' } });
  const frame = container.querySelector('iframe#html-preview');
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('srcdoc')).toMatch(/Content-Security-Policy.*<ul><li>a<\/li><\/ul>/);
  expect(container.querySelector('#html-out')).toBeNull();
});
