import { textToJson, jsonToText, minify, diffBlocks, applyCopy, jsonLines, linesText, splitSame,
  normalizeJson, jsonStatus, decodeJwt, jwtTimeNotes, base64Encode, base64Decode, urlEncode, urlDecode } from './tools.js';
import { iconButton, refreshButtons, onRefresh, initPanels, el } from './panels.js';

const TABS = ['format', 'compare', 'text-to-json', 'json-to-text', 'minify', 'jwt', 'encode'];

function showTab() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : TABS[0];
  for (const s of document.querySelectorAll('section[data-tab]')) s.hidden = s.dataset.tab !== tab;
  // Workspace tools fill the screen and scroll inside their panels; Compare scrolls the page.
  document.body.classList.toggle('app', tab !== 'compare');
  for (const a of document.querySelectorAll('nav a')) {
    if (a.hash === '#' + tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  // Start in the tool's first input (Compare: Left) unless focus is already in the tool.
  const section = document.querySelector(`section[data-tab="${tab}"]`);
  if (!section.contains(document.activeElement)) section.querySelector('textarea:not([readonly])')?.focus({ preventScroll: true });
}
addEventListener('hashchange', showTab);

// Floating "back to top" button for long pages (all tools).
const toTop = document.getElementById('to-top');
addEventListener('scroll', () => { toTop.hidden = scrollY < 400; }, { passive: true });
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

const ENCODERS = { 'base64-encode': base64Encode, 'base64-decode': base64Decode, 'url-encode': urlEncode, 'url-decode': urlDecode };
const encMode = document.getElementById('enc-mode');
const decodeJwtText = s => {
  const d = decodeJwt(s);
  return d ? JSON.stringify({ header: d.header, payload: d.payload }, null, 2) : '';
};
const JSON_TOOLS = {
  'text-to-json': textToJson, 'json-to-text': jsonToText, 'minify': minify,
  'jwt': decodeJwtText,
  'encode': s => ENCODERS[encMode.value](s),
};

for (const [tab, fn] of Object.entries(JSON_TOOLS)) {
  const section = document.querySelector(`section[data-tab="${tab}"]`);
  const input = section.querySelector('.in');
  const output = section.querySelector('.out');
  const err = section.querySelector('.err');
  // JSON input panels show parse errors (with line and column) in their status bar instead.
  const statusShowsErrors = section.querySelector(`.tools[data-for="${input.id}"]`).dataset.ext === 'json';
  input.addEventListener('input', () => {
    try {
      output.value = fn(input.value);
      err.textContent = '';
    } catch (e) {
      output.value = '';
      err.textContent = statusShowsErrors ? '' : e.message;
    }
  });
}

// JWT: plain-English times for iat / nbf / exp under the decoded JSON.
{
  const input = document.getElementById('jwt-in'), list = document.getElementById('jwt-times');
  input.addEventListener('input', () => {
    let notes = [];
    try { notes = jwtTimeNotes(decodeJwt(input.value)?.payload); } catch { /* the error line already explains it */ }
    list.replaceChildren(...notes.map(n => Object.assign(document.createElement('li'), { textContent: n, className: /^Expired/.test(n) ? 'bad' : '' })));
    list.hidden = !notes.length;
  });
}
// Encode / Decode: re-run when the mode changes.
encMode.addEventListener('change', () => document.getElementById('enc-in').dispatchEvent(new Event('input', { bubbles: true })));

// Compare & merge, WinMerge style: both sides stay editable and copies rewrite them.
// All user text goes through textContent so markup in it is never parsed.
{
  const section = document.querySelector('section[data-tab="compare"]');
  const $ = sel => section.querySelector(sel);
  const left = $('#left'), right = $('#right'), diff = $('#diff'), err = $('.err');
  const prevBtn = $('#prev-diff'), nextBtn = $('#next-diff'), undoBtn = $('#undo'), count = $('#diff-count');
  const identical = $('#identical'), locbar = $('#locbar'), toolbar = $('.toolbar');
  const inputs = $('.inputs'), foldSummary = $('#fold-summary');
  const lineCount = t => (t.value ? t.value.split('\n').length : 0).toLocaleString();
  // After a compare with differences, the inputs fold into a slim bar so the diff gets the screen.
  function fold(on) {
    inputs.classList.toggle('folded', on);
    if (on) foldSummary.textContent = `Left · ${lineCount(left)} lines    Right · ${lineCount(right)} lines`;
  }
  $('#edit-texts').addEventListener('click', () => { fold(false); left.focus(); });
  const history = [];
  // Each snapshot keeps a full copy of the changed side; capped so long merges of big files can't exhaust memory.
  const MAX_UNDO = 100;
  const snapshot = () => {
    history.push({ left: left.value, right: right.value });
    if (history.length > MAX_UNDO) history.shift();
  };
  let current = -1;

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
      snapshot();
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
      fold(total > 0);
      undoBtn.disabled = !history.length;
      current = -1;
      if (focusIndex != null && total) go(Math.min(focusIndex, total - 1), false);
    } catch (e) {
      diff.replaceChildren();
      identical.hidden = true;
      count.textContent = '';
      err.textContent = e.message;
    }
    refreshButtons(); // the text may have changed without an input event, and the search re-runs on the new diff
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

  // Compare as JSON: rewrite both sides to one canonical layout first, so key order and
  // formatting don't show as differences. The originals go on the undo stack.
  const jsonMode = $('#json-mode');
  $('#compare-btn').addEventListener('click', () => {
    if (jsonMode.checked) {
      const out = {};
      for (const [name, t] of [['Left', left], ['Right', right]]) {
        try { out[name] = normalizeJson(t.value); }
        catch {
          const e = jsonStatus(t.value).error;
          err.textContent = `${name} side is not valid JSON${e?.line ? ` (line ${e.line}, column ${e.col})` : ''}. Fix it or untick "Compare as JSON".`;
          diff.replaceChildren(); identical.hidden = true; count.textContent = '';
          return;
        }
      }
      if (out.Left !== left.value || out.Right !== right.value) {
        snapshot();
        left.value = out.Left;
        right.value = out.Right;
      }
    }
    compare();
  });
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
    snapshot();
    [left.value, right.value] = [right.value, left.value];
    compare(Math.max(current, 0));
  }), { id: 'swap', title: 'Swap left and right' });
  swap.replaceWith(swapBtn);
  const compareBtn = $('#compare-btn');
  onRefresh(() => { compareBtn.disabled = swapBtn.disabled = !left.value && !right.value; });
}

