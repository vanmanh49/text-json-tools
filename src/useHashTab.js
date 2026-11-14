import { useSyncExternalStore } from 'react';

// [tab, menu label]: the one list of tools. App maps each tab to its component.
export const NAV = [
  ['format', 'JSON Format'], ['compare', 'Compare & Merge'], ['text-to-json', 'Text → JSON'],
  ['json-to-text', 'JSON → Text'], ['minify', 'JSON Minify'], ['jwt', 'JWT Decode'], ['encode', 'Encode / Decode'],
];
const TABS = NAV.map(([t]) => t);

const subscribe = fn => { addEventListener('hashchange', fn); return () => removeEventListener('hashchange', fn); };
const current = () => { const h = location.hash.slice(1); return TABS.includes(h) ? h : TABS[0]; };

export const useHashTab = () => useSyncExternalStore(subscribe, current);
