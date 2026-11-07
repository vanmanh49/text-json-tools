import { diffArrays } from 'diff';

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

// Diff whole lines (split on \n, rejoined with \n) so a missing final newline or CRLF never alters the merge.
export function diffBlocks(left, right) {
  const blocks = [];
  // jsdiff returns undefined when it gives up; without a cap, two large unrelated texts freeze the tab
  const parts = diffArrays(left.split('\n'), right.split('\n'), { timeout: 1000 });
  if (!parts) throw new Error('These texts are too different to compare quickly. Try smaller pieces.');
  for (const p of parts) {
    if (!p.value.length) continue;
    if (!p.added && !p.removed) { blocks.push({ type: 'same', lines: p.value }); continue; }
    let b = blocks.at(-1);
    if (b?.type !== 'change') blocks.push(b = { type: 'change', left: [], right: [] });
    b[p.removed ? 'left' : 'right'].push(...p.value);
  }
  return blocks;
}

// WinMerge-style copy. dir 'right' copies left → right. `block` is the change-block index;
// with `row`, only that line of the block: replace it, insert it into a gap, or (copying a gap) delete it.
export function applyCopy(left, right, { block, row, dir }) {
  const [src, tgt] = dir === 'right' ? ['left', 'right'] : ['right', 'left'];
  let i = 0;
  const text = diffBlocks(left, right).flatMap(b => {
    if (b.type === 'same') return b.lines;
    if (i++ !== block) return b[tgt];
    if (row == null) return b[src];
    const t = b[tgt].slice();
    if (row < b[src].length && row < t.length) t[row] = b[src][row];
    else if (row < b[src].length) t.push(b[src][row]);
    else t.splice(row, 1);
    return t;
  }).join('\n');
  return dir === 'right' ? { left, right: text } : { left: text, right };
}