// JSON Format: Postman-style pretty view with colours, line numbers, folding and search.
// The view is a <div>, so its formatted text is kept on `view.value` for the panel Copy/Download buttons.
{
  const section = document.querySelector('section[data-tab="format"]');
  const $ = sel => section.querySelector(sel);
  const input = $('#fmt-in'), view = $('#fmt-out'), err = $('.err');
  const indentSel = $('#fmt-indent'), sortBox = $('#fmt-sort');
  let lines = [], timer;
  view.value = '';


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
      // the input panel's status bar shows the parse error with its line and column
      refreshButtons();
      return;
    }
    const indent = indentSel.value === 'tab' ? '\t' : Number(indentSel.value);
    lines = jsonLines(v, indent, sortBox.checked);
    view.value = linesText(lines, indent);
    view.style.setProperty('--indent', (indent === '\t' ? 4 : indent) + 'ch');
    build();
    refreshButtons();
  }
  const expandBtn = $('#fmt-expand'), collapseBtn = $('#fmt-collapse');
  onRefresh(() => {
    const none = !lines.length;
    expandBtn.disabled = collapseBtn.disabled = none;
    // Collapse all keeps the root open, so it only helps when something is nested below it.
    if (!none) collapseBtn.disabled = !view.querySelector('.node .node');
  });

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 150); });
  indentSel.addEventListener('change', render);
  sortBox.addEventListener('change', render);
  $('#fmt-expand').addEventListener('click', () => view.querySelectorAll('.node').forEach(n => toggle(n, false)));
  // Keep the root open so the top-level keys stay visible, as Postman does.
  $('#fmt-collapse').addEventListener('click', () => view.querySelectorAll('.node .node').forEach(n => toggle(n, true)));
}

// One sample per editable panel for the empty state's "Try a sample".
// Sample token: valid for an hour from page load; the signature is a placeholder.
const b64url = s => base64Encode(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nowSec = Math.floor(Date.now() / 1000);
const SAMPLE_JWT = [
  b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  b64url(JSON.stringify({ sub: '1234567890', name: 'Ann Nguyễn', role: 'admin', iat: nowSec - 300, exp: nowSec + 3600 })),
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
].join('.');
const PERSON = { name: 'Ann Nguyen', age: 31, active: true, email: 'ann@example.com', tags: ['dev', 'ops'], address: { city: 'Hanoi', geo: { lat: 21.03, lng: 105.85 } }, manager: null };
const CONFIG_A = 'server:\n  host: example.com\n  port: 8080\n  timeout: 30\nlogging:\n  level: info\n  file: app.log\nfeatures:\n  - search\n  - export\n';
const CONFIG_B = 'server:\n  host: example.com\n  port: 9090\n  timeout: 30\n  retries: 3\nlogging:\n  level: debug\n  file: app.log\nfeatures:\n  - search\n  - export\n  - share\n';
initPanels({
  samples: {
    'fmt-in': JSON.stringify(PERSON),
    't2j-in': JSON.stringify(JSON.stringify(PERSON)),
    'j2t-in': JSON.stringify(PERSON, null, 2),
    'min-in': JSON.stringify(PERSON, null, 2),
    'jwt-in': SAMPLE_JWT,
    'enc-in': 'Xin chào, thế giới! name=Ann Nguyen&tags=dev,ops',
    left: { left: CONFIG_A, right: CONFIG_B },
    right: { left: CONFIG_A, right: CONFIG_B },
  },
});
showTab(); // after initPanels: it moves each textarea into an .editor, which would drop the focus
