import { esc } from './text';

function pattern(find, caseSensitive) {
  return new RegExp(esc(find), caseSensitive ? 'g' : 'gi');
}

/** Start offsets of every literal occurrence of `find` in `text`. */
export function findMatches(text, find, caseSensitive = false) {
  if (!find) return [];
  const r = pattern(find, caseSensitive);
  const out = [];
  let m;
  while ((m = r.exec(text)) !== null) out.push(m.index);
  return out;
}

/** Replaces the occurrence starting at `offset` (as returned by findMatches). */
export function replaceAt(text, offset, find, replacement) {
  return text.slice(0, offset) + replacement + text.slice(offset + find.length);
}

/** Replaces every occurrence using the same matching rules as findMatches. */
export function replaceAll(text, find, replacement, caseSensitive = false) {
  if (!find) return text;
  return text.replace(pattern(find, caseSensitive), () => replacement);
}
