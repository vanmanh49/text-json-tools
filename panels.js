// Panel chrome shared by every tool: the buttons in each panel header, the status bar, the empty
// state, file drop, "Send to", remembered text and the theme switch. Tool logic lives in app.js.
import { jsonStatus, formatSize, findAll } from './tools.js';

// Static icon markup (never user text), stroke icons in the Lucide style.
const ICONS = {
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  clear: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  sample: '<path d="M9 3h6"/><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/>',
  theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
};

export function iconButton(icon, label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.title = label;
  b.setAttribute('aria-label', label); // the visible label is hidden on phones
  b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg><span class="label"></span>`;
  b.querySelector('.label').textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// Briefly replace a button's label (shown even on phones, where labels are otherwise hidden).
function flash(button, text) {
  const label = button.querySelector('.label');
  label.dataset.label ??= label.textContent;
  label.textContent = text;
  button.classList.add('flashing');
  clearTimeout(button._flash);
  button._flash = setTimeout(() => {
    label.textContent = label.dataset.label;
    button.classList.remove('flashing');
  }, 1500);
}

// Replace a textarea's text through the editing pipeline so Cmd/Ctrl+Z can undo it; fires 'input'.
export function setText(t, text) {
  t.focus();
  let ok = false;
  // execCommand('insertText') cost grows ~quadratically with newlines (0.4s at 800 lines, minutes at
  // 20k), while 'delete' stays fast. So long multi-line text is set directly.
  // shortcut: that direct set is not Cmd/Ctrl+Z-undoable; add a panel-level undo if users need it for big pastes.
  const cheap = !text || text.split('\n', 202).length <= 201; // ≤ 200 newlines
  // execCommand edits whatever has focus, so only use it when `t` really got focus (not hidden).
  if (document.activeElement === t && cheap) {
    t.select();
    ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
  }
  if (!ok || t.value !== text) { t.value = text; t.dispatchEvent(new Event('input', { bubbles: true })); }
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Buttons that need content are disabled while there is none. Each tool registers a check here;
// refreshButtons() runs on every input event and after any code that changes text without one.
const buttonChecks = [];
export const onRefresh = check => buttonChecks.push(check);
export function refreshButtons() { for (const check of buttonChecks) check(); }
document.addEventListener('input', refreshButtons);

// Browser storage is a convenience: every access may throw (private mode, blocked site data).
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
};

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const MAX_DROP = 25 * 1024 * 1024; // larger files make the tools and the page sluggish
const MAX_SAVE = 2 * 1024 * 1024; // localStorage is ~5 MB per site in most browsers
const SEND_TO = [ // [label, tab, textarea id]
  ['Format', 'format', 'fmt-in'],
  ['Minify', 'minify', 'min-in'],
  ['Text → JSON', 'text-to-json', 't2j-in'],
  ['JSON → Text', 'json-to-text', 'j2t-in'],
  ['Compare (left)', 'compare', 'left'],
  ['Compare (right)', 'compare', 'right'],
  ['Encode / Decode', 'encode', 'enc-in'],
];

// Turn engine wording into a short sentence; the line and column are shown separately.
const tidy = msg => msg
  .replace(/^JSON\.parse: /, '')
  .replace(/, (\.\.\.)?"[\s\S]*" is not valid JSON$/, '') // V8 quotes a snippet; the line/column replace it
  .replace(/\s*(in JSON )?at (position|line) [\s\S]*$/, '')
  .replace(/^./, c => c.toUpperCase());

function settings() {
  try { return { remember: true, ...JSON.parse(store.get('tjt:settings') || '{}') }; } catch { return { remember: true }; }
}

// `samples`: textarea id → text, or { left, right } to fill both Compare sides.
export function initPanels({ samples = {} } = {}) {
  let remember = settings().remember;

  for (const tools of document.querySelectorAll('.tools[data-for]')) {
    const t = document.getElementById(tools.dataset.for);
    const panel = tools.closest('.panel');
    const section = t.closest('section');
    const err = section.querySelector('.err');
    const label = tools.closest('.panel-head').firstElementChild.textContent;
    const isJson = tools.dataset.ext === 'json';
    const editable = t.tagName === 'TEXTAREA' && !t.readOnly;
    const persist = editable && !t.hasAttribute('data-private'); // e.g. JWTs: never written to storage
    const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${tools.dataset.ext}`; // e.g. one-line-json.json

    // Header buttons.
    tools.append(iconButton('copy', 'Copy', async e => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(t.value); flash(b, 'Copied'); } catch { flash(b, 'Copy failed'); }
    }));
    const paste = async () => {
      try { setText(t, await navigator.clipboard.readText()); }
      catch { err.textContent = 'The browser blocked clipboard access. Click the box and press Ctrl+V (⌘V on Mac).'; }
    };
    if (editable) {
      tools.append(iconButton('paste', 'Paste', paste));
      tools.append(iconButton('clear', 'Clear', () => t.value && setText(t, '')));
    }
    tools.append(iconButton('download', 'Download', () => download(t.value, name)));
    const needText = [...tools.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') !== 'Paste');

    // Send to another tool (output panels only).
    let sendTo;
    if (!editable) {
      sendTo = el('select', 'send-to');
      sendTo.setAttribute('aria-label', 'Send this result to another tool');
      sendTo.append(el('option', null, 'Send to…'));
      for (const [text, tab, id] of SEND_TO) if (tab !== section.dataset.tab) sendTo.append(Object.assign(el('option', null, text), { value: `${tab}|${id}` }));
      sendTo.addEventListener('change', () => {
        const [tab, id] = sendTo.value.split('|');
        sendTo.selectedIndex = 0;
        if (!id) return;
        const target = document.getElementById(id);
        setText(target, t.value); // target is on a hidden tab, so this takes the direct-set path
        location.hash = '#' + tab;
        target.focus();
      });
      tools.prepend(sendTo);
    }

    // Wrap the content in an .editor so the empty state and drop outline can sit on top of it.
    const editor = el('div', 'editor');
    t.replaceWith(editor);
    editor.append(t);
    const empty = el('div', 'empty');
    if (editable) {
      const acts = el('div', 'empty-actions');
      const p = iconButton('paste', 'Paste', paste);
      p.classList.add('primary');
      acts.append(p);
      if (samples[t.id]) {
        acts.append(iconButton('sample', 'Try a sample', () => {
          const s = samples[t.id];
          if (typeof s === 'string') return setText(t, s);
          setText(document.getElementById('left'), s.left);
          setText(document.getElementById('right'), s.right);
          t.focus();
        }));
      }
      empty.append(acts, el('p', 'empty-hint', 'or drop a file here'));
    } else {
      empty.append(el('p', 'empty-hint', 'The result appears here as you type.'));
    }
    editor.append(empty);

    // Drop a file onto an editable panel; it is read in the browser and never uploaded.
    if (editable) {
      editor.addEventListener('dragover', e => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        editor.classList.add('dropping');
      });
      editor.addEventListener('dragleave', e => { if (!editor.contains(e.relatedTarget)) editor.classList.remove('dropping'); });
      editor.addEventListener('drop', async e => {
        const file = e.dataTransfer.files[0];
        editor.classList.remove('dropping');
        if (!file) return;
        e.preventDefault();
        if (file.size > MAX_DROP) { err.textContent = `${file.name} is ${formatSize(file.size)}. Files up to ${formatSize(MAX_DROP)} can be opened here.`; return; }
        try { setText(t, await file.text()); err.textContent = ''; }
        catch { err.textContent = `${file.name} could not be read as text.`; }
      });
    }

    // Status bar: line count and size; JSON panels also say whether the text is valid.
    const status = el('div', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.append(status);
    let saveNote = '', timer, savedValue = remember ? null : undefined;
    const update = () => {
      const text = t.value;
      const st = isJson ? jsonStatus(text) : { empty: !text, lines: text ? text.split('\n').length : 0, bytes: new TextEncoder().encode(text).length };
      status.replaceChildren();
      status.className = 'status';
      if (st.empty && !text) { status.hidden = true; return; }
      status.hidden = false;
      const msg = el('span', 'msg');
      if (isJson && !st.empty) {
        status.classList.add(st.ok ? 'ok' : 'bad');
        if (st.ok) msg.textContent = '✓ Valid JSON';
        else {
          const at = st.error.line ? `Line ${st.error.line}, column ${st.error.col}: ` : '';
          msg.textContent = `✗ ${at}${tidy(st.error.message)}`;
          if (editable && st.error.pos != null) {
            const go = el('button', 'link', 'Go to error');
            go.type = 'button';
            go.addEventListener('click', () => {
              t.focus();
              t.setSelectionRange(st.error.pos, st.error.pos + 1);
              const lh = parseFloat(getComputedStyle(t).lineHeight) || 18;
              t.scrollTop = Math.max(0, (st.error.line - 1) * lh - t.clientHeight / 3);
            });
            msg.append(' ', go);
          }
        }
      }
      const meta = el('span', 'meta', `${st.lines.toLocaleString()} line${st.lines === 1 ? '' : 's'} · ${formatSize(st.bytes)}${saveNote}`);
      status.append(msg, meta);
    };

    // Remember editable text between visits (debounced; skipped for very large text).
    const save = () => {
      if (!persist || savedValue === t.value) return;
      savedValue = t.value;
      saveNote = '';
      if (!remember) return;
      if (!t.value) store.del('tjt:text:' + t.id);
      else if (t.value.length > MAX_SAVE) { store.del('tjt:text:' + t.id); saveNote = ' · too large to remember'; }
      else if (!store.set('tjt:text:' + t.id, t.value)) saveNote = ' · not saved (browser storage is full or blocked)';
    };

    onRefresh(() => {
      for (const b of needText) b.disabled = !t.value;
      if (sendTo) sendTo.disabled = !t.value;
      empty.hidden = !!t.value;
      clearTimeout(timer);
      timer = setTimeout(() => { save(); update(); }, t.value.length > 200000 ? 300 : 60); // keep typing smooth in big documents
    });

    if (persist && remember) {
      const saved = store.get('tjt:text:' + t.id);
      if (saved) { t.value = saved; t.dispatchEvent(new Event('input', { bubbles: true })); }
      savedValue = t.value;
    }
  }

  // Settings menu: remember text, clear everything.
  const rememberBox = document.getElementById('remember');
  rememberBox.checked = remember;
  rememberBox.addEventListener('change', () => {
    remember = rememberBox.checked;
    store.set('tjt:settings', JSON.stringify({ remember }));
    for (const t of document.querySelectorAll('textarea:not([readonly]):not([data-private])')) {
      if (remember && t.value && t.value.length <= MAX_SAVE) store.set('tjt:text:' + t.id, t.value);
      else store.del('tjt:text:' + t.id);
    }
  });
  const clearAll = document.getElementById('clear-all');
  clearAll.addEventListener('click', () => {
    // Two clicks, so a stray click cannot wipe everything.
    if (!clearAll.classList.contains('confirm')) {
      clearAll.classList.add('confirm');
      clearAll.textContent = 'Click again to clear every panel';
      setTimeout(() => { clearAll.classList.remove('confirm'); clearAll.textContent = 'Clear all panels'; }, 3000);
      return;
    }
    clearAll.classList.remove('confirm');
    clearAll.textContent = 'Clear all panels';
    for (const t of document.querySelectorAll('textarea:not([readonly])')) {
      store.del('tjt:text:' + t.id);
      if (t.value) { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    clearAll.closest('details').open = false;
  });

  // Theme: System → Light → Dark. The initial value is applied by an inline script in <head>.
  const THEMES = ['system', 'light', 'dark'];
  const themeBtn = document.getElementById('theme');
  const showTheme = th => {
    if (th === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = th;
    const name = th[0].toUpperCase() + th.slice(1);
    themeBtn.replaceChildren(...iconButton('theme', `Theme: ${name}`, null).childNodes);
    themeBtn.title = `Theme: ${name} (click to change)`;
    themeBtn.setAttribute('aria-label', themeBtn.title);
  };
  let theme = store.get('tjt:theme') || 'system';
  showTheme(THEMES.includes(theme) ? theme : 'system');
  themeBtn.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set('tjt:theme', theme);
    showTheme(theme);
  });

  for (const section of document.querySelectorAll('section[data-tab]')) if (!section.querySelector('input[type="search"]')) initSearch(section);

  // Ctrl/⌘+F goes to the open tool's search box; the browser's own find is used when it is disabled.
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
    const box = document.querySelector('section:not([hidden]) input[type="search"]');
    if (!box || box.disabled) return;
    e.preventDefault();
    box.focus();
    box.select();
  });
  // The browser keeps one undo history for the whole page, so Ctrl/⌘+Z in the search box would go on to
  // undo a panel's edits (wiping a paste) once its own typing is undone. Undo only the focused box.
  document.addEventListener('beforeinput', e => {
    if (e.inputType.startsWith('history') && e.target !== document.activeElement) e.preventDefault();
  });
  // Ctrl/⌘+V outside a text box pastes into the open tool's input (Compare: the first empty side).
  // shortcut: Safari may not fire 'paste' when nothing editable is focused; the inputs get focus on tab open anyway.
  document.addEventListener('paste', e => {
    if (e.target.closest?.('textarea, input, select, [contenteditable]')) return;
    const text = e.clipboardData?.getData('text/plain');
    const inputs = [...document.querySelectorAll('section:not([hidden]) textarea:not([readonly])')];
    const t = inputs.find(i => !i.value) ?? inputs[0];
    if (!text || !t) return;
    e.preventDefault();
    setText(t, text);
  });

  refreshButtons();
}

