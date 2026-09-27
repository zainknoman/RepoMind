# Implementation State

Concise record of the staged evolution of RepoMind toward "Understand any codebase locally".
Update at the end of every phase.

## Current phase

**Phase 1 — Product consolidation: complete** (branch `feature/product-consolidation`, from `main-v2` @ `dbab59d`).
Next: Phase 2 — Dashboard + first-run UX.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Fresh architecture/product audit | Done (in-session, 2026-09-27) |
| 1 | Navigation / information architecture, terminology | Done |
| 2 | Dashboard as investigation command centre; first-run workflow | Next |
| 3a | Benchmark the indexer (small/medium/large repos) | Planned — must precede 3b |
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

## Tests / build status (end of Phase 1)

- `npm run check` (Prettier, ESLint, 51 unit tests, production build): passing.
- Playwright E2E against the production build: 49/49 passing.

## Architectural decisions

- **No router introduced.** Tab ids remain App state keys; renames change labels only, so `?tool=`
  deep links and internal state are stable.
- **Temenos / OFS stays in Tools for now.** It is only kept in the product if Phase 6 connects it to
  code intelligence (routines → applications → Java extensions → services → impact). Revisit its
  navigation placement at Phase 6.
- **Codebase Search kept** alongside the top-level Search until Phase 3 unifies them.
- **References view deferred** to Phase 3; references are currently shown in the Symbol inspector.

## Known issues (carried forward)

- Reference resolution in `services/repository.js` is quadratic (per-symbol `filter` over all
  references/import bindings; `attachFileHandles` repeats it on cache restore). Likely the main
  large-repo bottleneck — measure in Phase 3a.
- Index cache is all-or-nothing and never evicts old entries (new key per change); the cache key reads
  every file's metadata sequentially.
- Dashboard reads every file on the main thread on folder open and does not use the index (Phase 2).
- Overview "Security findings" card shows 0 until the scan is run (Phase 2).
- Saved context snapshots store full source in `localStorage` (privacy + quota; Phase 5 or earlier).
- Name-only reference fallback can over-report resolved references.
- Duplicated logic: route patterns (`intelligence.js` vs `analyzers.js`), hotspot calculations (4×),
  framework detection (3×), unused `TEXT_EXTENSIONS`/`IGNORE_DIRS` in `repository.js` (Phases 3–4).
- Temenos sources (`.b`, extensionless BASIC routines) are not treated as text, so they are not indexed
  (Phase 6).
- Branch protection on `main` (require CI) is a manual GitHub setting — unverified.

## Next recommended task

Phase 2: make the Dashboard point into the investigation workflow
(Open Repository → Index → Understand → Investigate → Analyze → Report / AI), surfacing index-backed
signals (unresolved imports, cycles, hotspots) with actions that open the matching Codebase view.
