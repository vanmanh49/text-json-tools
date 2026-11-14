import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Panel from '../ui/Panel.jsx';
import SearchBox from '../ui/SearchBox.jsx';
import { useText } from '../textStore.js';
import { jsonLines, linesText } from '../tools.js';

const NONE = new Set();

// Items are line indexes (leaves) or { i, end, kids } for an object/array spanning lines i..end.
function tree(lines, i = 0, stop = lines.length) {
  const out = [];
  while (i < stop) {
    const end = lines[i].end;
    if (end == null) out.push(i++);
    else { out.push({ i, end, kids: tree(lines, i + 1, end) }); i = end + 1; }
  }
  return out;
}

// Memoised, so a fold toggle re-renders the nodes but not every leaf line.
const Line = memo(function Line({ l, i, shut, close, onFold }) {
  const fold = shut !== undefined;
  const noun = l.kind === '{' ? (l.count === 1 ? 'key' : 'keys') : (l.count === 1 ? 'item' : 'items');
  return (
    <div className="line" style={{ '--d': l.depth }}>
      <span className="ln">{i + 1}</span>
      {fold
        ? <button type="button" className="fold" aria-expanded={!shut} aria-label={`Fold line ${i + 1}`} onClick={() => onFold(i)}>{shut ? '▸' : '▾'}</button>
        : <span className="fold-pad" />}
      <span className="code">
        {l.parts.map(([cls, text], k) => <span key={k} className={cls}>{text}</span>)}
        {fold && <span className="summary"><span className="punc">{'…' + close}</span><span className="hint">{` ${l.count} ${noun}`}</span></span>}
      </span>
    </div>
  );
});

// shortcut: renders every line into the DOM; fine to tens of thousands of lines, virtualize if users paste far bigger payloads.
function Rows({ items, lines, collapsed, onFold }) {
  return items.map(it => {
    if (typeof it === 'number') return <Line key={it} l={lines[it]} i={it} />;
    const shut = collapsed.has(it.i);
    return (
      <div key={it.i} className={shut ? 'node collapsed' : 'node'} data-i={it.i}>
        <Line l={lines[it.i]} i={it.i} shut={shut} close={lines[it.end].parts.map(p => p[1]).join('')} onFold={onFold} />
        <div className="kids"><Rows items={it.kids} lines={lines} collapsed={collapsed} onFold={onFold} /></div>
        <Line l={lines[it.end]} i={it.end} />
      </div>
    );
  });
}

// JSON Format: Postman-style pretty view with colours, line numbers and folding.
export default function FormatTool({ hidden }) {
  const input = useText('fmt-in');
  const [src, setSrc] = useState(input);
  const [indentSel, setIndentSel] = useState('2');
  const [sort, setSort] = useState(false);
  const [panelErr, setPanelErr] = useState('');
  const section = useRef(null);
  useEffect(() => {
    setPanelErr('');
    const t = setTimeout(() => setSrc(input), 150);
    return () => clearTimeout(t);
  }, [input]);

  const indent = indentSel === 'tab' ? '\t' : Number(indentSel);
  // Invalid JSON renders nothing: the input panel's status bar shows the parse error with its line and column.
  const value = useMemo(() => {
    const s = src.trim();
    try { return s ? { v: JSON.parse(s) } : null; } catch { return null; }
  }, [src]);
  const lines = useMemo(() => (value ? jsonLines(value.v, indent, sort) : []), [value, indent, sort]);
  const text = useMemo(() => linesText(lines, indent), [lines, indent]);
  const items = useMemo(() => tree(lines), [lines]);

  const [collapsed, setCollapsed] = useState(NONE);
  const [prevLines, setPrevLines] = useState(lines);
  if (prevLines !== lines) { setPrevLines(lines); setCollapsed(NONE); }

  // flushSync: the search clicks .fold and scrolls to the match straight after, so the DOM must already be open.
  const onFold = useCallback(i => flushSync(() => setCollapsed(c => {
    const n = new Set(c);
    if (!n.delete(i)) n.add(i);
    return n;
  })), []);
  // Keep the root open so the top-level keys stay visible, as Postman does.
  const nested = useMemo(() => lines.flatMap((l, i) => (l.end != null && l.depth > 0 ? [i] : [])), [lines]);

  return (
    <section data-tab="format" hidden={hidden} ref={section}>
      <p className="desc">Pretty-print JSON with colours, line numbers and folding, like Postman.</p>
      <div className="toolbar">
        <label className="inline">Indent
          <select id="fmt-indent" value={indentSel} onChange={e => setIndentSel(e.target.value)}>
            <option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option>
          </select>
        </label>
        <label className="inline"><input type="checkbox" id="fmt-sort" checked={sort} onChange={e => setSort(e.target.checked)} /> Sort keys A→Z</label>
        <button id="fmt-expand" type="button" disabled={!lines.length} onClick={() => setCollapsed(NONE)}>Expand all</button>
        <button id="fmt-collapse" type="button" disabled={!nested.length} onClick={() => setCollapsed(new Set(nested))}>Collapse all</button>
        <SearchBox sectionRef={section} version={lines} />
      </div>
      <div className="io">
        <Panel id="fmt-in" label="JSON" ext="json" tab="format" className="in" onErr={setPanelErr} />
        <Panel id="fmt-out" label="Pretty" labelId="fmt-out-label" ext="json" tab="format" value={text}>
          <div id="fmt-out" className="pretty" role="region" aria-labelledby="fmt-out-label" tabIndex={0}
            style={{ '--indent': (indent === '\t' ? 4 : indent) + 'ch' }}>
            <Rows items={items} lines={lines} collapsed={collapsed} onFold={onFold} />
          </div>
        </Panel>
      </div>
      <p className="err" role="alert">{panelErr}</p>
    </section>
  );
}
