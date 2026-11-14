import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Panel from '../ui/Panel.jsx';
import { IconButton } from '../ui/IconButton.jsx';
import SearchBox from '../ui/SearchBox.jsx';
import { textStore, useText } from '../textStore.js';
import { applyCopy, diffBlocks, jsonStatus, normalizeJson, splitSame } from '../tools.js';

// Each snapshot keeps a full copy of the changed side; capped so long merges of big files can't exhaust memory.
const MAX_UNDO = 100;
const NONE = new Set();
const lineCount = t => (t ? t.split('\n').length : 0).toLocaleString();

const Btn = ({ label, onClick, className, children }) => (
  <button type="button" className={className} aria-label={label} title={label} onClick={onClick}>{children}</button>
);

// User text is only ever a JSX text child, so markup in it is never parsed.
function Row({ cls, lnL, textL, lnR, textR, actions }) {
  const cell = (ln, text, side) => [
    <span key={side + 'n'} className="ln">{ln ?? ''}</span>,
    text == null ? <span key={side} className="txt gap" /> : <span key={side} className={cls === 'changed' ? 'txt ' + side : 'txt'}>{text}</span>,
  ];
  return (
    <div className={'row ' + cls}>
      {cell(lnL, textL, 'del')}
      {actions ?? <span className="act" />}
      {cell(lnR, textR, 'add')}
    </div>
  );
}

const sameRows = (lines, nl, nr) => lines.map((line, i) => <Row key={nl + i} cls="same" lnL={nl + i} textL={line} lnR={nr + i} textR={line} />);

// Long unchanged runs collapse to 3 lines of context, with a button that expands them.
// The button stays right before .hidden-lines: the search clicks it to open a match inside.
const Same = memo(function Same({ part: { head, hidden, tail, nl, nr, bi }, open, onExpand }) {
  const n = hidden.length;
  return (
    <>
      {sameRows(head, nl, nr)}
      {n > 0 && !open && <Btn className="expand" label={`Show ${n} unchanged lines`} onClick={() => onExpand(bi)}>{`⋯ ${n} unchanged lines`}</Btn>}
      {n > 0 && <div className="hidden-lines" hidden={!open}>{sameRows(hidden, nl + head.length, nr + head.length)}</div>}
      {sameRows(tail, nl + head.length + n, nr + head.length + n)}
    </>
  );
});

const Change = memo(function Change({ part: { b, k, nl, nr }, total, current, onCopy }) {
  const rows = [];
  for (let r = 0, l = nl, rr = nr; r < Math.max(b.left.length, b.right.length); r++) {
    const hasL = r < b.left.length, hasR = r < b.right.length;
    const actions = (
      <span className="act">
        <Btn label={`Copy line to right (difference ${k + 1}, line ${r + 1})`} onClick={() => onCopy({ block: k, row: r, dir: 'right' })}>→</Btn>
        <Btn label={`Copy line to left (difference ${k + 1}, line ${r + 1})`} onClick={() => onCopy({ block: k, row: r, dir: 'left' })}>←</Btn>
      </span>
    );
    rows.push(<Row key={r} cls="changed" lnL={hasL ? l++ : null} textL={hasL ? b.left[r] : null} lnR={hasR ? rr++ : null} textR={hasR ? b.right[r] : null} actions={actions} />);
  }
  return (
    <div className={current ? 'change current' : 'change'} tabIndex={-1}>
      <div className="block-head">
        <span className="muted">{`Difference ${k + 1} of ${total}`}</span>
        <Btn label={`Copy difference ${k + 1} to right`} onClick={() => onCopy({ block: k, dir: 'right' })}>Block ⇒</Btn>
        <Btn label={`Copy difference ${k + 1} to left`} onClick={() => onCopy({ block: k, dir: 'left' })}>⇐ Block</Btn>
      </div>
      {rows}
    </div>
  );
});

