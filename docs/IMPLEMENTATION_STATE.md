# Implementation State

Concise record of the staged evolution of RepoMind toward "Understand any codebase locally".
Update at the end of every phase.

## Current phase

**Phases B1–B3 and C1–C3 done and on `main`.** Plans with per-task status and outcomes:
`docs/superpowers/plans/2026-09-28-graph-trust.md` (B1), `…-transitive-impact.md` (B2),
`…-git-change-impact.md` (B3), `…-member-calls.md` (C1), `…-ai-investigation.md` (C2),
`…-import-resolution.md` (C3). Phases C4–C7 follow in that order.
Plans live in `docs/superpowers/plans/`.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Fresh architecture/product audit | Done (in-session, 2026-09-27) |
| 1 | Navigation / information architecture, terminology | Done |
| 2 | Dashboard as investigation command centre; first-run workflow | Done |
| 3a | Benchmark the indexer (small/medium/large repos) | Done — `docs/INDEXER_BENCHMARK.md` |
| 3b | Incremental indexing + unified search (only if the benchmark justifies it) | Done |
| 4 | Analyzer/plugin contract | Done — `docs/ANALYZERS.md` |
| 5 | AI grounding and repository context | Done |
| 6 | Temenos code intelligence | First slice on `main` (indexing, linking, analyzers); more below |
| B1 | Graph trust: reference confidence, coverage, re-exports, accuracy fixtures | Done |
| B2 | Local bindings, transitive impact with confidence and blind spots | Done |
| B3 | Git change impact (diff → changed symbols → impact) | Done |
| C1 | Member calls (`this.m()`, `obj.m()`) in references and impact | Done |
| C2 | AI investigation of impact and changes; graph-aware and T24 file ranking | Done |
| C3 | Import resolution: tsconfig/jsconfig paths, Python, Java | Done |

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

## Completed work (Phase 4)

- `services/analyzers.js`: `defineAnalyzer` (validated: id, name, category, description, scope
  `index`|`source`, columns, run), `normalizeFinding` (severity/title/file/line), `registerAnalyzer`
  (returns unregister), `listAnalyzers`, `runAnalyzers` (shared cached `readText`, per-analyzer error
  isolation, `onResult`, cancellation), `definePatternAnalyzer` (regex rules → findings with line and
  line text, dedupe key, per-file/per-rule filters), `lineLocator`.
- Built-ins on the contract: `routes`, `framework-structure`, `symbol-resolution` (non-resolved only),
  `architecture-hotspots`, `security` (secret scan; `looksSecret`, `redactSecret` exported for reuse).
