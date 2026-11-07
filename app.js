import { textToJson, jsonToText, minify, diffBlocks, applyCopy, jsonLines, linesText, splitSame } from './tools.js';

const TABS = ['format', 'compare', 'text-to-json', 'json-to-text', 'minify'];

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

// Floating "back to top" button for long pages (all tools).
const toTop = document.getElementById('to-top');
addEventListener('scroll', () => { toTop.hidden = scrollY < 400; }, { passive: true });
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

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
export function refreshButtons() { for (const check of buttonChecks) check(); }
document.addEventListener('input', refreshButtons);

// Every panel: Copy and Download; editable panels also get Paste and Clear.
for (const tools of document.querySelectorAll('.tools[data-for]')) {
  const t = document.getElementById(tools.dataset.for);
  const err = t.closest('section').querySelector('.err');
  const label = tools.closest('.panel-head').firstElementChild.textContent;
  const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${tools.dataset.ext}`; // e.g. one-line-json.json
  tools.append(iconButton('copy', 'Copy', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(t.value); flash(b, 'Copied'); } catch { flash(b, 'Copy failed'); }
  }));
  if (t.tagName === 'TEXTAREA' && !t.readOnly) {
    tools.append(iconButton('paste', 'Paste', async () => {
      try { setText(t, await navigator.clipboard.readText()); }
      catch { err.textContent = 'The browser blocked clipboard access. Click the box and press Ctrl+V (⌘V on Mac).'; }
    }));
    tools.append(iconButton('clear', 'Clear', () => t.value && setText(t, '')));
  }
  tools.append(iconButton('download', 'Download', () => download(t.value, name)));
  // Paste is the one button that is useful on an empty panel.
  const needText = [...tools.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') !== 'Paste');
  buttonChecks.push(() => { for (const b of needText) b.disabled = !t.value; });
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
  const identical = $('#identical'), locbar = $('#locbar'), toolbar = $('.toolbar');
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
      refreshButtons();
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
    prevBtn.disabled = nextBtn.disabled = !total;
    // Identical sides: an inline notice instead of a grid with nothing to merge.
    identical.hidden = total > 0;
    if (!total) {
      identical.textContent = left.value || right.value ? '✓ The left and right texts are identical.' : 'Both sides are empty. Paste or type text to compare.';
      count.textContent = '';
      return 0;
    }
    let nl = 1, nr = 1, k = 0;
    blocks.forEach((b, bi) => {
      if (b.type === 'same') {
        // Long unchanged runs collapse to 3 lines of context, with a row that expands them.
        const { head, hidden, tail } = splitSame(b.lines, { first: bi === 0, last: bi === blocks.length - 1 });
        for (const line of head) diff.append(row('same', nl++, line, nr++, line));
        if (hidden.length) {
          const box = el('div', 'hidden-lines');
          box.hidden = true;
          for (const line of hidden) box.append(row('same', nl++, line, nr++, line));
          const more = btn(`⋯ ${hidden.length} unchanged lines`, `Show ${hidden.length} unchanged lines`, () => {
            box.hidden = false;
            more.remove();
            updateLocbar();
          });
          more.className = 'expand';
          diff.append(more, box);
        }
        for (const line of tail) diff.append(row('same', nl++, line, nr++, line));
        return;
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
    });
    count.textContent = `${total} difference${total > 1 ? 's' : ''}`;
    updateLocbar();
    return total;
  }

  // Location bar (like WinMerge's location pane): one tick per difference, scaled to the diff's
  // height, plus a box showing which part of the diff is on screen. Click a tick to jump there.
  function updateLocbar() {
    locbar.replaceChildren();
    const H = diff.offsetHeight;
    if (!H) return;
    const top = toolbar.offsetHeight;
    locbar.style.top = top + 'px';
    locbar.style.height = Math.min(innerHeight - top - 16, H) + 'px'; // never taller than the diff itself
    changeEls().forEach((c, i) => {
      const t = el('span', 'tick' + (i === current ? ' current' : ''));
      t.style.top = (c.offsetTop / H) * 100 + '%';
      t.style.height = Math.max((c.offsetHeight / H) * 100, 0.8) + '%';
      t.addEventListener('click', e => { e.stopPropagation(); go(i); });
      locbar.append(t);
    });
    locbar.append(el('span', 'view'));
    updateView();
  }
  function updateView() {
    const v = locbar.querySelector('.view');
    if (!v) return;
    const r = diff.getBoundingClientRect();
    const top = Math.max(0, -r.top + toolbar.offsetHeight), bottom = Math.min(r.height, innerHeight - r.top);
    v.style.top = (top / r.height) * 100 + '%';
    v.style.height = Math.max(0, (bottom - top) / r.height) * 100 + '%';
  }
  locbar.addEventListener('click', e => {
    const r = locbar.getBoundingClientRect(), d = diff.getBoundingClientRect();
    scrollTo({ top: scrollY + d.top + ((e.clientY - r.top) / r.height) * d.height - innerHeight / 2, behavior: 'smooth' });
  });
  addEventListener('scroll', updateView, { passive: true });
  addEventListener('resize', () => updateLocbar());
  new ResizeObserver(() => updateLocbar()).observe(diff);

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
      identical.hidden = true;
      count.textContent = '';
      err.textContent = e.message;
    }
  }

  function go(i, scroll = true) {
    const els = changeEls();
    if (!els.length) return;
    current = (i + els.length) % els.length;
    els.forEach((e, j) => e.classList.toggle('current', j === current));
    locbar.querySelectorAll('.tick').forEach((t, j) => t.classList.toggle('current', j === current));
    count.textContent = `${current + 1} of ${els.length}`;
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
    refreshButtons();
  });
  // Typing invalidates the diff; the textarea's own undo covers typed edits, so drop copy history.
  for (const t of [left, right]) t.addEventListener('input', () => {
    history.length = 0;
    undoBtn.disabled = true;
    diff.replaceChildren();
    identical.hidden = true;
    count.textContent = '';
    prevBtn.disabled = nextBtn.disabled = true;
  });
  // WinMerge-style shortcuts, ignored while typing in a box (Option+arrows move by word there on macOS).
  document.addEventListener('keydown', e => {
    if (section.hidden || document.activeElement?.closest('textarea, input, select')) return;
    const n = changeEls().length;
    if (e.altKey && !e.ctrlKey && !e.metaKey && n) {
      const act = {
        ArrowDown: () => go(current + 1),
        ArrowUp: () => go(current - 1),
        ArrowRight: () => copyChange({ block: Math.max(current, 0), dir: 'right' }),
        ArrowLeft: () => copyChange({ block: Math.max(current, 0), dir: 'left' }),
      }[e.key];
      if (act) { e.preventDefault(); act(); }
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && history.length) {
      e.preventDefault();
      undoBtn.click();
    }
  });
  const swap = $('#swap');
  const swapBtn = Object.assign(iconButton('swap', 'Swap', () => {
    history.push({ left: left.value, right: right.value });
    [left.value, right.value] = [right.value, left.value];
    compare(Math.max(current, 0));
    refreshButtons();
  }), { id: 'swap', title: 'Swap left and right' });
  swap.replaceWith(swapBtn);
  const compareBtn = $('#compare-btn');
  buttonChecks.push(() => { compareBtn.disabled = swapBtn.disabled = !left.value && !right.value; });
}

// JSON Format: Postman-style pretty view with colours, line numbers, folding and search.
// The view is a <div>, so its formatted text is kept on `view.value` for the panel Copy/Download buttons.
{
  const section = document.querySelector('section[data-tab="format"]');
  const $ = sel => section.querySelector(sel);
  const input = $('#fmt-in'), view = $('#fmt-out'), err = $('.err');
  const indentSel = $('#fmt-indent'), sortBox = $('#fmt-sort'), search = $('#fmt-search'), countEl = $('#fmt-count');
  let lines = [], marks = [], markAt = -1, timer;
  view.value = '';

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function toggle(node, collapse = !node.classList.contains('collapsed')) {
    node.classList.toggle('collapsed', collapse);
    const b = node.firstElementChild.querySelector('.fold');
    b.textContent = collapse ? '▸' : '▾';
    b.setAttribute('aria-expanded', String(!collapse));
  }

  function code(row, parts) {
    const c = el('span', 'code');
    for (const [cls, text] of parts) c.append(el('span', cls, text));
    row.append(c);
    return c;
  }

  // shortcut: renders every line into the DOM; fine to tens of thousands of lines, virtualize if users paste far bigger payloads.
  function build(collapsed = new Set()) {
    const root = document.createDocumentFragment();
    const stack = [];
    let cur = root;
    lines.forEach((l, i) => {
      const row = el('div', 'line');
      row.style.setProperty('--d', l.depth);
      row.append(el('span', 'ln', i + 1));
      if (stack.length && i === stack.at(-1).end) {
        const s = stack.pop();
        row.append(el('span', 'fold-pad'));
        code(row, l.parts);
        s.node.append(row);
        cur = s.parent;
        return;
      }
      if (l.end == null) {
        row.append(el('span', 'fold-pad'));
        code(row, l.parts);
        cur.append(row);
        return;
      }
      const node = el('div', 'node'), kids = el('div', 'kids');
      node.dataset.i = i;
      const fold = el('button', 'fold', '▾');
      fold.type = 'button';
      fold.setAttribute('aria-expanded', 'true');
      fold.setAttribute('aria-label', `Fold line ${i + 1}`);
      fold.addEventListener('click', () => toggle(node));
      row.append(fold);
      const noun = l.kind === '{' ? (l.count === 1 ? 'key' : 'keys') : (l.count === 1 ? 'item' : 'items');
      const sum = el('span', 'summary');
      sum.append(el('span', 'punc', '…' + lines[l.end].parts.map(p => p[1]).join('')), el('span', 'hint', ` ${l.count} ${noun}`));
      code(row, l.parts).append(sum);
      node.append(row, kids);
      cur.append(node);
      stack.push({ node, parent: cur, end: l.end });
      cur = kids;
      if (collapsed.has(i)) toggle(node, true);
    });
    view.replaceChildren(root);
  }

  function render() {
    err.textContent = '';
    const s = input.value.trim();
    let v;
    try {
      if (!s) throw null;
      v = JSON.parse(s);
    } catch (e) {
      lines = [];
      view.value = '';
      view.replaceChildren();
      countEl.textContent = '';
      if (e) err.textContent = e.message;
      refreshButtons();
      return;
    }
    const indent = indentSel.value === 'tab' ? '\t' : Number(indentSel.value);
    lines = jsonLines(v, indent, sortBox.checked);
    view.value = linesText(lines, indent);
    view.style.setProperty('--indent', (indent === '\t' ? 4 : indent) + 'ch');
    build();
    highlight();
    refreshButtons();
  }
  const expandBtn = $('#fmt-expand'), collapseBtn = $('#fmt-collapse');
  buttonChecks.push(() => {
    const none = !lines.length;
    expandBtn.disabled = collapseBtn.disabled = search.disabled = none;
    // Collapse all keeps the root open, so it only helps when something is nested below it.
    if (!none) collapseBtn.disabled = !view.querySelector('.node .node');
  });

  // Rebuilds (keeping folds), wraps matches in <mark>, and unfolds the nodes that contain them.
  // shortcut: matches within one token only (a key, a value, punctuation), not across tokens.
  function highlight() {
    const q = search.value.trim().toLowerCase();
    if (marks[0]?.isConnected) build(new Set([...view.querySelectorAll('.node.collapsed')].map(n => +n.dataset.i)));
    marks = [];
    markAt = -1;
    if (!q || !lines.length) { countEl.textContent = ''; return; }
    for (const span of view.querySelectorAll('.code > span:not(.summary)')) {
      const text = span.textContent, lower = text.toLowerCase();
      let at = lower.indexOf(q);
      if (at < 0) continue;
      span.textContent = '';
      let pos = 0;
      for (; at >= 0; at = lower.indexOf(q, pos)) {
        span.append(text.slice(pos, at));
        const m = el('mark', null, text.slice(at, at + q.length));
        span.append(m);
        marks.push(m);
        pos = at + q.length;
      }
      span.append(text.slice(pos));
      for (let k = span.closest('.kids'); k; k = k.parentElement.closest('.kids')) toggle(k.parentElement, false);
    }
    countEl.textContent = marks.length ? `${marks.length} match${marks.length > 1 ? 'es' : ''}` : 'No matches';
  }

  function nextMark(step) {
    if (!marks.length) return;
    marks[markAt]?.classList.remove('current');
    markAt = (markAt + step + marks.length) % marks.length;
    marks[markAt].classList.add('current');
    marks[markAt].scrollIntoView({ block: 'center' });
    countEl.textContent = `${markAt + 1} of ${marks.length}`;
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 150); });
  indentSel.addEventListener('change', render);
  sortBox.addEventListener('change', render);
  search.addEventListener('input', highlight);
  search.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nextMark(e.shiftKey ? -1 : 1); } });
  $('#fmt-expand').addEventListener('click', () => view.querySelectorAll('.node').forEach(n => toggle(n, false)));
  // Keep the root open so the top-level keys stay visible, as Postman does.
  $('#fmt-collapse').addEventListener('click', () => view.querySelectorAll('.node .node').forEach(n => toggle(n, true)));
}

refreshButtons();