// Compare & merge, WinMerge style: both sides stay editable and copies rewrite them.
export default function CompareTool({ hidden }) {
  const left = useText('left'), right = useText('right');
  // The texts the diff was made from; blocks is null after an error.
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [folded, setFolded] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [expanded, setExpanded] = useState(NONE);
  const [current, setCurrent] = useState(-1);
  const [pendingFocus, setPendingFocus] = useState(null);
  const [undoLen, setUndoLen] = useState(0);
  const [ticks, setTicks] = useState([]);
  const history = useRef([]);
  const currentRef = useRef(-1);
  const section = useRef(null), toolbar = useRef(null), diff = useRef(null), locbar = useRef(null), view = useRef(null);

  const blocks = result?.blocks;
  const parts = useMemo(() => {
    if (!blocks) return [];
    let nl = 1, nr = 1, k = 0;
    return blocks.map((b, bi) => {
      const at = { nl, nr, bi };
      if (b.type === 'same') {
        nl += b.lines.length; nr += b.lines.length;
        return { ...at, same: true, ...splitSame(b.lines, { first: bi === 0, last: bi === blocks.length - 1 }) };
      }
      nl += b.left.length; nr += b.right.length;
      return { ...at, b, k: k++ };
    });
  }, [blocks]);
  const total = parts.filter(p => !p.same).length;

  const snapshot = useCallback(() => {
    history.current.push({ left: textStore.get('left'), right: textStore.get('right') });
    if (history.current.length > MAX_UNDO) history.current.shift();
  }, []);

  // Re-diff the current texts and keep the view on difference `focusIndex` (used after a copy).
  const compare = useCallback(focusIndex => {
    const l = textStore.get('left'), r = textStore.get('right');
    setErr('');
    setExpanded(NONE);
    setCurrent(currentRef.current = -1);
    setUndoLen(history.current.length);
    try {
      const bs = diffBlocks(l, r);
      const n = bs.filter(b => b.type === 'change').length;
      setResult({ left: l, right: r, blocks: bs });
      // After a compare with differences, the inputs fold into a slim bar so the diff gets the screen.
      setFolded(n > 0);
      setPendingFocus(focusIndex != null && n ? { i: Math.min(focusIndex, n - 1) } : null);
    } catch (e) {
      setResult({ left: l, right: r, blocks: null });
      setErr(e.message);
    }
  }, []);

  const go = useCallback((i, scroll = true) => {
    const els = diff.current.querySelectorAll('.change');
    if (!els.length) return;
    const c = (i + els.length) % els.length;
    setCurrent(currentRef.current = c);
    if (scroll) els[c].scrollIntoView({ block: 'center', behavior: 'smooth' });
    els[c].querySelector('button').focus({ preventScroll: !scroll });
  }, []);

  const copyChange = useCallback(opts => {
    try {
      snapshot();
      const r = applyCopy(textStore.get('left'), textStore.get('right'), opts);
      textStore.set('left', r.left);
      textStore.set('right', r.right);
      compare(opts.block);
    } catch (e) {
      setErr(e.message);
    }
  }, [snapshot, compare]);

  const undo = useCallback(() => {
    const s = history.current.pop();
    if (!s) return;
    textStore.set('left', s.left);
    textStore.set('right', s.right);
    compare(Math.max(currentRef.current, 0));
  }, [compare]);

  const swap = () => {
    snapshot();
    const l = textStore.get('left');
    textStore.set('left', textStore.get('right'));
    textStore.set('right', l);
    compare(Math.max(currentRef.current, 0));
  };

  // Compare as JSON: rewrite both sides to one canonical layout first, so key order and
  // formatting don't show as differences. The originals go on the undo stack.
  const onCompare = () => {
    if (jsonMode) {
      const l = textStore.get('left'), r = textStore.get('right'), out = {};
      for (const [name, t] of [['Left', l], ['Right', r]]) {
        try { out[name] = normalizeJson(t); }
        catch {
          const e = jsonStatus(t).error;
          setErr(`${name} side is not valid JSON${e?.line ? ` (line ${e.line}, column ${e.col})` : ''}. Fix it or untick "Compare as JSON".`);
          setResult({ left: l, right: r, blocks: null });
          return;
        }
      }
      if (out.Left !== l || out.Right !== r) {
        snapshot();
        textStore.set('left', out.Left);
        textStore.set('right', out.Right);
      }
    }
    compare();
  };

  // Typing, Send to, Paste or a sample makes the diff stale. The textarea's own undo covers typed edits, so drop copy history.
  useEffect(() => {
    if (result && result.left === left && result.right === right) return;
    history.current.length = 0;
    setUndoLen(0);
    setResult(null);
    setCurrent(currentRef.current = -1);
  }, [left, right]);

  useLayoutEffect(() => { if (pendingFocus) go(pendingFocus.i, false); }, [pendingFocus, go]);

  // Location bar (like WinMerge's location pane): one tick per difference, scaled to the diff's
  // height, plus a box showing which part of the diff is on screen. Click a tick to jump there.
  const updateLocbar = useCallback(() => {
    const H = diff.current.offsetHeight;
    if (!H) { setTicks([]); return; }
    const top = toolbar.current.offsetHeight;
    locbar.current.style.top = top + 'px';
    locbar.current.style.height = Math.min(innerHeight - top - 16, H) + 'px'; // never taller than the diff itself
    setTicks([...diff.current.querySelectorAll('.change')].map(c => ({
      top: (c.offsetTop / H) * 100,
      height: Math.max((c.offsetHeight / H) * 100, 0.8),
    })));
  }, []);
  const updateView = useCallback(() => {
    const v = view.current;
    if (!v) return;
    const r = diff.current.getBoundingClientRect();
    const top = Math.max(0, -r.top + toolbar.current.offsetHeight), bottom = Math.min(r.height, innerHeight - r.top);
    v.style.top = (top / r.height) * 100 + '%';
    v.style.height = Math.max(0, (bottom - top) / r.height) * 100 + '%';
  }, []);
  useLayoutEffect(updateLocbar, [parts, expanded, updateLocbar]);
  useLayoutEffect(updateView, [ticks, updateView]);
  useEffect(() => {
    const ro = new ResizeObserver(() => updateLocbar());
    ro.observe(diff.current);
    addEventListener('resize', updateLocbar);
    addEventListener('scroll', updateView, { passive: true });
    return () => { ro.disconnect(); removeEventListener('resize', updateLocbar); removeEventListener('scroll', updateView); };
  }, [updateLocbar, updateView]);
  const onLocbar = e => {
    const r = locbar.current.getBoundingClientRect(), d = diff.current.getBoundingClientRect();
    scrollTo({ top: scrollY + d.top + ((e.clientY - r.top) / r.height) * d.height - innerHeight / 2, behavior: 'smooth' });
  };

  // flushSync: the search clicks .expand and scrolls to the match straight after, so the rows must already be shown.
  const onExpand = useCallback(bi => flushSync(() => setExpanded(s => new Set(s).add(bi))), []);

  // WinMerge-style shortcuts, ignored while typing in a box (Option+arrows move by word there on macOS).
  useEffect(() => {
    const onKey = e => {
      if (section.current.hidden || document.activeElement?.closest('textarea, input, select')) return;
      const n = diff.current.querySelectorAll('.change').length;
      if (e.altKey && !e.ctrlKey && !e.metaKey && n) {
        const c = currentRef.current;
        const act = {
          ArrowDown: () => go(c + 1),
          ArrowUp: () => go(c - 1),
          ArrowRight: () => copyChange({ block: Math.max(c, 0), dir: 'right' }),
          ArrowLeft: () => copyChange({ block: Math.max(c, 0), dir: 'left' }),
        }[e.key];
        if (act) { e.preventDefault(); act(); }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && history.current.length) {
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, copyChange, undo]);

  const editTexts = () => {
    flushSync(() => setFolded(false)); // the textarea must be shown before it can take focus
    document.getElementById('left').focus();
  };

  const empty = !left && !right;
  const countText = !total ? '' : current >= 0 ? `${current + 1} of ${total}` : `${total} difference${total > 1 ? 's' : ''}`;
  return (
    <section data-tab="compare" hidden={hidden} ref={section}>
      <p className="desc">Compare two texts side by side and copy changes line by line or block by block, like WinMerge.</p>
      <div className={folded ? 'inputs folded' : 'inputs'}>
        <div className="fold-bar">
          <span id="fold-summary">{folded && `Left · ${lineCount(left)} lines    Right · ${lineCount(right)} lines`}</span>
          <button id="edit-texts" type="button" onClick={editTexts}>Edit texts</button>
        </div>
        <div className="io">
          <Panel id="left" label="Left" ext="txt" tab="compare" onErr={setErr} />
          <Panel id="right" label="Right" ext="txt" tab="compare" onErr={setErr} />
        </div>
      </div>
      <p className="err" role="alert">{err}</p>
      <div className="toolbar" ref={toolbar}>
        <button id="compare-btn" className="primary" type="button" disabled={empty} onClick={onCompare}>Compare</button>
        <label className="inline" title="Ignore key order and formatting: both sides are rewritten with keys A→Z before comparing (Undo restores them)"><input type="checkbox" id="json-mode" checked={jsonMode} onChange={e => setJsonMode(e.target.checked)} /> Compare as JSON</label>
        <button id="prev-diff" type="button" title="Previous difference (Alt+↑)" disabled={!total} onClick={() => go(currentRef.current - 1)}>‹ Prev<span className="wide"> diff</span></button>
        <button id="next-diff" type="button" title="Next difference (Alt+↓). Alt+→ / Alt+← copy it to the right / left" disabled={!total} onClick={() => go(currentRef.current + 1)}>Next<span className="wide"> diff</span> ›</button>
        <span id="diff-count" className="muted" role="status">{countText}</span>
        <button id="undo" type="button" title="Undo last copy (Ctrl/⌘+Z)" disabled={!undoLen} onClick={undo}>Undo</button>
        <IconButton icon="swap" label="Swap" id="swap" title="Swap left and right" disabled={empty} onClick={swap} />
        <SearchBox sectionRef={section} version={result} />
      </div>
      {/* Identical sides: an inline notice instead of a grid with nothing to merge. */}
      <p id="identical" className="notice" role="status" hidden={!blocks || total > 0}>
        {blocks && !total && (result.left || result.right ? '✓ The left and right texts are identical.' : 'Both sides are empty. Paste or type text to compare.')}
      </p>
      <div className="diff-wrap">
        <div id="diff" className="diff" ref={diff}>
          {total > 0 && parts.map(p => (p.same
            ? <Same key={p.bi} part={p} open={expanded.has(p.bi)} onExpand={onExpand} />
            : <Change key={p.bi} part={p} total={total} current={p.k === current} onCopy={copyChange} />))}
        </div>
        <div id="locbar" className="locbar" aria-hidden="true" ref={locbar} onClick={onLocbar}>
          {ticks.map((t, i) => (
            <span key={i} className={i === current ? 'tick current' : 'tick'} style={{ top: t.top + '%', height: t.height + '%' }}
              onClick={e => { e.stopPropagation(); go(i); }} />
          ))}
          {ticks.length > 0 && <span className="view" ref={view} />}
        </div>
      </div>
      <p className="muted hint-keys">Shortcuts: Alt+↓ / Alt+↑ next / previous difference · Alt+→ / Alt+← copy it right / left · Ctrl/⌘+Z undo</p>
    </section>
  );
}
