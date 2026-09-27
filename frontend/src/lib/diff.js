// Line diff via LCS on the region between the common prefix/suffix. Adjacent removed+added runs are
// paired into 'change' rows. Very large inputs fall back to a positional comparison to keep the UI responsive.
export const DIFF_CELL_LIMIT = 25_000_000;

export function lineDiff(A, B) {
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length,
    endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'same', li: i, ri: i });
  const n = endA - start,
    m = endB - start;
  if (n * m > DIFF_CELL_LIMIT) {
    for (let i = 0; i < Math.max(n, m); i++) {
      const li = i < n ? start + i : null,
        ri = i < m ? start + i : null;
      ops.push({
        type: li === null ? 'add' : ri === null ? 'del' : A[li] === B[ri] ? 'same' : 'change',
        li,
        ri,
      });
    }
  } else {
    const w = m + 1,
      lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i * w + j] =
          A[start + i] === B[start + j]
            ? lcs[(i + 1) * w + j + 1] + 1
            : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    let i = 0,
      j = 0,
      dels = [],
      adds = [];
    const flush = () => {
      const k = Math.min(dels.length, adds.length);
      for (let x = 0; x < k; x++) ops.push({ type: 'change', li: dels[x], ri: adds[x] });
      dels.slice(k).forEach((li) => ops.push({ type: 'del', li, ri: null }));
      adds.slice(k).forEach((ri) => ops.push({ type: 'add', li: null, ri }));
      dels = [];
      adds = [];
    };
    while (i < n || j < m) {
      if (i < n && j < m && A[start + i] === B[start + j]) {
        flush();
        ops.push({ type: 'same', li: start + i, ri: start + j });
        i++;
        j++;
      } else if (j < m && (i === n || lcs[i * w + j + 1] >= lcs[(i + 1) * w + j])) {
        adds.push(start + j);
        j++;
      } else {
        dels.push(start + i);
        i++;
      }
    }
    flush();
  }
  for (let k = 0; k < A.length - endA; k++) ops.push({ type: 'same', li: endA + k, ri: endB + k });
  return ops.map((o, k) => ({
    key: k,
    type: o.type,
    li: o.li === null ? null : o.li + 1,
    ri: o.ri === null ? null : o.ri + 1,
    l: o.li === null ? '' : A[o.li],
    r: o.ri === null ? '' : B[o.ri],
  }));
}