// Search box for a tool: finds text in its visible panels and, on Compare, in the diff.
// Matches are painted with the CSS Custom Highlight API. A textarea hides its selection while the
// search box has focus, so each one gets a transparent copy of its text (.hl) laid behind it to paint on.
const MAX_HITS = 2000; // more makes typing in the box sluggish on big documents
const canPaint = typeof Highlight === 'function' && !!globalThis.CSS?.highlights;
function initSearch(section) {
  let bar = section.querySelector('.toolbar');
  if (!bar) section.querySelector('.io').before(bar = el('div', 'toolbar'));
  const box = Object.assign(el('input'), { type: 'search', placeholder: 'Search…' });
  box.setAttribute('aria-label', 'Search in this tool (Enter for next match, Shift+Enter for previous)');
  const count = el('span', 'muted');
  count.setAttribute('role', 'status');
  bar.append(box, count);
  let hits = [], at = -1, timer;

  const paint = () => {
    if (!canPaint) return;
    CSS.highlights.set('find', new Highlight(...hits));
    CSS.highlights.set('find-current', new Highlight(...(hits[at] ? [hits[at]] : [])));
  };
  const collect = (node, q) => {
    if (!node) return;
    for (const [a, b] of findAll(node.data, q, MAX_HITS - hits.length)) {
      const r = new Range();
      r.setStart(node, a);
      r.setEnd(node, b);
      hits.push(r);
    }
  };
  function run() {
    const q = box.value;
    hits = [];
    at = -1;
    for (const t of section.querySelectorAll('textarea')) {
      const ed = t.parentElement, on = !!q && t.checkVisibility();
      let hl = ed.querySelector('.hl');
      ed.classList.toggle('searching', on);
      if (!on) { hl?.replaceChildren(); continue; }
      if (!hl) {
        t.before(hl = el('div', 'hl'));
        t.addEventListener('scroll', () => { hl.scrollTop = t.scrollTop; });
      }
      hl.replaceChildren(t.value, el('br')); // the <br> keeps a trailing newline's empty line, as the textarea shows it
      Object.assign(hl.style, { width: t.clientWidth + 'px', height: t.clientHeight + 'px' }); // without the scrollbar
      hl.scrollTop = t.scrollTop;
      collect(hl.firstChild, q);
    }
    if (q) for (const s of section.querySelectorAll('.diff .txt')) collect(s.firstChild, q);
    paint();
    count.textContent = !q ? '' : !hits.length ? 'No matches'
      : `${hits.length >= MAX_HITS ? MAX_HITS + '+' : hits.length} match${hits.length > 1 ? 'es' : ''}`;
  }
  function go(step) {
    if (!hits.length) return;
    at = (at + step + hits.length) % hits.length;
    const r = hits[at], host = r.startContainer.parentElement, hl = host.closest('.hl');
    if (hl) {
      const t = hl.nextElementSibling;
      t.scrollTop += r.getBoundingClientRect().top - t.getBoundingClientRect().top - t.clientHeight / 3;
      t.scrollIntoView({ block: 'nearest' });
    } else {
      const hidden = host.closest('.hidden-lines');
      if (hidden?.hidden) hidden.previousElementSibling.click(); // its "⋯ N unchanged lines" button
      host.scrollIntoView({ block: 'center' });
    }
    paint();
    count.textContent = `${at + 1} of ${hits.length >= MAX_HITS ? MAX_HITS + '+' : hits.length}`;
  }

  box.addEventListener('input', run);
  box.addEventListener('focus', run); // the panels may have changed while the box was elsewhere
  box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } });
  // Text, tab or size changes move the matches.
  const later = () => { if (box.value && !section.hidden) { clearTimeout(timer); timer = setTimeout(run, 150); } };
  onRefresh(later);
  addEventListener('resize', later);
  addEventListener('hashchange', () => { if (!section.hidden) run(); });
}
