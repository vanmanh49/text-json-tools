import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createElement } from 'react';

const load = async () => { vi.resetModules(); return import('./textStore.js'); };

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('textStore', () => {
  it('restores saved text on load', async () => {
    localStorage.setItem('tjt:text:left', 'x');
    const { textStore } = await load();
    expect(textStore.get('left')).toBe('x');
    expect(textStore.get('nope')).toBe('');
  });

  it('never persists jwt-in', async () => {
    const { textStore } = await load();
    textStore.set('jwt-in', 'tok');
    vi.advanceTimersByTime(400);
    expect(localStorage.getItem('tjt:text:jwt-in')).toBeNull();
  });

  it('saves after the debounce and deletes on empty', async () => {
    const { textStore } = await load();
    textStore.set('left', 'a');
    expect(localStorage.getItem('tjt:text:left')).toBeNull();
    vi.advanceTimersByTime(60);
    expect(localStorage.getItem('tjt:text:left')).toBe('a');
    textStore.set('left', '');
    vi.advanceTimersByTime(60);
    expect(localStorage.getItem('tjt:text:left')).toBeNull();
  });

  it('too large to remember', async () => {
    const { textStore } = await load();
    textStore.set('left', 'a'.repeat(2 * 1024 * 1024 + 1));
    vi.advanceTimersByTime(400);
    expect(localStorage.getItem('tjt:text:left')).toBeNull();
    expect(textStore.saveNote('left')).toBe(' · too large to remember');
  });

  it('remember off deletes saved text', async () => {
    const { textStore } = await load();
    textStore.set('left', 'a');
    vi.advanceTimersByTime(60);
    textStore.setRemember(false);
    expect(localStorage.getItem('tjt:text:left')).toBeNull();
    expect(JSON.parse(localStorage.getItem('tjt:settings')).remember).toBe(false);
  });

  it('clearAll empties every editable panel', async () => {
    const { textStore, EDITABLE_IDS } = await load();
    for (const id of EDITABLE_IDS) textStore.set(id, 'v');
    vi.advanceTimersByTime(60);
    textStore.clearAll();
    vi.advanceTimersByTime(60);
    for (const id of EDITABLE_IDS) {
      expect(textStore.get(id)).toBe('');
      expect(localStorage.getItem('tjt:text:' + id)).toBeNull();
    }
  });

  it('setText falls back to the store for long text', async () => {
    const { textStore, useText } = await load();
    const { setText } = await import('./setText.js');
    const Box = () => createElement('textarea', { id: 'left', value: useText('left'), onChange: e => textStore.set('left', e.target.value) });
    const { container } = render(createElement(Box));
    const text = 'x\n'.repeat(500);
    act(() => setText('left', text));
    expect(textStore.get('left')).toBe(text);
    expect(container.querySelector('textarea').value).toBe(text);
  });
});
