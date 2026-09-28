# Implementation State

Concise record of the staged evolution of RepoMind toward "Understand any codebase locally".
Update at the end of every phase.

## Current phase

**Phase 3 (3a benchmark + 3b indexer, incremental indexing, unified search): complete on
`feature/product-consolidation`, not yet merged.** Phases 1–2 and the post-Phase 2 fixes are on `main`.
Next: Phase 4 — analyzer/plugin contract (or the remaining indexer bottlenecks below, if large
repositories are a priority).

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Fresh architecture/product audit | Done (in-session, 2026-09-27) |
| 1 | Navigation / information architecture, terminology | Done |
| 2 | Dashboard as investigation command centre; first-run workflow | Done |
| 3a | Benchmark the indexer (small/medium/large repos) | Done — `docs/INDEXER_BENCHMARK.md` |
| 3b | Incremental indexing + unified search (only if the benchmark justifies it) | Done |
| 4 | Analyzer/plugin contract | Next |
| 5 | AI grounding and repository context | Planned |
| 6 | Temenos code intelligence | Planned |

## Completed work (Phase 1)

- Navigation groups defined once in `frontend/src/navigation.js`: Understand · Explore · Analyze · Tools.
  Codebase is emphasised; Tools is visually secondary and right-aligned.
- Tools = Developer Tools, Temenos / OFS, Markdown. Engineering is deliberately not in the header
  (owner decision); it opens only from `?tool=eng` and is not listed in Help.
- Project Analysis → Quick Analysis, with a link to Codebase Intelligence. Code unchanged.
- Codebase views: Overview, Search, Symbols, Dependencies, Impact, Health, Analyzers, Git, Diagram,
  Reports, Context Builder, AI. API discovery and security scan render inside Analyzers.
- Headings match nav labels; Help groups are derived from `NAV_GROUPS`.
- README, CHANGELOG and E2E tests updated.

## Completed work (Phase 2)

- Index lifecycle moved from `CodebasePanel` into `features/codebase/useCodebaseIndex.js`, owned by
  App: cache restore on folder open, build/cancel/clear, derived cycles and health. Dashboard and
  Codebase share one index.
- Codebase view and selected file lifted into App so other workspaces can open e.g. Impact for a file.
- Dashboard: first-run screen with the workflow and **Open Repository Folder**; an **Investigate**
  panel (index status/build, health signals, hotspots, unresolved imports, cycles, next steps) above
  the existing repository profile, which is unchanged.
- Codebase security card/metric show "not scanned" until the scan runs.
- Perf guards now that the cache check and health run on every folder open: `projectKey` no longer
  does a per-path `find` (key format unchanged); `health.js` uses per-file symbol counts.

## Tests / build status (end of Phase 2)

- `npm run check` (Prettier, ESLint, 52 unit tests, production build): passing.
- Playwright E2E against the production build: 53/53 passing.

## Post-Phase 2 fixes

- Stale-deploy chunk failures (e.g. Mermaid after a redeploy) show a "RepoMind was updated — reload"
  message; `lib/staleBuild.js` detects the Chrome/Firefox/Safari wording, used by `diagram.js` and
  `ErrorBoundary`.
- `.analytics-panel` text areas (Reports, Diagram, AI) are full width.
- Tests: 53 unit, 55 E2E.

## Completed work (Phase 3a — benchmark)

- `npm run bench:index` (`frontend/scripts/bench-index.mjs`): runs the real indexer, cache and search
  code in Node (via Vite's `runnerImport`) on deterministic synthetic repositories (150 / 1,500 / 6,000
  files) or a real folder (`-- --dir`). Reports per-phase build time, main-thread costs (worker → main
  clone, attaching handles, cache save/restore), heap, snapshot size, cycles/health, search and an
  incremental rebuild. Results and findings: `docs/INDEXER_BENCHMARK.md`.
- Baseline: 20 files took 47 s (46 s in back-link finalization); RepoMind's own `src` 22 s; 150 files
  did not finish in 10 minutes. It also crashed on any `constructor` symbol (`symbolMap` was a plain
  object).

## Completed work (Phase 3b)

- `repository.js`: map-based resolve, one-pass back-links, shared read-only candidate arrays, a
  mutable ancestor stack in the AST walk, binary-search line numbers, no duplicate pattern scan for
  JS/TS, progress every 25 files, `symbolMap` removed. Output verified identical to the baseline on
  RepoMind `src` and ESLint `lib/linter` before the scope change below.
