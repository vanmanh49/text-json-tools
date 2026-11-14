import { textStore } from './textStore.js';

// Replace a textarea's text through the editing pipeline so Cmd/Ctrl+Z can undo it.
export function setText(id, text) {
  const t = document.getElementById(id);
  if (t) {
    t.focus();
    // execCommand('insertText') cost grows ~quadratically with newlines (0.4s at 800 lines, minutes at
    // 20k), while 'delete' stays fast. So long multi-line text is set through the store instead.
    // shortcut: that direct set is not Cmd/Ctrl+Z-undoable; add a panel-level undo if users need it for big pastes.
    const cheap = !text || text.split('\n', 202).length <= 201; // <= 200 newlines
    // execCommand edits whatever has focus, so only use it when `t` really got focus (not hidden).
    if (document.activeElement === t && cheap && typeof document.execCommand === 'function') {
      t.select();
      try { text ? document.execCommand('insertText', false, text) : document.execCommand('delete'); } catch { /* fall back below */ }
    }
  }
  // React ignores a synthetic 'input' event after `t.value = x` (it tracks the value itself), so write to the store.
  if (textStore.get(id) !== text) textStore.set(id, text);
}
