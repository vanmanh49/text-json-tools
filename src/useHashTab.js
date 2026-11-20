import { useSyncExternalStore } from 'react';

// [tab, menu label, group]: the one list of tools, each group's tools together. App maps each tab to its component.
export const NAV = [
  ['format', 'JSON Format', 'JSON'], ['minify', 'JSON Minify', 'JSON'], ['text-to-json', 'Text → JSON', 'JSON'], ['json-to-text', 'JSON → Text', 'JSON'], ['csv', 'JSON ⇄ CSV', 'JSON'], ['ts', 'JSON → TypeScript', 'JSON'],
  ['compare', 'Compare & Merge', 'Text'], ['html', 'HTML Format', 'Text'], ['lines', 'Line Tools', 'Text'], ['regex', 'Regex Tester', 'Text'],
  ['encode', 'Encode / Decode', 'Encode'], ['jwt', 'JWT Decode', 'Encode'], ['hash', 'Hash', 'Encode'],
  ['uuid', 'UUID', 'More'], ['qr', 'QR Code', 'More'], ['time', 'Timestamp', 'More'],
];
export const GROUPS = [...new Set(NAV.map(n => n[2]))];
const TABS = NAV.map(([t]) => t);

const subscribe = fn => { addEventListener('hashchange', fn); return () => removeEventListener('hashchange', fn); };
const current = () => { const h = location.hash.slice(1); return TABS.includes(h) ? h : TABS[0]; };

export const useHashTab = () => useSyncExternalStore(subscribe, current);
