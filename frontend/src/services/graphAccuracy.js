/**
 * Scores an index's dependency edges and reference links against hand-written expectations, so
 * changes to resolution can be measured instead of judged by eye. Keys are plain strings:
 * edges `"from -> to"`, links `"from:line name -> path::name"` (one per resolved symbol).
 */

const ratio = (n, d) => (d ? n / d : 1);

function score(expected, actual) {
  const want = new Set(expected);
  const got = new Set(actual);
  const tp = [...got].filter((x) => want.has(x)).length;
  return {
    expected: want.size,
    actual: got.size,
    tp,
    precision: ratio(tp, got.size),
    recall: ratio(tp, want.size),
    missing: [...want].filter((x) => !got.has(x)).sort(),
    extra: [...got].filter((x) => !want.has(x)).sort(),
  };
}

export const edgeKeys = (index) =>
  (index?.dependencies || []).map((edge) => `${edge.from} -> ${edge.to}`);

export const linkKeys = (index) =>
  (index?.references || []).flatMap((ref) =>
    (ref.resolvedSymbols || []).map(
      (symbol) => `${ref.from}:${ref.line} ${ref.name} -> ${symbol.path}::${symbol.name}`,
    ),
  );

export function scoreGraph(index, expected) {
  return {
    edges: score(expected.edges || [], edgeKeys(index)),
    links: score(expected.links || [], linkKeys(index)),
  };
}
