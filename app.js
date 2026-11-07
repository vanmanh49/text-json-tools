import { textToJson, jsonToText, minify, diffBlocks, applyCopy } from './tools.js';

const TABS = ['text-to-json', 'json-to-text', 'minify', 'compare'];

function showTab() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : TABS[0];
  for (const s of document.querySelectorAll('section[data-tab]')) s.hidden = s.dataset.tab !== tab;
  for (const a of document.querySelectorAll('nav a')) {
    if (a.hash === '#' + tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
addEventListener('hashchange', showTab);
showTab();

// Static icon markup (never user text), stroke icons in the Lucide style.
const ICONS = {
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  clear: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
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
function setText(t, text) {
  t.focus();
  t.select();
  const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
  if (!ok) { t.value = text; t.dispatchEvent(new Event('input')); }
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Every panel: Copy and Download; editable panels also get Paste and Clear.
for (const tools of document.querySelectorAll('.tools[data-for]')) {
  const t = document.getElementById(tools.dataset.for);
  const err = t.closest('section').querySelector('.err');
  const label = tools.closest('.panel-head').querySelector('label').textContent;
  const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${tools.dataset.ext}`; // e.g. one-line-json.json
  tools.append(iconButton('copy', 'Copy', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(t.value); flash(b, 'Copied'); } catch { flash(b, 'Copy failed'); }
  }));
  if (!t.readOnly) {
    tools.append(iconButton('paste', 'Paste', async () => {
      try { setText(t, await navigator.clipboard.readText()); }
      catch { err.textContent = 'The browser blocked clipboard access. Click the box and press Ctrl+V (⌘V on Mac).'; }
    }));
    tools.append(iconButton('clear', 'Clear', () => t.value && setText(t, '')));
  }
  tools.append(iconButton('download', 'Download', () => download(t.value, name)));
}

const JSON_TOOLS = { 'text-to-json': textToJson, 'json-to-text': jsonToText, 'minify': minify };

for (const [tab, fn] of Object.entries(JSON_TOOLS)) {
  const section = document.querySelector(`section[data-tab="${tab}"]`);
  const input = section.querySelector('.in');
  const output = section.querySelector('.out');
  const err = section.querySelector('.err');
  input.addEventListener('input', () => {
    try {
      output.value = fn(input.value);
      err.textContent = '';
    } catch (e) {
      output.value = '';
      err.textContent = e.message;
    }
  });
}

// Compare & merge, WinMerge style: both sides stay editable and copies rewrite them.
// All user text goes through textContent so markup in it is never parsed.
{
  const section = document.querySelector('section[data-tab="compare"]');
  const $ = sel => section.querySelector(sel);
  const left = $('#left'), right = $('#right'), diff = $('#diff'), err = $('.err');
  const prevBtn = $('#prev-diff'), nextBtn = $('#next-diff'), undoBtn = $('#undo'), count = $('#diff-count');
  const history = [];
  let current = -1;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const btn = (text, label, onClick) => {
    const b = el('button', null, text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', onClick);
    return b;
  };
  const changeEls = () => diff.querySelectorAll('.change');

  function copyChange(opts) {
    try {
      history.push({ left: left.value, right: right.value });
      const r = applyCopy(left.value, right.value, opts);
      left.value = r.left;
      right.value = r.right;
      compare(opts.block);
    } catch (e) {
      err.textContent = e.message;
    }
  }

  function row(cls, lnL, textL, lnR, textR, actions) {
    const r = el('div', 'row ' + cls);
    const cell = (ln, text, side) => {
      r.append(el('span', 'ln', ln ?? ''));
      r.append(text == null ? el('span', 'txt gap') : el('span', cls === 'changed' ? 'txt ' + side : 'txt', text));
    };
    cell(lnL, textL, 'del');
    r.append(actions ?? el('span', 'act'));
    cell(lnR, textR, 'add');
    return r;
  }

  function render(blocks) {
    diff.replaceChildren();
    const total = blocks.filter(b => b.type === 'change').length;
    let nl = 1, nr = 1, k = 0;
    for (const b of blocks) {
      if (b.type === 'same') {
        for (const line of b.lines) diff.append(row('same', nl++, line, nr++, line));
        continue;
      }
      const block = k++;
      const box = el('div', 'change');
      box.tabIndex = -1;
      const head = el('div', 'block-head');
      head.append(
        el('span', 'muted', `Difference ${block + 1} of ${total}`),
        btn('Block ⇒', `Copy difference ${block + 1} to right`, () => copyChange({ block, dir: 'right' })),
        btn('⇐ Block', `Copy difference ${block + 1} to left`, () => copyChange({ block, dir: 'left' })),
      );
      box.append(head);
      const rows = Math.max(b.left.length, b.right.length);
      for (let r = 0; r < rows; r++) {
        const act = el('span', 'act');
        act.append(
          btn('→', `Copy line to right (difference ${block + 1}, line ${r + 1})`, () => copyChange({ block, row: r, dir: 'right' })),
          btn('←', `Copy line to left (difference ${block + 1}, line ${r + 1})`, () => copyChange({ block, row: r, dir: 'left' })),
        );
        const hasL = r < b.left.length, hasR = r < b.right.length;
        box.append(row('changed', hasL ? nl++ : null, hasL ? b.left[r] : null, hasR ? nr++ : null, hasR ? b.right[r] : null, act));
      }
      diff.append(box);
    }
    count.textContent = total ? `${total} difference${total > 1 ? 's' : ''}` : 'No differences';
    prevBtn.disabled = nextBtn.disabled = !total;
    return total;
  }

  // Re-diff and keep the view on difference `focusIndex` (used after a copy).
  function compare(focusIndex) {
    try {
      err.textContent = '';
      const total = render(diffBlocks(left.value, right.value));
      undoBtn.disabled = !history.length;
      current = -1;
      if (focusIndex != null && total) go(Math.min(focusIndex, total - 1), false);
    } catch (e) {
      diff.replaceChildren();
      count.textContent = '';
      err.textContent = e.message;
    }
  }

  function go(i, scroll = true) {
    const els = changeEls();
    if (!els.length) return;
    current = (i + els.length) % els.length;
    els.forEach((e, j) => e.classList.toggle('current', j === current));
    if (scroll) els[current].scrollIntoView({ block: 'center', behavior: 'smooth' });
    els[current].querySelector('button').focus({ preventScroll: !scroll });
  }

  $('#compare-btn').addEventListener('click', () => compare());
  prevBtn.addEventListener('click', () => go(current - 1));
  nextBtn.addEventListener('click', () => go(current + 1));
  undoBtn.addEventListener('click', () => {
    const s = history.pop();
    if (!s) return;
    left.value = s.left;
    right.value = s.right;
    compare(Math.max(current, 0));
  });
  // Typing invalidates the diff; the textarea's own undo covers typed edits, so drop copy history.
  for (const t of [left, right]) t.addEventListener('input', () => {
    history.length = 0;
    undoBtn.disabled = true;
    diff.replaceChildren();
    count.textContent = '';
    prevBtn.disabled = nextBtn.disabled = true;
  });
  const swap = $('#swap');
  swap.replaceWith(Object.assign(iconButton('swap', 'Swap', () => {
    history.push({ left: left.value, right: right.value });
    [left.value, right.value] = [right.value, left.value];
    compare(Math.max(current, 0));
  }), { id: 'swap', title: 'Swap left and right' }));
}
