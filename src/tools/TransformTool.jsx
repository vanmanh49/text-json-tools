import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Panel from '../ui/Panel.jsx';
import SearchBox from '../ui/SearchBox.jsx';
import { useText } from '../textStore.js';
import { base64Decode, base64Encode, decodeJwt, jsonToText, jwtTimeNotes, minify, textToJson, urlDecode, urlEncode } from '../tools.js';

// One input panel, one output panel, and the tool's function between them.
export default function TransformTool({ tab, hidden, desc, inId, inLabel, inExt, outId, outLabel, outExt, fn, toolbar, below }) {
  const input = useText(inId);
  const section = useRef(null);
  const [panelErr, setPanelErr] = useState(''); // clipboard, drop and fix messages from the panels
  const result = useMemo(() => {
    try { return { out: fn(input), error: '' }; } catch (e) { return { out: '', error: e.message }; }
  }, [fn, input]);
  useEffect(() => setPanelErr(''), [input]);
  // JSON input panels show parse errors (with line and column) in their status bar instead.
  const error = inExt === 'json' ? '' : result.error;
  return (
    <section data-tab={tab} hidden={hidden} ref={section}>
      <p className="desc">{desc}</p>
      <div className="toolbar">{toolbar}<SearchBox sectionRef={section} version={result.out} /></div>
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

const ENCODERS = { 'base64-encode': base64Encode, 'base64-decode': base64Decode, 'url-encode': urlEncode, 'url-decode': urlDecode };

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
      </select>
    </label>
  );
  return (
    <TransformTool tab="encode" hidden={hidden} desc="Encode or decode Base64 and URL text. Characters from any language are handled as UTF-8."
      inId="enc-in" inLabel="Input" inExt="txt" outId="enc-out" outLabel="Output" outExt="txt" fn={fn} toolbar={toolbar} />
  );
}
