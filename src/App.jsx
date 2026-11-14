export default function App() {
  return (
    <header className="topbar">
      <a className="brand" href="#format" title="Runs entirely in your browser. Nothing is uploaded.">
        <span className="mark" aria-hidden="true">{'{ }'}</span>
        <span className="brand-name">Text &amp; JSON Tools</span>
      </a>
      <nav aria-label="Tools">
        <a href="#format">JSON Format</a>
        <a href="#compare">Compare &amp; Merge</a>
        <a href="#text-to-json">Text → JSON</a>
        <a href="#json-to-text">JSON → Text</a>
        <a href="#minify">JSON Minify</a>
        <a href="#jwt">JWT Decode</a>
        <a href="#encode">Encode / Decode</a>
      </nav>
      <div className="top-actions">
        <button id="theme" className="icon-btn" type="button"></button>
        <details className="menu">
          <summary className="icon-btn" aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </summary>
          <div className="menu-body">
            <label className="check"><input type="checkbox" id="remember" /> Remember my text in this browser</label>
            <p className="menu-note">Text stays on this device only. Turn this off on a shared computer.</p>
            <button id="clear-all" type="button">Clear all panels</button>
            <p className="menu-note">Runs entirely in your browser. Nothing is uploaded.</p>
          </div>
        </details>
      </div>
    </header>
  );
}
