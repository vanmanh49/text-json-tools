import { useRef } from 'react';
import { IconButton, flash } from './IconButton.jsx';
import { StatusBar } from './StatusBar.jsx';
import { SAMPLES } from '../samples.js';
import { formatSize } from '../tools.js';
import { PRIVATE_IDS, textStore, useText } from '../textStore.js';
import { setText } from '../setText.js';

const MAX_DROP = 25 * 1024 * 1024; // larger files make the tools and the page sluggish
const SEND_TO = [ // [label, tab, textarea id]
  ['Format', 'format', 'fmt-in'],
  ['Minify', 'minify', 'min-in'],
  ['Text → JSON', 'text-to-json', 't2j-in'],
  ['JSON → Text', 'json-to-text', 'j2t-in'],
  ['Compare (left)', 'compare', 'left'],
  ['Compare (right)', 'compare', 'right'],
  ['Encode / Decode', 'encode', 'enc-in'],
];

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Editable: text lives in the store (`id`). Read-only or with `children` (Pretty view): `value` is the text.
export default function Panel({ id, label, labelId, ext, tab, readOnly, value, className, onErr, children }) {
  const stored = useText(id);
  const ta = useRef(null);
  const editable = !readOnly && !children;
  const text = editable ? stored : value ?? '';
  const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`; // e.g. one-line-json.json
  const sample = editable && SAMPLES[id];

  const copy = async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(text); flash(b, 'Copied'); } catch { flash(b, 'Copy failed'); }
  };
  const paste = async () => {
    try { setText(id, await navigator.clipboard.readText()); }
    catch { onErr?.('The browser blocked clipboard access. Click the box and press Ctrl+V (⌘V on Mac).'); }
  };
  const trySample = () => {
    if (typeof sample === 'string') return setText(id, sample);
    setText('left', sample.left);
    setText('right', sample.right);
    ta.current?.focus();
  };
  const sendTo = e => {
    const [target, targetId] = e.target.value.split('|');
    e.target.selectedIndex = 0;
    if (!targetId) return;
    textStore.set(targetId, text);
    const focus = () => requestAnimationFrame(() => document.getElementById(targetId)?.focus());
    if (location.hash === '#' + target) return focus(); // no hashchange will fire
    addEventListener('hashchange', focus, { once: true }); // focus after the tab is shown, not before
    location.hash = '#' + target;
  };

  const drop = {
    onDragOver: e => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      e.currentTarget.classList.add('dropping');
    },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('dropping'); },
    onDrop: async e => {
      const file = e.dataTransfer.files[0];
      e.currentTarget.classList.remove('dropping');
      if (!file) return;
      e.preventDefault();
      if (file.size > MAX_DROP) { onErr?.(`${file.name} is ${formatSize(file.size)}. Files up to ${formatSize(MAX_DROP)} can be opened here.`); return; }
      try { setText(id, await file.text()); onErr?.(''); }
      catch { onErr?.(`${file.name} could not be read as text.`); }
    },
  };

  const empty = !text;
  return (
    <div className="panel">
      <div className="panel-head">
        {children ? <span id={labelId}>{label}</span> : <label htmlFor={id}>{label}</label>}
        <div className="tools">
          {!editable && (
            <select className="send-to" aria-label="Send this result to another tool" disabled={empty} onChange={sendTo}>
              <option>Send to…</option>
              {SEND_TO.filter(([, t]) => t !== tab).map(([l, t, i]) => <option key={l} value={`${t}|${i}`}>{l}</option>)}
            </select>
          )}
          <IconButton icon="copy" label="Copy" disabled={empty} onClick={copy} />
          {editable && <IconButton icon="paste" label="Paste" onClick={paste} />}
          {editable && <IconButton icon="clear" label="Clear" disabled={empty} onClick={() => setText(id, '')} />}
          <IconButton icon="download" label="Download" disabled={empty} onClick={() => download(text, name)} />
        </div>
      </div>
      <div className="editor" {...(editable ? drop : {})}>
        <div className="hl" />
        {children ?? (
          <textarea id={id} className={className} ref={ta} spellCheck={false} readOnly={readOnly} value={text} data-private={PRIVATE_IDS.has(id) || undefined}
            onChange={editable ? e => textStore.set(id, e.target.value) : undefined} />
        )}
        <div className="empty" hidden={!empty}>
          {editable ? (
            <>
              <div className="empty-actions">
                <IconButton icon="paste" label="Paste" className="primary" onClick={paste} />
                {sample && <IconButton icon="sample" label="Try a sample" onClick={trySample} />}
              </div>
              <p className="empty-hint">or drop a file here</p>
            </>
          ) : <p className="empty-hint">The result appears here as you type.</p>}
        </div>
      </div>
      <StatusBar id={id} text={text} isJson={ext === 'json'} editable={editable} taRef={ta} onErr={onErr} />
    </div>
  );
}
