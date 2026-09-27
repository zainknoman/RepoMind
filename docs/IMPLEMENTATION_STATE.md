# Implementation State

Concise record of the staged evolution of RepoMind toward "Understand any codebase locally".
Update at the end of every phase.

## Current phase

**Phase 2 — Dashboard + first-run UX: complete** (branch `feature/product-consolidation`, from `main-v2` @ `dbab59d`;
Phases 1 and 2 are uncommitted in the same working tree).
Next: Phase 3a — indexer benchmark.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Fresh architecture/product audit | Done (in-session, 2026-09-27) |
| 1 | Navigation / information architecture, terminology | Done |
| 2 | Dashboard as investigation command centre; first-run workflow | Done |
| 3a | Benchmark the indexer (small/medium/large repos) | Next — must precede 3b |
| 3b | Incremental indexing + unified search (only if the benchmark justifies it) | Planned |
| 4 | Analyzer/plugin contract | Planned |
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

## Architectural decisions

- **No router introduced.** Tab ids remain App state keys; renames change labels only, so `?tool=`
  deep links and internal state are stable.
- **Temenos / OFS stays in Tools for now.** It is only kept in the product if Phase 6 connects it to
  code intelligence (routines → applications → Java extensions → services → impact). Revisit its
  navigation placement at Phase 6.
- **Codebase Search kept** alongside the top-level Search until Phase 3 unifies them.
- **References view deferred** to Phase 3; references are currently shown in the Symbol inspector.
- **Index state lives in App (hook), not a global store.** Only the Dashboard and Codebase need it;
  a context/store can come later if more consumers appear.
- **Codebase panel stays keyed per project**, so per-view state (search, analyzers, AI) still resets on
  a new folder; only the index, view and selected file are lifted.

## Known issues (carried forward)

- Reference resolution in `services/repository.js` is quadratic (per-symbol `filter` over all
  references/import bindings; `attachFileHandles` repeats it on cache restore). Likely the main
  large-repo bottleneck — measure in Phase 3a.
- Index cache is all-or-nothing and never evicts old entries (new key per change); the cache key reads
  every file's metadata sequentially.
- Dashboard profile statistics still read every file on the main thread on folder open (separate from
  the index); candidate to derive from the index or move to the worker after the Phase 3a benchmark.
- Folder open now also runs the cache-key check (one `getFile()` per text file) to restore the index.
- On phones the header actions overflow the top of the header (pre-existing layout issue).
- `External imports` counts unresolved relative imports too (pre-existing `externalDependencies` semantics).
- Saved context snapshots store full source in `localStorage` (privacy + quota; Phase 5 or earlier).
- Name-only reference fallback can over-report resolved references.
- Duplicated logic: route patterns (`intelligence.js` vs `analyzers.js`), hotspot calculations (4×),
  framework detection (3×), unused `TEXT_EXTENSIONS`/`IGNORE_DIRS` in `repository.js` (Phases 3–4).
- Temenos sources (`.b`, extensionless BASIC routines) are not treated as text, so they are not indexed
  (Phase 6).
- Branch protection on `main` (require CI) is a manual GitHub setting — unverified.

## Next recommended task

Phase 3a: benchmark the indexer (small / medium / large repository) for initial index time, memory,
worker responsiveness, cache restore time, search latency and dependency-graph time, before deciding
on incremental indexing. The quadratic reference resolution is the leading suspect.
