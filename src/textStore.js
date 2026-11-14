import { useSyncExternalStore } from 'react';
import { store, settings, MAX_SAVE } from './store.js';

export const PRIVATE_IDS = new Set(['jwt-in']);
export const EDITABLE_IDS = ['fmt-in', 't2j-in', 'j2t-in', 'min-in', 'jwt-in', 'enc-in', 'left', 'right'];
const PERSISTED = EDITABLE_IDS.filter(id => !PRIVATE_IDS.has(id));
const key = id => 'tjt:text:' + id;

const values = {}, notes = {}, saved = {}, timers = {};
const subs = new Set();
let remember = settings().remember;

const notify = () => subs.forEach(fn => fn());

if (remember) {
  for (const id of PERSISTED) {
    const text = store.get(key(id));
    if (text) values[id] = saved[id] = text;
  }
}

// Remember text between visits; skipped for very large text.
function save(id) {
  const text = values[id] ?? '';
  if (!PERSISTED.includes(id) || saved[id] === text) return;
  saved[id] = text;
  notes[id] = '';
  if (remember) {
    if (!text) store.del(key(id));
    else if (text.length > MAX_SAVE) { store.del(key(id)); notes[id] = ' · too large to remember'; }
    else if (!store.set(key(id), text)) notes[id] = ' · not saved (browser storage is full or blocked)';
  }
  notify();
}

export const textStore = {
  get: id => values[id] ?? '',
  set(id, text) {
    if (textStore.get(id) === text) return;
    values[id] = text;
    notify();
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => save(id), text.length > 200000 ? 300 : 60);
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  saveNote: id => notes[id] ?? '',
  setRemember(on) {
    remember = on;
    store.set('tjt:settings', JSON.stringify({ remember }));
    for (const id of PERSISTED) {
      delete saved[id]; // so save() writes again and sets the "too large" / "not saved" note
      if (remember) save(id);
      else { store.del(key(id)); notes[id] = ''; }
    }
    notify();
  },
  clearAll() {
    for (const id of EDITABLE_IDS) { store.del(key(id)); notes[id] = ''; textStore.set(id, ''); }
  },
};

export const useText = id => useSyncExternalStore(textStore.subscribe, () => textStore.get(id));
