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

export async function copy(text, button) {
  const label = (button.dataset.label ??= button.textContent); // survives a second click within 1.5s
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => (button.textContent = label), 1500);
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
  section.querySelector('.copy').addEventListener('click', e => copy(output.value, e.currentTarget));
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
  for (const b of section.querySelectorAll('.copy')) {
    b.addEventListener('click', e => copy(b.dataset.side === 'left' ? left.value : right.value, e.currentTarget));
  }
}
