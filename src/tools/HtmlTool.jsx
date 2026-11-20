import { useEffect, useMemo, useRef, useState } from 'react';
import Panel from '../ui/Panel.jsx';
import SearchBox from '../ui/SearchBox.jsx';
import { useText } from '../textStore.js';
import { formatHtml, htmlPreview } from '../tools.js';

// HTML Format: the input indented, or rendered in a sandboxed frame.
export default function HtmlTool({ hidden }) {
  const input = useText('html-in');
  const [view, setView] = useState('code');
  const [shown, setShown] = useState(input); // formatting a big page and reloading the preview wait for a pause in typing
  const [panelErr, setPanelErr] = useState('');
  const section = useRef(null);
  useEffect(() => {
    setPanelErr('');
    const t = setTimeout(() => setShown(input), 150);
    return () => clearTimeout(t);
  }, [input]);
  const result = useMemo(() => {
    try { return { out: formatHtml(shown), error: '' }; } catch (e) { return { out: '', error: e.message }; }
  }, [shown]);

  return (
    <section data-tab="html" hidden={hidden} ref={section}>
      <p className="desc">Indent HTML so it is easy to read, or see how it looks. The preview runs no scripts and loads nothing from the network.</p>
      <div className="toolbar">
        <label className="inline">Show
          <select id="html-view" value={view} onChange={e => setView(e.target.value)}>
            <option value="code">Formatted HTML</option>
            <option value="preview">Preview</option>
          </select>
        </label>
        <SearchBox sectionRef={section} version={result.out} hidden={hidden} />
      </div>
      <div className="io">
        <Panel id="html-in" label="HTML" ext="html" tab="html" className="in" onErr={setPanelErr} />
        {view === 'code'
          ? <Panel key="code" id="html-out" label="Formatted HTML" ext="html" tab="html" className="out" readOnly value={result.out} />
          : (
            <Panel key="preview" id="html-preview" label="Preview" labelId="html-preview-label" ext="html" tab="html" value={result.out}>
              {/* sandbox="" : no scripts, forms, popups or access to this page */}
              <iframe id="html-preview" className="preview" sandbox="" title="Preview of the HTML" srcDoc={htmlPreview(shown)} />
            </Panel>
          )}
      </div>
      <p className="err" role="alert">{result.error || panelErr}</p>
    </section>
  );
}