- Duplication removed: `intelligence.js` deleted (route patterns ×2 and the secret scan → analyzers;
  package detection → `services/frameworks.js`; Mermaid builder → `diagram.js`; unused
  `buildDependencyMermaid`, `intelligenceSummary`). Hotspots: one `fileCoupling` in `health.js` (was 4×;
  `getArchitecture` and the report's own ranking removed). Framework checks: `hasFramework` in
  `frameworks.js`. Unused `TEXT_EXTENSIONS`/`IGNORE_DIRS` removed from `repository.js`.
- UI: `features/codebase/AnalyzersView.jsx` (Run All, tables from declared columns, severity counts,
  ms, errors, file → Editor via the previously unused `onOpenFile`). Security card/report read the
  `security` result.

## Completed work (Phase 5)

- `services/aiContext.js`: `rankFilesForQuestion` (named paths/files, defining symbols, identifier
  parts, path parts; coupling fallback), `buildGroundedContext` (overview → repository map ≤15% of
  budget → analyzer findings ≤5% → numbered source; truncates or omits files over budget; masks lines
  matching the secret rules; returns requested/included/omitted files with reasons), `GROUNDING_RULES`,
  `formatPrompt`, `exportablePrompt`, `verifyCitations` (verified / outside-context / bad-line /
  unknown-file).
- `ai.js`: the grounding rules are the system message; `promptMessages(prompt)` sends the prompt as
  shown (and possibly edited).
- `services/savedContexts.js`: saved contexts are recipes (repository, task, paths, options); legacy
  entries have their source stripped on read. Replaces `buildContext` in `repository.js`.
- UI: `features/codebase/useAIContext.js` (state shared by Context Builder and AI; resets per index),
  `AIViews.jsx` (context source: question vs selection; budget/deps/importers/map/findings options;
  context summary with reasons; grounding check linking to files; saved contexts rebuild on load).
  `CodebasePanel.jsx` shrank from 1,332 to ~700 lines.

## Tests / build status (end of Phase 5)

- `npm run check` (Prettier, ESLint, 79 unit tests, production build): passing.
- Playwright E2E against the production build: 61/61 passing. Fixed a race in "Search builds the code
  index on request" (it waited for the hint to disappear, which also happens when the build starts).

## Completed work (Phase 6, first slice)

- `lib/files.js`: `.b` is a text extension. Extensionless upper-case names (`maybeBasicName`) have
  their first 4 KB sniffed (`looksLikeBasic`: routine header, `$INSERT`/`$PACKAGE`/`$USING`,
  `COMMON /…/`, `EQU … TO`); matches are classified `ext: '.b'`, so the record flows through the
  worker, cache key and incremental reuse unchanged.
- `services/temenosBasic.js` (`parseBasic`): routine symbol (subroutine/program/function/insert),
  labels scoped to the file, `CALL`/`DEFFUN` (kind `call`), `$INSERT`/`$INCLUDE` (`insert`),
  `CALLJ` (`callj`) imports with bindings, call-site and `GOSUB`/`GOTO` references with offsets;
  comments and string contents ignored; `files[].temenos` = routine, type, package, `$USING`,
  applications (layout/read/write/uses via `I_F.*`, file variables + `OPF`, `F.READ`/`F.WRITE`,
  `READ…FROM`/`WRITE…ON`, `EB.DataAccess`, TAFJ table API), Java calls, dynamic call count.
- `repository.js`: `analyzeSource` dispatches `.b`; `namedImportResolver` resolves `call`/`insert` by
  routine name (file name without `.b`) and `callj` to `pkg/Class.java` (Maven layout or path
  suffix). Edges carry `kind`. Unresolved BASIC calls are external dependencies and are not added as
  references. Framework signal "Temenos T24 / Transact".
- `services/temenos.js`: `temenosModel(index)` and six analyzers (routines, applications, services,
  core/external calls, Java links, coding practices), registered with `appliesTo: hasTemenos`.
- Analyzer contract: optional `appliesTo(index)`; `listAnalyzers(index)` and `runAnalyzers(index)`
  (no ids) include only applicable analyzers. Codebase lists analyzers per index.
- Known issues fixed here: "External imports" excludes unresolved relative imports; phone header
  grows instead of overflowing. Cache version 4.

## Tests / build status (Phase 6, first slice)

- `npm run check` (Prettier, ESLint, 89 unit tests, production build): passing.
- Playwright E2E against the production build: 61/61 passing (no Temenos E2E test yet).

## Completed work (Phase B1 — graph trust)

- `repository.js`: references carry `resolution` (`import` / `local` / `name-match` / `unresolved`)
  and `confidence` (`high` / `medium` / `low` / `none`, `referenceConfidence`);
  `stats.referenceConfidence`, `externalReferences`, `globalReferences`. Locals bound by imports
  that do not resolve in the repository are never name-matched; JS globals are not references.
- Re-exports are import edges (`reexport: true`); `resolveExported` follows `export … from` and
  `export *` chains (cycle-safe); default imports match only `kind: 'default'` exports
  (`export default name`, `module.exports = name`); `import()` / `require()` are edges with
  `require` bindings. Cache version 5.
- `services/coverage.js`: `analysisCoverage` / `coverageGaps` / `coverageFor`; `index.coverage`.
- `services/graphAccuracy.js` + `graphFixtures.js`: fixture repositories with exact expected edges
  and links; `bench:index` prints references by confidence.
- UI: confidence tags in the Symbol inspector, Analysis Coverage panel (Overview), coverage warning
  in Impact, Guessed refs card (Analyzers). AI: coverage gaps in the overview, grounding rule 6.
- RepoMind `src` after B1: 3,821 high / 174 medium / 218 low / 4,466 unresolved references,
  964 package or global names not linked. Most unresolved are parameters and destructured locals.

## Tests / build status (Phase B1)

- `npm run check`: passing (111 unit tests). E2E: 61/61 passing.

## Completed work (Phase B2 — transitive impact)

- Parser: `localBindings` (parameters, destructuring, `catch`, TS type parameters) per file; the
  innermost binding shadows imports and outer declarations (`stats.localReferences`). Symbols have
  `endLine`. Export names are skipped by syntax, not by line (fixes one-line exported functions).
  Cache version 6.
- `services/impact.js`: `containerAt`, `symbolImpact` (widest-path, three confidence buckets,
  module-level entries, `maxDepth`, `limit`), `fileImpact` (importers by level), blind spots.
- UI: `features/codebase/ImpactView.jsx`; Symbol inspector **Show impact**.
- Tests: 124 unit (fixtures incl. `one-line-export`, `impact.test.js`), E2E 61/61 (Impact asserts
  symbol impact and blind spots).

## Completed work (Phase B3 — Git change impact)

- `services/gitObjects.js`: object store over `.git` (loose, pack index v2, offset/ref deltas,
  `DecompressionStream`), `parseCommit`, `parseTree`, `flattenTree`. Verified against
  `git cat-file` for every object before and after `git gc --aggressive`.
- `services/gitChanges.js`: `workingTreeChanges` (HEAD vs files; index fast path with Git's racy
  rule; CRLF-tolerant blob SHA-1; deletions confirmed on disk; unborn branch = all added) and
  `commitChanges` (vs first parent). Matches `git status` / `git diff` on RepoMind itself.
- `services/changeImpact.js`: `changedSymbols` (line diff → innermost unit in old/new text),
  `changeImpact` (merged `symbolImpact`, module-level → importers, broken importers, blind spots;
  changed symbols are not repeated as affected), `changeImpactMarkdown`.
- UI: `features/codebase/GitView.jsx` (moved out of CodebasePanel) with the Change Impact panel.
- `parseIndex` returns each entry's blob SHA. Test helper `src/test-utils/nodeHandles.js` wraps a
  real folder as File System Access handles.
- Tests: 144 unit, 62 E2E.

## Completed work (Phase C1 — member calls)

- Parser: member references (`kind: 'member'`, receiver `this` / `super` / `object` (+ `type`) /
  `other`, `call`) for calls through objects and `this.x`; class symbols carry `superClass`,
  `new` variables `instanceOf`; typed bindings from `new Foo()` and `: Foo` respect shadowing.
- Resolution (`buildRepositoryIndex`): receiver class via enclosing class, import binding, local
  declaration or unique name; methods looked up through superclasses (8 levels). Resolutions
  `this`, `member-type`, `member-guess` (low; built-in names skipped), plus `import`/`local` for
  namespace and static calls. Unresolved member calls are counted (`stats.untracedMemberCalls`),
  not recorded. Cache version 7. Link keys name methods `path::Class.method`.
- Impact's `member-calls` blind spot describes what remains untraced. Symbol inspector shows the
  receiver; Symbol Resolution shows `obj.name()`.
- Tests: 149 unit (`memberCalls.test.js`, `member-calls` fixture), 62 E2E.

## Completed work (Phase C2 — AI investigation)

- `services/aiInvestigation.js`: `impactBriefing`, `changeBriefing` (report + numbered, masked
  diff, cut with a note), `impactFiles`, `changeFiles`, `impactTask`, `changeTask`.
- `buildGroundedContext({ sections })` places briefings before the source; grounding rule 7.
- `rankFilesForQuestion`: T24 routine (40) and application (write 12 / read 8 / other 6) matches;
  graph neighbours of the top 5 (callers of named symbols 4, importers/imports 3), capped at half
  the seed's score; top three reasons by strength.
- UI: `useAIContext.investigate`, third context source "Investigation"; **Explain with AI** in
  Impact, **Explain this change with AI** in Git Change Impact.
- Tests: 156 unit, 62 E2E.

## Completed work (Phase C3 — import resolution)

- `services/moduleResolution.js`: `parseModuleConfig` (JSONC), `createJsResolver` (relative, then
  nearest config's `paths`/`baseUrl` with `extends`), `createPythonResolver`, `createJavaResolver`,
  `createModuleResolver().entries/module/aliasesResolved`. Relative-path helpers moved here from
  `repository.js`. Config settings are stored on the config file's analysis (`moduleConfig`) so
  incremental reuse keeps them; imports are resolved after all files are analysed.
- `services/pythonParser.js`, `services/javaParser.js`: blanking scanners producing symbols with
  extent, imports with bindings, references (C1 receiver model), local and typed bindings.
- Index: Python `from pkg import submodule` edges; Java wildcard and implicit same-package edges
  for referenced class names; Python `__init__` re-exports; module references counted separately.
- Coverage: `imports: 'modules'` for Python/Java; `aliasImports` per language. Cache version 8.
- Results on Flask, Spring PetClinic, shadcn taxonomy: see the plan's outcome.
- Tests: 170 unit, 62 E2E.

## Architectural decisions

- **No router introduced.** Tab ids remain App state keys; renames change labels only, so `?tool=`
  deep links and internal state are stable.
- **Temenos / OFS stays in Tools (decided in Phase 6).** Temenos *code* intelligence is not a separate
  workspace: BASIC sources are indexed like any language, so Impact, Dependencies, Symbols, Search,
  Health, Diagram and AI context work on them, and the domain views are analyzers that appear in
  Codebase › Analyzers only for T24 folders. The OFS Generator and T24 Log Analyzer work on runtime
  messages and logs, not source, so they remain utilities under Tools; each surface points to the
  other (Help, OFS subtitle).
- **BASIC routines are linked by name, not path.** T24 has one global routine namespace; the first
  file with a given routine name wins and duplicates are flagged by `temenos-routines`.
- **Extensionless BASIC is recognised by content, only for upper-case names**, to avoid reading every
  binary or extensionless file in ordinary repositories. Lower-case extensionless routines are missed.
- **One Search workspace** (Explore → Search) for symbols, files and text; Codebase has no search view.
  Search stays usable without an index (files + text) and adds symbols when one exists.
- **References view deferred** again; references are shown in the Symbol inspector.
- **Analyzers are registered modules, not runtime plugins.** No third-party code is loaded; domain
  packs (Temenos) will be modules calling `registerAnalyzer`.
- **Analyzers run on the main thread** with async source reads; results live in `CodebasePanel` state
  per index (not cached).
- **File ranking for AI is lexical plus graph** (identifiers, paths, T24 names, then callers and
  imports of the best matches), not embeddings: local, deterministic and explainable ("defines
  greet", "uses greet"). Semantic retrieval is a possible later step.
- **AI investigations send RepoMind's analysis, not a summary of it by the model**: the impact
  table, change report and diff are part of the prompt, with their confidences and blind spots.
- **Secret masking in AI context reuses the secret-scan rules** per line; it is heuristic, like the
  scan.
- **The grounding check is advisory**: it verifies that cited files/lines exist and were sent, not
  that the claim about them is correct.
- **Benchmark in Node, not the browser**: deterministic and CI-friendly; browser-only costs are
  approximated with `structuredClone` / V8 serialization. Real-browser profiling is a follow-up if the
  numbers and user reports diverge.
- **Incremental reuse is keyed on size + modification time per path**, the same signal as the cache key.
  The "latest snapshot" pointer is per repository *name*, so two different folders with the same name
  share it: the second evicts the first's snapshot, and reuse still requires matching path, size and
  time.
- **Scopes are function-level**, not block-level; parameters are not symbols.
- **Python and Java use purpose-built scanners, not full parsers** (no new dependencies): comments
  and literals are blanked, then declarations, imports and references are read by indentation
  (Python) or braces (Java). Java references exclude lower-case non-call names (locals, fields).
- **Member calls are resolved from local evidence only** (enclosing class, `new`, type
  annotations, imports); there is no type inference across calls or returns. An unknown receiver
  is a low-confidence name guess, never a high-confidence link.
- **Index state lives in App (hook), not a global store.** Only the Dashboard and Codebase need it;
  a context/store can come later if more consumers appear.
- **Codebase panel stays keyed per project**, so per-view state (search, analyzers, AI) still resets on
  a new folder; only the index, view and selected file are lifted.

## Known issues (carried forward)

Status of the issues listed at the end of Phase 5 (checked 2026-09-28):

- Saved index never cleaned up — **fixed in Phase 3b** (`latest` store deletes the superseded
  snapshot; Clear deletes the current one). Snapshots of folders never reopened still remain.
- Dashboard reads files twice — **open** (below).
- References counted as resolved too easily — **partly fixed** by scope-aware resolution in 3b; a
  reference still falls back to any top-level symbol of the same name in any file.
- "External imports" inflated by unresolved relative imports — **fixed in Phase 6**.
- Phone header overflow — **fixed in Phase 6**.
- "✓ Fresh index9/28/2026" — **fixed in Phase 3b** (label · date).
- Branch protection on `main` — **not enabled**: the GitHub API reports `protected: false`, no
  required status checks and no rulesets. Needs enabling in the repository settings.
- Local branches: `feature/product-consolidation`, `feature/analyzers-ai-grounding` and `main-v2`
  (`dbab59d`) are all ancestors of `main` and can be deleted.

Carried forward:

- Large repositories (~1 M dense lines) still block the main thread for ~10–19 s when a build finishes,
  when saving the cache and when restoring it (index size). Next steps, in order: save the cache from
  the worker; store references once instead of raw + linked; block scopes/parameters. Real code at
  ~100k lines stays under 0.3 s per step. See `docs/INDEXER_BENCHMARK.md`.
- Dashboard profile statistics still read every file on the main thread on folder open (separate from
  the index); candidate to derive from the index or move to the worker.
- Folder open now also runs the cache-key check (one `getFile()` per text file) to restore the index.
- A reference to a parameter can still match a top-level declaration of the same name in another file
  (parameters are not symbols).
- Symbol Resolution reports globals such as `require` and `module` as unresolved.
- The indexer ignores identifiers on lines that contain an `export` or `import` (pre-existing),
  so `export function f() { return g(); }` records no reference to `g`.
- Branch protection on `main` (require CI) is not enabled (checked via the public API).
- Temenos: names like `EB.GET.KEY` match the sensitive-file rule (`.key`) and are skipped unless
  "Include sensitive files" is on.

## Next recommended task

Phases in progress, in order (owner's list, 2026-09-28):
- **C4** Change-impact follow-ups: affected test files; exact Git "Modified" detection; trace old
  commits against their own code.
- **C5** Cache save/restore in the worker; block scopes; lower-case extensionless T24 routines.
- **C6** Header light/dark theme toggle.
- **C7** Temenos configuration records (VERSION, EB.API, PGM.FILE, BATCH / TSA.SERVICE) and
  validation on real T24 sources, using the Temenos-Skills reference
  (github.com/zainknoman/Temenos-Skills).

Done from the earlier Phase 6 list: transitive impact (B2) and T24 ranking for AI (C2).
