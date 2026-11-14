import { useEffect, useRef, useState } from 'react';
import { store, settings } from './store.js';
import { textStore } from './textStore.js';
import { useHashTab } from './useHashTab.js';
import { IconButton } from './ui/IconButton.jsx';

const NAV = [
  ['format', 'JSON Format'], ['compare', 'Compare & Merge'], ['text-to-json', 'Text → JSON'],
  ['json-to-text', 'JSON → Text'], ['minify', 'JSON Minify'], ['jwt', 'JWT Decode'], ['encode', 'Encode / Decode'],
];
// Same order as main's index.html.
const SECTIONS = ['format', 'text-to-json', 'json-to-text', 'minify', 'jwt', 'encode', 'compare'];

// Theme: System → Light → Dark. The initial value is applied by an inline script in <head>.
const THEMES = ['system', 'light', 'dark'];

export default function App() {
  const tab = useHashTab();
  const [theme, setTheme] = useState(() => { const t = store.get('tjt:theme'); return THEMES.includes(t) ? t : 'system'; });
  const [confirming, setConfirming] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const menu = useRef(null);

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    // Workspace tools fill the screen and scroll inside their panels; Compare scrolls the page.
    document.body.classList.toggle('app', tab !== 'compare');
    // Start in the tool's first input (Compare: Left) unless focus is already in the tool.
    const section = document.querySelector(`section[data-tab="${tab}"]`);
    if (!section.contains(document.activeElement)) section.querySelector('textarea:not([readonly])')?.focus({ preventScroll: true });
  }, [tab]);

  useEffect(() => {
    const onScroll = () => setShowTop(scrollY >= 400);
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const cycleTheme = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('tjt:theme', next);
    setTheme(next);
  };
  const clearAll = () => {
    // Two clicks, so a stray click cannot wipe everything.
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    textStore.clearAll();
    menu.current.open = false;
  };
  const themeName = theme[0].toUpperCase() + theme.slice(1);

  return (
    <>
        <header className="topbar">
          <a className="brand" href="#format" title="Runs entirely in your browser. Nothing is uploaded.">
            <span className="mark" aria-hidden="true">{'{ }'}</span>
            <span className="brand-name">Text &amp; JSON Tools</span>
          </a>
          <nav aria-label="Tools">
          {NAV.map(([t, name]) => <a key={t} href={'#' + t} aria-current={tab === t ? 'page' : undefined}>{name}</a>)}
        </nav>
          <div className="top-actions">
            <IconButton id="theme" icon="theme" label={`Theme: ${themeName}`} title={`Theme: ${themeName} (click to change)`} onClick={cycleTheme} />
            <details className="menu" ref={menu}>
              <summary className="icon-btn" aria-label="Settings" title="Settings">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
              </summary>
              <div className="menu-body">
                <label className="check"><input type="checkbox" id="remember" defaultChecked={settings().remember} onChange={e => textStore.setRemember(e.target.checked)} /> Remember my text in this browser</label>
                <p className="menu-note">Text stays on this device only. Turn this off on a shared computer.</p>
                <button id="clear-all" type="button" className={confirming ? 'confirm' : undefined} onClick={clearAll}>{confirming ? 'Click again to clear every panel' : 'Clear all panels'}</button>
                <p className="menu-note">Runs entirely in your browser. Nothing is uploaded.</p>
              </div>
            </details>
          </div>
        </header>

      <main>
        {SECTIONS.map(t => <section key={t} data-tab={t} hidden={tab !== t} />)}
      </main>
      <button id="to-top" className="to-top" type="button" aria-label="Back to top" hidden={!showTop} onClick={() => scrollTo({ top: 0, behavior: 'smooth' })}>↑ Top</button>
    </>
  );
}
