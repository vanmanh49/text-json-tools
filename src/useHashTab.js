import { useSyncExternalStore } from 'react';

export const TABS = ['format', 'compare', 'text-to-json', 'json-to-text', 'minify', 'jwt', 'encode'];

const subscribe = fn => { addEventListener('hashchange', fn); return () => removeEventListener('hashchange', fn); };
const current = () => { const h = location.hash.slice(1); return TABS.includes(h) ? h : TABS[0]; };

export const useHashTab = () => useSyncExternalStore(subscribe, current);
