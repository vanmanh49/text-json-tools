import { textStore } from './textStore.js';

// Each entry keeps two full copies of a possibly large text, so only the last few are kept.
const MAX_UNDO = 20;
const undos = {}, redos = {}; // textarea id -> [{ before, after }]

// Replace a textarea's text through the editing pipeline so Cmd/Ctrl+Z can undo it.
export function setText(id, text) {
  const before = textStore.get(id);
  const t = document.getElementById(id);
  if (t) {
    t.focus();
    // execCommand('insertText') cost grows ~quadratically with newlines (0.4s at 800 lines, minutes at
    // 20k), while 'delete' stays fast. So long multi-line text is set through the store instead.
    const cheap = !text || text.split('\n', 202).length <= 201; // <= 200 newlines
    // execCommand edits whatever has focus, so only use it when `t` really got focus (not hidden).
    if (document.activeElement === t && cheap && typeof document.execCommand === 'function') {
      t.select();
      try { text ? document.execCommand('insertText', false, text) : document.execCommand('delete'); } catch { /* fall back below */ }
    }
  }
  // React ignores a synthetic 'input' event after `t.value = x` (it tracks the value itself), so write to the store.
  // Setting the value directly also wipes the browser's undo history for the box, so record our own step.
  if (textStore.get(id) !== text) {
    (undos[id] ??= []).push({ before, after: text });
    if (undos[id].length > MAX_UNDO) undos[id].shift();
    redos[id] = [];
    textStore.set(id, text);
  }
}

// Undo (or redo) the last text setText had to set directly. Only when the box still shows that text:
// anything typed since is in the browser's own history, which goes first. True when it did something.
export function undoDirect(id, redo = false) {
  const [from, to] = redo ? [redos, undos] : [undos, redos];
  const step = from[id]?.at(-1);
  if (!step || textStore.get(id) !== (redo ? step.before : step.after)) return false;
  from[id].pop();
  (to[id] ??= []).push(step);
  textStore.set(id, redo ? step.after : step.before);
  return true;
}
