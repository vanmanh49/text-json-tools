import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { jsonStatus, formatSize, repairJson } from '../tools.js';
import { textStore } from '../textStore.js';
import { setText } from '../setText.js';

const MAX_TRY_FIX = 1024 * 1024; // above this a trial repair stalls typing (~0.7s per 10 MB), so it runs on click only

// Turn engine wording into a short sentence; the line and column are shown separately.
export const tidy = msg => msg
  .replace(/^JSON\.parse: /, '')
  .replace(/, (\.\.\.)?"[\s\S]*"(\.\.\.)? is not valid JSON$/, '') // V8 quotes a snippet (cut with "..." on long text); the line/column replace it
  .replace(/\s*(in JSON )?at (position|line) [\s\S]*$/, '')
  .replace(/^./, c => c.toUpperCase());

function compute(text, isJson, editable) {
  const st = isJson ? jsonStatus(text) : { empty: !text, lines: text ? text.split('\n').length : 0, bytes: new TextEncoder().encode(text).length };
  let fixed = '';
  // Small text: offer Fix only when the repair works. Big text: always offer it and try on click.
  if (isJson && !st.empty && !st.ok && editable && text.length <= MAX_TRY_FIX) try { fixed = repairJson(text); } catch { /* not repairable: no button */ }
  return { st, fixed };
}

// Line count and size; JSON panels also say whether the text is valid. `text` is debounced here, so
// another panel's edit never re-runs the check.
export function StatusBar({ id, text, isJson, editable, taRef, onErr }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setShown(text), text.length > 200000 ? 300 : 60);
    return () => clearTimeout(timer);
  }, [text]);
  const note = useSyncExternalStore(textStore.subscribe, () => textStore.saveNote(id));
  const { st, fixed } = useMemo(() => compute(shown, isJson, editable), [shown, isJson, editable]);

  if (st.empty && !shown) return <div className="status" aria-live="polite" hidden />;

  const err = !st.empty && !st.ok && st.error;
  const fixBtn = editable && err && (fixed || shown.length > MAX_TRY_FIX);
  const fix = () => {
    try { setText(id, fixed || repairJson(textStore.get(id))); }
    catch { onErr?.("This JSON can't be fixed automatically. The status bar shows where the first problem is."); }
  };
  const go = () => {
    const t = taRef.current;
    t.focus();
    t.setSelectionRange(err.pos, err.pos + 1);
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 18;
    t.scrollTop = Math.max(0, (err.line - 1) * lh - t.clientHeight / 3);
  };
  const cls = isJson && !st.empty ? (st.ok ? ' ok' : ' bad') : '';

  return (
    <div className={'status' + cls} aria-live="polite">
      <span className="msg">
        {isJson && !st.empty && (st.ok ? '✓ Valid JSON' : `✗ ${err.line ? `Line ${err.line}, column ${err.col}: ` : ''}${tidy(err.message)}`)}
        {fixBtn && <> <button type="button" className="link" title="Remove comments and trailing commas, quote keys and single-quoted strings, and replace True/False/None" onClick={fix}>Fix JSON</button></>}
        {editable && err && err.pos != null && <> <button type="button" className="link" onClick={go}>Go to error</button></>}
      </span>
      <span className="meta">{`${st.lines.toLocaleString()} line${st.lines === 1 ? '' : 's'} · ${formatSize(st.bytes)}${note}`}</span>
    </div>
  );
}
