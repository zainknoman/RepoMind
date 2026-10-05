// Names that are close to a query: written in another case, with a typo or a missing letter.
// Used where an exact name finds nothing (T24 names in AI questions, symbol search suggestions).

// A name counts as close only well above this similarity; a runner-up within the margin of the
// best means the query does not clearly name one of them.
export const CLOSE_NAME_MIN = 0.85;
export const CLOSE_NAME_MARGIN = 0.05;

/**
 * 1 − Levenshtein distance / longer length, or 0 as soon as the distance must exceed `maxEdits`.
 * Only the diagonal band of width `maxEdits` is computed, so a far-off name costs a few steps.
 */
function similarity(a, b, maxEdits) {
  const longer = Math.max(a.length, b.length);
  if (!longer) return 1;
  if (Math.abs(a.length - b.length) > maxEdits) return 0;
  const far = maxEdits + 1; // stands for "more than maxEdits" outside the band
  if (bandRows[0].length <= b.length)
    bandRows = [new Int32Array(b.length + 1), new Int32Array(b.length + 1)];
  let [prev, row] = bandRows;
  for (let j = 0; j <= b.length; j++) prev[j] = Math.min(j, far);
  for (let i = 1; i <= a.length; i++) {
    const from = Math.max(1, i - maxEdits),
      to = Math.min(b.length, i + maxEdits);
    row[0] = Math.min(i, far);
    if (from > 1) row[from - 1] = far;
    let rowMin = row[0];
    for (let j = from; j <= to; j++) {
      const cost = prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1);
      row[j] = Math.min(far, prev[j] + 1, row[j - 1] + 1, cost);
      if (row[j] < rowMin) rowMin = row[j];
    }
    if (to < b.length) row[to + 1] = far;
    if (rowMin > maxEdits) return 0;
    [prev, row] = [row, prev];
  }
  return prev[b.length] > maxEdits ? 0 : 1 - prev[b.length] / longer;
}
let bandRows = [new Int32Array(64), new Int32Array(64)];

/** Names grouped by length, for `closestNames`. Build it once per set of names. */
export function nameLengths(names) {
  const byLength = new Map();
  for (const name of names) {
    if (!byLength.has(name.length)) byLength.set(name.length, []);
    byLength.get(name.length).push(name);
  }
  return byLength;
}

/**
 * The names (from `nameLengths`) at least `floor` similar to `query`, closest first:
 * [{ name, score }]. Comparison is exact, so pass names and query in one case.
 */
export function closestNames(query, byLength, floor = CLOSE_NAME_MIN) {
  const found = [];
  // Names whose length alone keeps them under the floor are never measured.
  const minLength = Math.ceil(query.length * floor);
  const maxLength = Math.floor(query.length / floor);
  for (let length = minLength; length <= maxLength; length++)
    for (const name of byLength.get(length) || []) {
      const maxEdits = Math.floor(Math.max(length, query.length) * (1 - floor));
      const score = similarity(query, name, maxEdits);
      if (score >= floor) found.push({ name, score });
    }
  return found.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
}
