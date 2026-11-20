import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Panel from '../ui/Panel.jsx';
import SearchBox from '../ui/SearchBox.jsx';
import { useText } from '../textStore.js';
import { setText } from '../setText.js';
import { CSV_DELIMS, HASH_ALGOS, LINE_OPS, base64Decode, csvToJson, base64Encode, decodeJwt, describeTime, hash, lineTool, hexDecode, hexEncode, jsonToCsv, jsonToTs, htmlEscape, htmlUnescape, jsonToText, jwtTimeNotes, minify, regexMatches, regexReplace, textToJson, unicodeEscape, unicodeUnescape, urlDecode, urlEncode } from '../tools.js';

// One input panel, one output panel, and the tool's function between them.
export default function TransformTool({ tab, hidden, desc, inId, inLabel, inExt, outId, outLabel, outExt, fn, toolbar, below }) {
  const input = useText(inId);
  const section = useRef(null);
  const [panelErr, setPanelErr] = useState(''); // clipboard, drop and fix messages from the panels
  const sync = useMemo(() => {
    try { return { out: fn(input), error: '' }; } catch (e) { return { out: '', error: e.message }; }
  }, [fn, input]);
  // An async fn returns a promise: show its result only while it is still the latest one.
  const promise = typeof sync.out?.then === 'function' ? sync.out : null;
  const [settled, setSettled] = useState(null);
  useEffect(() => {
    if (!promise) return;
    let live = true;
    promise.then(out => live && setSettled({ promise, out, error: '' }), e => live && setSettled({ promise, out: '', error: e.message }));
    return () => { live = false; };
  }, [promise]);
  const result = !promise ? sync : settled?.promise === promise ? settled : { out: '', error: '' };
  useEffect(() => setPanelErr(''), [input]);
  // JSON input panels show parse errors (with line and column) in their status bar instead.
  const error = inExt === 'json' ? '' : result.error;
  return (
    <section data-tab={tab} hidden={hidden} ref={section}>
      <p className="desc">{desc}</p>
      <div className="toolbar">{toolbar}<SearchBox sectionRef={section} version={result.out} hidden={hidden} /></div>
      <div className="io">
        <Panel id={inId} label={inLabel} ext={inExt} tab={tab} className="in" onErr={setPanelErr} />
        <Panel id={outId} label={outLabel} ext={outExt} tab={tab} className="out" readOnly value={result.out} />
      </div>
      {below}
      <p className="err" role="alert">{error || panelErr}</p>
    </section>
  );
}

export const TextToJson = ({ hidden }) => (
  <TransformTool tab="text-to-json" hidden={hidden} desc="Unescape a JSON string literal into pretty JSON."
    inId="t2j-in" inLabel="Escaped text" inExt="txt" outId="t2j-out" outLabel="JSON" outExt="json" fn={textToJson} />
);

export const JsonToText = ({ hidden }) => (
  <TransformTool tab="json-to-text" hidden={hidden} desc="Escape JSON into a single string literal."
    inId="j2t-in" inLabel="JSON" inExt="json" outId="j2t-out" outLabel="Escaped text" outExt="txt" fn={jsonToText} />
);

export const Minify = ({ hidden }) => (
  <TransformTool tab="minify" hidden={hidden} desc="Minify formatted JSON to one line."
    inId="min-in" inLabel="Formatted JSON" inExt="json" outId="min-out" outLabel="One-line JSON" outExt="json" fn={minify} />
);

const decodeJwtText = s => {
  const d = decodeJwt(s);
  return d ? JSON.stringify({ header: d.header, payload: d.payload }, null, 2) : '';
};

export function Jwt({ hidden }) {
  const token = useText('jwt-in');
  // Plain-English times for iat / nbf / exp under the decoded JSON.
  const notes = useMemo(() => {
    try { return jwtTimeNotes(decodeJwt(token)?.payload); } catch { return []; } // the err line already explains it
  }, [token]);
  const below = (
    <ul id="jwt-times" className="jwt-times" aria-live="polite" hidden={!notes.length}>
      {notes.map(n => <li key={n} className={/^Expired/.test(n) ? 'bad' : ''}>{n}</li>)}
    </ul>
  );
  return (
    <TransformTool tab="jwt" hidden={hidden}
      desc="Read a JSON Web Token's header and payload. Decoding happens in your browser and tokens are never saved. The signature is not checked, so don't trust the contents until your server has verified it."
      inId="jwt-in" inLabel="Token" inExt="txt" outId="jwt-out" outLabel="Header and payload" outExt="json" fn={decodeJwtText} below={below} />
  );
}

const ENCODERS = {
  'base64-encode': base64Encode, 'base64-decode': base64Decode, 'url-encode': urlEncode, 'url-decode': urlDecode, 'hex-encode': hexEncode, 'hex-decode': hexDecode,
  'html-escape': htmlEscape, 'html-unescape': htmlUnescape, 'unicode-escape': unicodeEscape, 'unicode-unescape': unicodeUnescape,
};

export function Encode({ hidden }) {
  const [mode, setMode] = useState('base64-encode');
  const fn = useCallback(s => ENCODERS[mode](s), [mode]);
  const toolbar = (
    <label className="inline">Mode
      <select id="enc-mode" value={mode} onChange={e => setMode(e.target.value)}>
        <option value="base64-encode">Base64 encode</option>
        <option value="base64-decode">Base64 decode</option>
        <option value="url-encode">URL encode</option>
        <option value="url-decode">URL decode</option>
        <option value="hex-encode">Hex encode</option>
        <option value="hex-decode">Hex decode</option>
        <option value="html-escape">HTML escape</option>
        <option value="html-unescape">HTML unescape</option>
        <option value="unicode-escape">Unicode escape</option>
        <option value="unicode-unescape">Unicode unescape</option>
      </select>
    </label>
  );
  return (
    <TransformTool tab="encode" hidden={hidden} desc="Encode or decode Base64, URL, hex, HTML entities and Unicode escapes. Characters from any language are handled as UTF-8."
      inId="enc-in" inLabel="Input" inExt="txt" outId="enc-out" outLabel="Output" outExt="txt" fn={fn} toolbar={toolbar} />
  );
}

