# Indexer Benchmark (Phase 3a / 3b)

Measured 2026-09-28 on Windows 11, Node 24.18, with `npm run bench:index` (`frontend/scripts/bench-index.mjs`).

## Method

The script runs the real indexing, cache and search code in Node:

- **Synthetic repositories** are deterministic: `small` 150 files, `medium` 1,500, `large` 6,000, each
  about 85% JS/TS/JSX/TSX modules (~160 lines, 2–6 relative imports, exported functions, a class, locals)
  and 15% JSON/Markdown/CSS. A few imports point forward, so the graph has cycles.
- **Real folders** use the app's extension and ignore rules: `npm run bench:index -- --dir <folder>`.
- Browser-only costs are approximated. Worker → main `postMessage` and IndexedDB storage are both
  structured clones, so they are measured with `structuredClone`; the snapshot size is V8's serialized
  size. File reads come from memory, so disk I/O is excluded.
- "(main)" marks work that blocks the main thread in the browser. Index build runs in the Web Worker.
- The incremental rebuild edits 1% of files (at least one), then reads, posts to the worker and rebuilds.

Numbers vary by machine; compare rows, not absolute values.

## Before (baseline, `5856ec1`)

The baseline indexer was quadratic, so only tiny inputs finish. (It also crashed on any class with a
`constructor`; that one-line fix was applied first so the baseline could be measured.)

| Repository | Files | Lines | Index build | · finalize back-links | Attach handles (main) | Cache snapshot |
|---|---:|---:|---:|---:|---:|---:|
| Synthetic | 20 | 3,012 | 46.7 s | 45.9 s | 14.5 s | 42 MB |
| RepoMind `frontend/src` | 52 | 10,023 | 21.9 s | 20.8 s | 2.4 s | 9 MB |
| Synthetic `small` | 150 | 24,110 | did not finish in 10 min | | | |

Findings:

1. **Finalize** filtered all references for every symbol (symbols × references × resolved symbols,
   building key strings in the innermost loop). This was nearly all of the build time.
2. **Resolve** filtered the whole symbol list per reference and per import binding.
3. **Attach handles** (main thread, on every build and cache restore) searched all references for every
   back-link.
4. **Snapshot size**: every symbol stored full copies of its references, twice (`symbols` and the unused
   `symbolMap`).
5. **Fan-out**: a reference linked to every same-name declaration in its file (a local `value` in one
   function linked to the `value` locals of every other function), and names not found in the file
   linked to every same-name declaration in the repository, locals included.
6. The pattern scanner recomputed line numbers by splitting the file prefix per match, and ran twice
   for JS/TS files. The AST walk copied its ancestor list at every node.
7. One progress message per file (thousands of main-thread React updates).
8. **Crash**: a symbol named like an `Object.prototype` member (`constructor`, `toString`) broke indexing.

## After fixing the algorithms only (intermediate)

