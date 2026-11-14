import { setText } from './setText.js';

// Page-wide listeners, added once before the first render.
export function installGlobalListeners() {
  // A file dropped anywhere else would open in the tab and replace the app, losing unsaved text.
  // Files only: cancelling every drop would also stop dragging selected text into a textarea.
  const noFileDrop = e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); };
  addEventListener('dragover', noFileDrop);
  addEventListener('drop', noFileDrop);

  // Ctrl/⌘+F goes to the open tool's search box; the browser's own find is used when it is disabled.
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
    const box = document.querySelector('section:not([hidden]) input[type="search"]');
    if (!box || box.disabled) return;
    e.preventDefault();
    box.focus();
    box.select();
  });
  // The browser keeps one undo history for the whole page, so Ctrl/⌘+Z in the search box would go on to
  // undo a panel's edits (wiping a paste) once its own typing is undone. Undo only the focused box.
  document.addEventListener('beforeinput', e => {
    if (e.inputType.startsWith('history') && e.target !== document.activeElement) e.preventDefault();
  });
  // Ctrl/⌘+V outside a text box pastes into the open tool's input (Compare: the first empty side).
  // shortcut: Safari may not fire 'paste' when nothing editable is focused; the inputs get focus on tab open anyway.
  document.addEventListener('paste', e => {
    if (e.target.closest?.('textarea, input, select, [contenteditable]')) return;
    const text = e.clipboardData?.getData('text/plain');
    const inputs = [...document.querySelectorAll('section:not([hidden]) textarea:not([readonly])')];
    const t = inputs.find(i => !i.value) ?? inputs[0];
    if (!text || !t) return;
    e.preventDefault();
    setText(t.id, text);
  });
}
