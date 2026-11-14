import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findAll } from '../tools.js';
import { EDITABLE_IDS, textStore } from '../textStore.js';

// Search box for a tool: finds text in its visible panels, the Format Pretty view and the Compare diff.
// Matches are painted with the CSS Custom Highlight API. A textarea hides its selection while the
// search box has focus, so each one gets a transparent copy of its text (.hl) laid behind it to paint on.
const MAX_HITS = 2000; // more makes typing in the box sluggish on big documents
const SEARCH_OPTIONS = [ // [findAll option, button text, label]
  ['matchCase', 'Aa', 'Match case'],
  ['wholeWord', 'ab', 'Match whole word'],
  ['regex', '.*', 'Use regular expression'],
];
const canPaint = typeof Highlight === 'function' && !!globalThis.CSS?.highlights;
const mirrored = new WeakSet(); // textareas whose scroll position is already copied onto their .hl
const shown = n => (n >= MAX_HITS ? MAX_HITS + '+' : n);
const isBad = (q, opts) => { try { findAll('', q, 1, opts); return false; } catch { return true; } };

// The .hl divs are rendered empty by Panel, so filling them through the DOM never fights React.
export default function SearchBox({ sectionRef, version }) {
  const [q, setQ] = useState('');
  // Toggles, as in VS Code: they apply to this tool's search only and are not remembered.
  const [opts, setOpts] = useState({});
  const [count, setCount] = useState('');
  const box = useRef(null), hits = useRef([]), at = useRef(-1), timer = useRef(), runRef = useRef();
  const bad = isBad(q, opts);

  const paint = () => {
    if (!canPaint) return;
    CSS.highlights.set('find', new Highlight(...hits.current));
    CSS.highlights.set('find-current', new Highlight(...(hits.current[at.current] ? [hits.current[at.current]] : [])));
  };
  function run() {
    const query = bad ? '' : q; // a regex that doesn't compile finds nothing
    const found = [];
    const collect = node => {
      if (!node) return;
      for (const [a, b] of findAll(node.data, query, MAX_HITS - found.length, opts)) {
        const r = new Range();
        r.setStart(node, a);
        r.setEnd(node, b);
        found.push(r);
      }
    };
    for (const t of sectionRef.current.querySelectorAll('textarea')) {
      const hl = t.parentElement.querySelector('.hl');
      if (!query || !(t.checkVisibility?.() ?? !t.closest('[hidden]'))) { hl.replaceChildren(); continue; }
      if (!mirrored.has(t)) { mirrored.add(t); t.addEventListener('scroll', () => { hl.scrollTop = t.scrollTop; }); }
      hl.replaceChildren(t.value, document.createElement('br')); // the <br> keeps a trailing newline's empty line, as the textarea shows it
      Object.assign(hl.style, { width: t.clientWidth + 'px', height: t.clientHeight + 'px' }); // without the scrollbar
      hl.scrollTop = t.scrollTop;
      collect(hl.firstChild);
    }
    // shortcut: a Pretty-view match must sit inside one token (key, value, punctuation), not span tokens.
    if (query) for (const s of sectionRef.current.querySelectorAll('.diff .txt, .pretty .code > span:not(.summary)')) collect(s.firstChild);
    hits.current = found;
    at.current = -1;
    paint();
    setCount(bad ? 'Invalid regex' : !query ? '' : !found.length ? 'No matches'
      : `${shown(found.length)} match${found.length > 1 ? 'es' : ''}`);
  }
  function go(step) {
    const hs = hits.current;
    if (!hs.length) return;
    at.current = (at.current + step + hs.length) % hs.length;
    const r = hs[at.current], host = r.startContainer.parentElement, hl = host.closest('.hl');
    if (hl) {
      const t = hl.nextElementSibling;
      t.scrollTop += r.getBoundingClientRect().top - t.getBoundingClientRect().top - t.clientHeight / 3;
      t.scrollIntoView({ block: 'nearest' });
    } else {
      // Both click handlers render with flushSync, so the match is shown before it is scrolled to.
      const hidden = host.closest('.hidden-lines');
      if (hidden?.hidden) hidden.previousElementSibling.click(); // its "⋯ N unchanged lines" button
      for (let n = host.closest('.node.collapsed'); n; n = n.parentElement.closest('.node.collapsed')) n.querySelector('.fold').click(); // Pretty view folds
      host.scrollIntoView({ block: 'center' });
    }
    paint();
    setCount(`${at.current + 1} of ${shown(hs.length)}`);
  }

  useLayoutEffect(() => { runRef.current = run; });
  useEffect(run, [q, opts]);
  // Text, tab or size changes move the matches.
  const later = () => {
    if (box.current.value && !sectionRef.current.hidden) { clearTimeout(timer.current); timer.current = setTimeout(() => runRef.current(), 150); }
  };
  useEffect(later, [version]);
  useEffect(() => {
    // The tab is shown by the render that follows hashchange, so look once that render is done.
    const onHash = () => setTimeout(() => { const s = sectionRef.current; if (s && !s.hidden) runRef.current(); });
    // The store also notifies when it saves, which is no reason to search again.
    let texts = EDITABLE_IDS.map(textStore.get);
    const unsubscribe = textStore.subscribe(() => {
      const now = EDITABLE_IDS.map(textStore.get);
      if (now.some((t, i) => t !== texts[i])) { texts = now; later(); }
    });
    addEventListener('resize', later);
    addEventListener('hashchange', onHash);
    return () => { unsubscribe(); clearTimeout(timer.current); removeEventListener('resize', later); removeEventListener('hashchange', onHash); };
  }, []);

  return (
    <>
      <span className="search">{/* one bordered box: the input, then the toggles inside it on the right */}
        <input ref={box} type="search" placeholder="Search…" aria-label="Search in this tool (Enter for next match, Shift+Enter for previous)"
          aria-invalid={bad || undefined} value={q} onChange={e => setQ(e.target.value)}
          onFocus={run} // the panels may have changed while the box was elsewhere
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } }} />
        {SEARCH_OPTIONS.map(([key, text, label]) => (
          <button key={key} type="button" className="opt" title={label} aria-label={label} aria-pressed={!!opts[key]}
            onClick={() => setOpts(o => ({ ...o, [key]: !o[key] }))}>{text}</button>
        ))}
      </span>
      <span className="muted" role="status">{count}</span>
    </>
  );
}