Linear algorithms, same resolution results as the baseline (verified identical output on RepoMind's
`src` and ESLint's `lib/linter`):

| Metric | small | medium | large |
|---|---:|---:|---:|
| Reference → symbol links | 386,000 | 3,837,590 | 15,630,864 |
| Index build (worker) | 2.6 s | 25.4 s | 107.7 s |
| Worker → main clone + attach (main) | 1.7 s | 9.0 s | 38.4 s |
| Cache save (main) | 1.3 s | 10.5 s | 49.0 s |
| Cache restore (main) | 2.2 s | 21.5 s | 88.6 s |
| Cache snapshot | 27 MB | 276 MB | 1,149 MB |
| Retained heap | 34 MB | 330 MB | 1,330 MB |
| Incremental rebuild (1% changed) | 2.1 s | 18.5 s | 69.4 s |

The fan-out (finding 5) now dominated: ~6.8 links per reference, most of them wrong. At `large` the
process used ~4.9 GB, beyond what a browser tab can hold.

## After Phase 3b (final)

References resolve only to declarations whose function scope contains them (innermost wins), and
cross-file name matches and imports consider only top-level declarations.

| Metric | small | medium | large |
|---|---:|---:|---:|
| Files | 150 | 1,500 | 6,000 |
| Lines | 24,110 | 240,647 | 968,673 |
| Symbols | 4,912 | 48,974 | 197,043 |
| References | 56,965 | 570,011 | 2,300,812 |
| Reference → symbol links | 49,602 | 496,212 | 2,004,230 |
| Index build (worker) | 479 ms | 3.7 s | 14.9 s |
| · analyze/parse | 376 ms | 3.0 s | 11.7 s |
| · resolve bindings + references | 91 ms | 685 ms | 3.1 s |
| · finalize symbol back-links | 10 ms | 65 ms | 210 ms |
| Progress messages | 9 | 63 | 243 |
| Worker → main clone (main) | 200 ms | 2.3 s | 9.6 s |
| Attach handles (main) | 35 ms | 577 ms | 2.9 s |
| Retained heap | 35 MB | 293 MB | 1,178 MB |
| Cycle detection | 0.7 ms | 3.2 ms | 23 ms |
| Health | 0.8 ms | 7.9 ms | 23 ms |
| Cache save: serialize + clone (main) | 217 ms | 2.7 s | 12.9 s |
| Cache key check | 52 ms | 43 ms | 728 ms |
| Cache restore: clone + attach (main) | 331 ms | 3.7 s | 18.9 s |
| Cache snapshot | 12 MB | 122 MB | 503 MB |
| Search: symbols + files + text | 4.6 ms | 16 ms | 17 ms |
| Incremental rebuild (2 / 15 / 60 files changed) | 267 ms | 2.1 s | 7.8 s |

Real codebases (final):

| Metric | RepoMind `frontend/src` | ESLint `lib/` |
|---|---:|---:|
| Files / lines | 52 / 10,023 | 398 / 108,981 |
| Reference → symbol links | 2,673 (baseline 11,896) | 25,852 |
| Index build (worker) | 174 ms (baseline 21.9 s) | 632 ms |
| Worker → main clone + attach (main) | 25 ms | 191 ms |
| Cache save (main) | 35 ms | 183 ms |
| Cache restore (main) | 26 ms | 287 ms |
| Cache snapshot | 1.4 MB (baseline 9 MB) | 11 MB |
| Incremental rebuild | 43 ms | 173 ms |

ESLint's `lib/` is CommonJS, so it has no internal import edges; its references still resolve within files.
The synthetic modules are denser in references per line than real code, so they are a worst case.

## Decisions taken from the benchmark (Phase 3b)

- **Linear linking** (map lookups, one pass for back-links, shared read-only candidate arrays): done.
- **Scope-aware resolution** (function scopes; top-level only across files): done. It is a deliberate
  behaviour change that removes false references (78% of links on RepoMind's own source).
- **Incremental indexing** is justified: parsing is now ~80% of the build and grows with the repository,
  while a typical rebuild changes a few files. Unchanged files (same size and modification time) reuse
  their analysis; only linking is repeated. Medium: 3.7 s full build → 2.1 s after a 1% change; large:
  14.9 s → 7.8 s, the rest being linking, which always runs over the whole repository.
- **Cache format v3**: back-links stored as positions, shared resolved-symbol lists stored once; only the
  latest snapshot per repository is kept, and it feeds incremental reuse.
- **Unified search**: one search service. Full-text search reads files on demand; it stops at 2,000
  matches, which bounds its latency (16–17 ms at medium/large for a query with many hits).

## Remaining bottlenecks (next candidates)

At `large` (~1 M lines of dense synthetic code) the main thread still blocks for ~12.5 s when the build
finishes (clone + attach), ~12.9 s while saving the cache and ~18.9 s when restoring it. Real code at
~100k lines stays under 0.3 s per step. In order of expected value:

1. **Save the cache from the worker.** It already holds the index; the main thread would no longer
   serialize and clone it. Requires the worker to also detect project packages (read from
   `package.json`), which today happens on the main thread before saving.
2. **Store references once.** Each file's raw references (kept for incremental relinking) and the linked
   `references` duplicate ~2.3 M objects at `large`; deriving one from the other would cut the clone,
   snapshot and heap by roughly a third.
3. **Block scopes and parameters.** `let`/`const` are treated as function-scoped, and parameters are
   not symbols, so a parameter can still match a top-level declaration of the same name in another
   file.
4. The Dashboard profile still reads every file on folder open, separately from the index.