- **Scope-aware resolution** (intended behaviour change): symbols declared in a function record its
  source range (`scopeStart`/`scopeEnd`), references record `offset`; a reference sees only the
  innermost enclosing declarations; imports, namespace imports and cross-file name matches use
  top-level symbols only. Removes ~78% of links on RepoMind's source.
- **Incremental indexing**: `readProjectFiles(project, { previous })` skips reading files whose size
  and `lastModified` match the previous analysis (`files[].size/modified`); the record carries that
  analysis to the worker and `buildRepositoryIndex` reuses it. Linking always reruns.
  `useCodebaseIndex.build` passes the index on screen, or else `loadLatestCachedIndex`.
  `stats.reusedFiles` drives "✓ Updated index (N changed, M unchanged)".
- **Cache v3** (`indexCache.js`, DB version 2): symbol back-links as positions, shared key arrays,
  metadata read in parallel batches; a `latest` store (repository name → key) enables reuse and deletes
  the superseded snapshot; the DB upgrade drops old v2 snapshots.
- **Unified search** (`services/search.js`): `searchProject` returns symbols (index), files and text
  matches (regex / match case, 2,000-match cap). The Search workspace uses it; the Codebase Search view
  and `searchCode`/`searchIndex` are removed; `investigate('search')` opens the Search tab.
  The match viewer highlights with the same pattern (regex-safe).
- Fixed the index-source line running label and date together.

## Tests / build status (end of Phase 3)

- `npm run check` (Prettier, ESLint, 63 unit tests, production build): passing.
- Playwright E2E against the production build: 57/57 passing.

## Architectural decisions

- **No router introduced.** Tab ids remain App state keys; renames change labels only, so `?tool=`
  deep links and internal state are stable.
- **Temenos / OFS stays in Tools for now.** It is only kept in the product if Phase 6 connects it to
  code intelligence (routines → applications → Java extensions → services → impact). Revisit its
  navigation placement at Phase 6.
- **One Search workspace** (Explore → Search) for symbols, files and text; Codebase has no search view.
  Search stays usable without an index (files + text) and adds symbols when one exists.
- **References view deferred** again (Phase 4/5); references are shown in the Symbol inspector.
- **Benchmark in Node, not the browser**: deterministic and CI-friendly; browser-only costs are
  approximated with `structuredClone` / V8 serialization. Real-browser profiling is a follow-up if the
  numbers and user reports diverge.
- **Incremental reuse is keyed on size + modification time per path**, the same signal as the cache key.
  The "latest snapshot" pointer is per repository *name*, so two different folders with the same name
  share it: the second evicts the first's snapshot, and reuse still requires matching path, size and
  time.
- **Scopes are function-level**, not block-level; parameters are not symbols.
- **Index state lives in App (hook), not a global store.** Only the Dashboard and Codebase need it;
  a context/store can come later if more consumers appear.
- **Codebase panel stays keyed per project**, so per-view state (search, analyzers, AI) still resets on
  a new folder; only the index, view and selected file are lifted.

## Known issues (carried forward)

- Large repositories (~1 M dense lines) still block the main thread for ~10–19 s when a build finishes,
  when saving the cache and when restoring it (index size). Next steps, in order: save the cache from
  the worker; store references once instead of raw + linked; block scopes/parameters. Real code at
  ~100k lines stays under 0.3 s per step. See `docs/INDEXER_BENCHMARK.md`.
- Dashboard profile statistics still read every file on the main thread on folder open (separate from
  the index); candidate to derive from the index or move to the worker.
- Folder open now also runs the cache-key check (one `getFile()` per text file) to restore the index.
- On phones the header actions overflow the top of the header (pre-existing layout issue).
- `External imports` counts unresolved relative imports too (pre-existing `externalDependencies` semantics).
- Saved context snapshots store full source in `localStorage` (privacy + quota; Phase 5 or earlier).
- A reference to a parameter can still match a top-level declaration of the same name in another file
  (parameters are not symbols).
- Duplicated logic: route patterns (`intelligence.js` vs `analyzers.js`), hotspot calculations (4×),
  framework detection (3×), unused `TEXT_EXTENSIONS`/`IGNORE_DIRS` in `repository.js` (Phase 4).
- Temenos sources (`.b`, extensionless BASIC routines) are not treated as text, so they are not indexed
  (Phase 6).
- Branch protection on `main` (require CI) is a manual GitHub setting — unverified.

## Next recommended task

Phase 4: the analyzer/plugin contract. If large repositories matter sooner, first move the cache save
into the index worker (removes a ~2.7 s / ~13 s main-thread freeze at medium / large).