export function Lines({ hidden }) {
  const [op, setOp] = useState('sort');
  const fn = useCallback(s => lineTool(s, op), [op]);
  const toolbar = (
    <label className="inline">Action
      <select id="lines-mode" value={op} onChange={e => setOp(e.target.value)}>
        {LINE_OPS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </label>
  );
  return (
    <TransformTool tab="lines" hidden={hidden} desc="Sort, dedupe, trim or change the case of lines."
      inId="lines-in" inLabel="Lines" inExt="txt" outId="lines-out" outLabel="Result" outExt="txt" fn={fn} toolbar={toolbar} />
  );
}

export const Timestamp = ({ hidden }) => (
  <TransformTool tab="time" hidden={hidden} desc="Convert a Unix timestamp to a date, or a date to a timestamp."
    inId="time-in" inLabel="Timestamp or date" inExt="txt" outId="time-out" outLabel="Converted" outExt="txt" fn={describeTime}
    toolbar={<button id="time-now" type="button" onClick={() => setText('time-in', String(Math.floor(Date.now() / 1000)))}>Now</button>} />
);

export function Hash({ hidden }) {
  const [algo, setAlgo] = useState('SHA-256');
  const fn = useCallback(s => hash(s, algo), [algo]);
  const toolbar = (
    <label className="inline">Algorithm
      <select id="hash-algo" value={algo} onChange={e => setAlgo(e.target.value)}>
        {HASH_ALGOS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </label>
  );
  return (
    <TransformTool tab="hash" hidden={hidden} desc="SHA-1, SHA-256, SHA-384 or SHA-512 hash of text, as UTF-8, computed in your browser. Text in this box is never saved."
      inId="hash-in" inLabel="Text" inExt="txt" outId="hash-out" outLabel="Hash (hex)" outExt="txt" fn={fn} toolbar={toolbar} />
  );
}

export function Regex({ hidden }) {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [show, setShow] = useState('matches');
  const [replacement, setReplacement] = useState('');
  const fn = useCallback(s => (show === 'matches' ? regexMatches(s, pattern, flags) : regexReplace(s, pattern, flags, replacement)), [pattern, flags, show, replacement]);
  const toolbar = (
    <>
      <label className="inline">Pattern
        <input type="text" id="re-pattern" className="code" spellCheck={false} autoComplete="off" value={pattern} onChange={e => setPattern(e.target.value)} />
      </label>
      <label className="inline">Flags
        <input type="text" id="re-flags" className="code" spellCheck={false} autoComplete="off" value={flags} onChange={e => setFlags(e.target.value)} />
      </label>
      <label className="inline">Show
        <select id="re-show" value={show} onChange={e => setShow(e.target.value)}>
          <option value="matches">Matches</option>
          <option value="replace">Replace</option>
        </select>
      </label>
      {show === 'replace' && (
        <label className="inline">With
          <input type="text" id="re-replace" className="code" spellCheck={false} autoComplete="off" value={replacement} onChange={e => setReplacement(e.target.value)} />
        </label>
      )}
    </>
  );
  return (
    <TransformTool tab="regex" hidden={hidden} desc="Test a JavaScript regular expression: see each match and its groups, or the text after a replace ($1 and $<name> insert groups)."
      inId="re-in" inLabel="Text" inExt="txt" outId="re-out" outLabel={show === 'matches' ? 'Matches' : 'Replaced text'} outExt={show === 'matches' ? 'json' : 'txt'} fn={fn} toolbar={toolbar} />
  );
}

export function Csv({ hidden }) {
  const [dir, setDir] = useState('json-to-csv');
  const [delim, setDelim] = useState(',');
  const toCsv = dir === 'json-to-csv';
  const fn = useCallback(s => (toCsv ? jsonToCsv(s, delim) : csvToJson(s, delim)), [toCsv, delim]);
  const toolbar = (
    <>
      <label className="inline">Convert
        <select id="csv-dir" value={dir} onChange={e => setDir(e.target.value)}>
          <option value="json-to-csv">JSON → CSV</option>
          <option value="csv-to-json">CSV → JSON</option>
        </select>
      </label>
      <label className="inline">Delimiter
        <select id="csv-delim" value={delim} onChange={e => setDelim(e.target.value)}>
          {CSV_DELIMS.map(([d, label]) => <option key={label} value={d}>{label}</option>)}
        </select>
      </label>
    </>
  );
  return (
    <TransformTool tab="csv" hidden={hidden} desc="Turn a JSON array into CSV, or CSV with a header row into JSON. CSV values stay text, so 007 keeps its zeros."
      inId="csv-in" inLabel={toCsv ? 'JSON' : 'CSV'} inExt={toCsv ? 'json' : 'csv'} outId="csv-out" outLabel={toCsv ? 'CSV' : 'JSON'} outExt={toCsv ? 'csv' : 'json'} fn={fn} toolbar={toolbar} />
  );
}

export const JsonToTs = ({ hidden }) => (
  <TransformTool tab="ts" hidden={hidden} desc="Generate TypeScript interfaces from a JSON sample. Objects in one array are merged, and keys missing from some of them become optional."
    inId="ts-in" inLabel="JSON" inExt="json" outId="ts-out" outLabel="TypeScript" outExt="ts" fn={jsonToTs} />
);
