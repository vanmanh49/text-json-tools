import { textToJson, jsonToText, minify, diffBlocks, merge } from './tools.js';

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

// Compare & merge. All user text goes through textContent so markup in it is never parsed.
{
  const section = document.querySelector('section[data-tab="compare"]');
  const left = section.querySelector('#left');
  const right = section.querySelector('#right');
  const diff = section.querySelector('#diff');
  const merged = section.querySelector('#merged');
  const err = section.querySelector('.err');
  let blocks = [];
  let choices = [];

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function render() {
    diff.replaceChildren();
    let i = 0;
    for (const b of blocks) {
      if (b.type === 'same') { diff.append(el('pre', 'same', b.lines.join('\n'))); continue; }
      const idx = i++;
      const pick = choices[idx] ?? 'right';
      const row = el('div', 'change');
      const sides = el('div', 'sides');
      const show = lines => !lines.length ? '(nothing)' : lines.join('\n') || '(empty line)';
      sides.append(el('pre', 'del', show(b.left)), el('pre', 'add', show(b.right)));
      const btns = el('div', 'picks');
      for (const side of ['left', 'right']) {
        const btn = el('button', null, side === 'left' ? 'Use left' : 'Use right');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(pick === side));
        btn.addEventListener('click', () => { // update in place so keyboard focus stays on the button
          choices[idx] = side;
          for (const x of btns.children) x.setAttribute('aria-pressed', String(x === btn));
          merged.value = merge(blocks, choices);
        });
        btns.append(btn);
      }
      row.append(sides, btns);
      diff.append(row);
    }
    merged.value = merge(blocks, choices);
  }

  section.querySelector('#compare-btn').addEventListener('click', () => {
    try {
      blocks = diffBlocks(left.value, right.value);
      choices = [];
      err.textContent = '';
      if (!blocks.some(b => b.type === 'change')) {
        diff.replaceChildren(el('p', 'nodiff', 'No differences'));
        merged.value = left.value;
        return;
      }
      render();
    } catch (e) {
      diff.replaceChildren();
      merged.value = '';
      err.textContent = e.message;
    }
  });

  for (const t of [left, right]) t.addEventListener('input', () => {
    blocks = []; choices = [];
    diff.replaceChildren();
    merged.value = '';
  });

  section.querySelector('.copy').addEventListener('click', e => copy(merged.value, e.currentTarget));
}
