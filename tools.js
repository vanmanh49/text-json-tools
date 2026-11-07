import { diffLines } from 'diff';

// shortcut: JSON.parse loses precision above 2^53 and keeps only the last duplicate key; swap in a lossless parser if users hit it.

export function textToJson(s) {
  s = s.trim();
  if (!s) return '';
  let v;
  try {
    v = JSON.parse(s);
  } catch (err) {
    // escaped JSON pasted from a log without its outer quotes, e.g. {\"a\":1}
    if (!s.includes('\\"')) throw err;
    try { v = JSON.parse('"' + s + '"'); } catch { throw err; }
  }
  if (typeof v === 'string') v = JSON.parse(v);
  return JSON.stringify(v, null, 2);
}

export function jsonToText(s) {
  return s.trim() ? JSON.stringify(JSON.stringify(JSON.parse(s))) : '';
}

export function minify(s) {
  return s.trim() ? JSON.stringify(JSON.parse(s)) : '';
}

export function diffBlocks(left, right) {
  const blocks = [];
  for (const p of diffLines(left, right)) {
    if (!p.value) continue;
    if (!p.added && !p.removed) { blocks.push({ type: 'same', text: p.value }); continue; }
    let b = blocks.at(-1);
    if (b?.type !== 'change') blocks.push(b = { type: 'change', left: '', right: '' });
    b[p.removed ? 'left' : 'right'] += p.value;
  }
  return blocks;
}

export function merge(blocks, choices) {
  let i = 0;
  return blocks.map(b => b.type === 'same' ? b.text : b[choices[i++] ?? 'right']).join('');
}
