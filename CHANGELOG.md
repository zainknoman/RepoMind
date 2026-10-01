# Changelog

All notable changes to RepoMind are recorded here.

## Unreleased — T24 tools moved to T24Tools (Phase C8)

### Removed
- **Routine Creator moved to [T24Tools](https://github.com/zainknoman/T24Tools)**, together with
  the OFS Message Generator and the T24 Log Analyzer that 612ca49 had already removed. T24Tools is
  a separate browser app with the three tools as header tabs, RepoMind's look and theme toggle,
  and a new "Open existing routine" (edit an uploaded routine in the creator, or copy it under a
  new name). Removed here: `features/routineCreator/`, `services/temenos/routine*.js` and their
  tests, the Analyze → Routine Creator tab, its styles and `docs/ROUTINE_CREATOR.md`. RepoMind's
  header has no T24 tool now.
- OFS configurations and the theme saved by RepoMind carry over to T24Tools on its first visit
  (both apps share the GitHub Pages origin).

### Unchanged
- Temenos / T24 code analysis: BASIC parsing, the Temenos analyzers, configuration records,
  Impact on routines and T24-aware AI ranking.

## Unreleased — Temenos configuration records and validation (Phase C7)

### Added
- **Temenos configuration records.** VERSION, ENQUIRY, EB.API, PGM.FILE, BATCH and TSA.SERVICE
  records in DL.DEFINE package exports (`DL.D_<package>` header + positional `REC000nn`
  records) or written as named fields (`FIELD: value`, `FIELD = value`, OFS
  `FIELD:1:1=value`) in a folder named after the application are indexed. Each record links to
  the routines it names, with the event: validation, input, authorisation, before authorisation,
  record id, check record, enquiry build, enquiry conversion (`@ ROUTINE`), API, batch job
  (+ `.LOAD` / `.SELECT`). Impact on a routine lists the records that run it; the new
  **Temenos Configuration** analyzer lists every link and the routines records name that are not in
  the repository. Field positions come from the Temenos-Skills references (checked on real R21
  records) or from the repository's own `I_F` insert when present.

### Fixed (validated on two public T24 repositories: 2,669 core routines and a 4,846-file bank
local-development repository)
- Routines named like `COB.IS.LD.ASSET.CLASS` or `AB.TAX.A` were treated as binary files, and
  backup copies such as `A.CTR.UPDATE_prev` were not recognised; inserts with lower-case equates
  or an unnamed `COM` block failed the content check. 16 more routines are indexed in the bank
  repository.
- Coding Practices no longer flags variables or labels that start with a keyword
  (`ABORT.FLAG = …`, `CRT.MSG = …`, `PERFORM.ACCOUNTING:`) or text in inline `;*` comments.
  On the core routines, STOP/ABORT findings fell from 326 to 7, CRT from 127 to 112 and
  EXECUTE/PERFORM from 198 to 178; the remaining findings are real statements.

### Changed
- The index cache version is 10; existing cached indexes are rebuilt once.

## Unreleased — Theme toggle (Phase C6)

### Added
- **Light / dark theme toggle** in the header: System (follows the operating system, the
  default), Light or Dark. The choice is remembered in this browser and applied before the page
  renders, so the other theme never flashes.

## Unreleased — Worker cache, block scopes, lower-case T24 names (Phase C5)

### Changed
- **The index cache is written and linked in the index worker.** After a build, the worker posts
  the index and then writes the snapshot itself; on folder open, the worker reads and links the
  cached snapshot and the main thread only attaches file handles. On a synthetic 1,500-file
  repository (240k lines) the main thread no longer spends ~5.5 s saving, and restoring costs it
  ~5.8 s (receiving the index) instead of ~14 s.
- **Block scopes.** `let`, `const`, classes and functions declared in a block or loop are
  visible only there (`var` stays function-scoped), so same-name declarations in sibling blocks
  no longer make references ambiguous. On RepoMind's own source, medium-confidence references
  fell from ~414 to 0.
- Packages (`package.json` dependencies) are part of the index, so they are cached and kept when
  the file is reused unchanged.
- The index cache version is 9; existing cached indexes are rebuilt once.

### Added
- **Lower-case T24 routine names.** Extensionless files inside a BASIC source folder (`BP`,
  `T24.BP`, `BP.LOCAL`, `local_bp`, …) are recognised by content even when their names are
  lower case (`BP/account.validate`), in local folders, GitHub imports and commit snapshots.
  `CALL account.validate` links to them.

## Unreleased — Change impact follow-ups (Phase C4)

### Added
- **Tests to run.** Change Impact and Symbol Impact list the test files a change reaches: tests
  that use a changed symbol (directly or transitively), tests that import a changed file, and
  changed test files. The Markdown report has a "Tests to run" section.
- **Commits traced against their own code.** Impact of a commit from Recent Git Activity indexes
  the repository as it was at that commit (from `.git`, cached for the last three commits), so
  callers of since-renamed or removed functions are still found. **Explain this change with AI**
  then sends that commit's source. A checkbox switches back to today's index.

### Changed
- Git status (Modified) uses the index fast path (size and time, Git's racy rule) before hashing,
  so refreshing the Git view no longer reads every tracked file.

## Unreleased — Product cleanup (P2)

### Changed
- Consolidated the top-level navigation into **Workspace** (Dashboard, Codebase, Explorer, Search, Editor) and **Analyze** (Ingest, Quick Analysis, Transform, Compare, Markdown).
- Moved **Markdown** into Analyze as a documentation/review workspace.
- Removed the legacy Developer Tools, Temenos / OFS, and Engineering utility surfaces, including their deep-link entry points and sandboxed public assets.
- Kept Temenos **code intelligence** inside Codebase indexing and analyzer packs; removing the runtime utility surfaces does not remove BASIC analysis.

### Removed
- Developer utility collection and `?tool=` routing.
- Embedded OFS Generator, T24 Log Analyzer and Engineering Utilities.


## Unreleased — GitHub intelligence (P1)

### Added
- **GitHub Intelligence.** Public GitHub imports now expose Repository, Branches, Commits, Pull Requests, Issues and Releases in Codebase › Git.
- Repository metadata includes description, stars, forks, open issues, default branch, language, license, topics, size and timestamps.
- Commits and pull requests link back to GitHub and can run **Change Impact** against the current RepoMind index.
- GitHub change impact reuses the existing dependency graph and reports direct/transitive affected files plus blind spots when historical files are unavailable.
- Paginated GitHub lists and explicit API error/rate-limit handling.

### Changed
- Codebase › Git now selects local Git Intelligence for folders and GitHub Intelligence for imported public repositories.
- Frontend version bumped to 0.10.0.

## Unreleased — Import resolution (Phase C3)

### Added
- **tsconfig/jsconfig paths.** Imports such as `@/components/button` or `components/button`
  resolve through the `paths` and `baseUrl` of the nearest `tsconfig.json` or `jsconfig.json`
  (comments, trailing commas and relative `extends` supported), including `.d.ts` targets.
  Coverage counts imports resolved this way and says when alias-like imports still did not
  resolve (bundler-only aliases).
- **Python.** Classes, methods, functions and module variables with their extent; `import`,
  `from … import` (relative, submodules, packages under `src/`), references, `self.method()`
  calls and calls on objects of a known class; parameters and local assignments are local.
- **Java.** Classes, interfaces, enums, records (nested), methods, constructors and fields;
  imports, wildcard and static imports and same-package classes; references to types, constants
  and calls, with receivers typed from declarations (`Repo repo`, `this.repo`, `new Helper()`).
- `.mjs`, `.cjs`, `.mts` and `.cts` files are indexed as JavaScript/TypeScript.

### Fixed
- TypeScript: the right side of a qualified type name (`React.ElementRef`) and type-literal
  member names are no longer references; DOM element types and TypeScript utility types are
  globals. On a Next.js app (shadcn taxonomy), unresolved references fell from 611 to 29.

### Changed
- The index cache version is 8; existing cached indexes are rebuilt once.

## Unreleased — AI investigation (Phase C2)

### Added
- **Explain with AI.** Codebase › Impact (for a symbol) and Codebase › Git › Change Impact have an
  explain button that opens AI with a prompt already built from RepoMind's analysis: the impact
  table (confidence, level, use site) and blind spots, or the change-impact report and a numbered,
  secret-masked diff (cut with a note when it is too large), plus the changed and affected files in
  order of confidence. The AI view lists it as a third context source, "Investigation". Nothing is
  sent until **Ask AI**. A new grounding rule tells the model to present medium and low confidence
  items as possible and to state the blind spots.
- **Graph-aware file ranking.** Questions also pull in callers of the symbols they name and the
  importers and imports of the best-matching files, each with its reason and ranked below the
  files it came from.
- **T24 ranking.** Routine names (`ACCOUNT.VALIDATE`) and applications (`CUSTOMER`,
  `FUNDS.TRANSFER`) written in a question rank the routine itself first, and routines that write,
  read or use that application next.

### Changed
- A file's context reasons are its three strongest, not the first three found.

## Unreleased — Member calls (Phase C1)

### Added
- **Calls through objects are linked.** `this.method()` (including methods inherited from a
  superclass in another file), `super.method()`, `ns.fn()` on a namespace import,
  `Class.staticMethod()`, and calls on variables whose class is known (`const s = new Store()`,
  `repo: Repository`, an imported `export const api = new Api()`) now appear as references, in
  Impact and in Change Impact, with high confidence. Calls through an object of unknown class are
  matched by method name at low confidence; common built-in names (`get`, `map`, `then`, …),
  package and global objects (`React.x`, `Math.max`) are not linked. `this.handler` passed as a
  callback counts as a use.
- The Symbol inspector shows the receiver (`this.`, `store.`) and how each link was made;
  Symbol Resolution lists member guesses as `obj.name()`. `bench:index` reports member calls
  linked and not traced.

### Changed
- The index cache version is 7; existing cached indexes are rebuilt once.

## Unreleased — Git change impact (Phase B3)

### Added
- **Change impact.** Codebase › Git › **Impact of uncommitted changes**, or **Impact** next to a
  commit in Recent Git Activity, lists the changed files and the functions, methods, classes and
  routines they change (modified, added, removed), everything that could be affected through them
  (with confidence and the changed symbols that reach each item), references broken by removed
  exports or deleted files, and blind spots (binary, large and non-code files). Copy or download it
  as a Markdown report.
- RepoMind reads commits, trees and file contents from `.git` itself (loose objects and packfiles,
  including deltas), on this device only. Working copies with CRLF line endings are compared
  correctly.

## Unreleased — Transitive impact (Phase B2)

### Added
- **Transitive impact.** Codebase › Impact shows every file that imports the selected file, level
  by level with the importing path, and, for a symbol, every function, method, class, routine or
  module-level code that uses it, directly or indirectly, with a confidence per item (a path is as
  strong as its weakest link). Blind spots are listed: languages that are not analysed, unresolved
  references with the same name, calls through objects, dynamic `CALL @var` sites and guessed links.
  Temenos `CALL` chains are followed across routines. The Symbol inspector has **Show impact**.

### Fixed
- Identifiers on a line containing `export` or `import` were ignored, so one-line exported functions
  had no references (and no impact).
- Parameters, destructured, `catch` and type-parameter names are local bindings: they shadow outer
  names and no longer count as unresolved or link to same-name symbols elsewhere. On RepoMind's own
  source, unresolved references fell from 4,466 to 42 and guessed links from 218 to 0.

### Changed
- The index cache version is 6; existing cached indexes are rebuilt once.

## Unreleased — Graph trust (Phase B1)

### Added

- **Reference confidence.** Every reference records how it was linked (import, declaration in scope,
  same-name guess, unresolved) and a confidence level. The Symbol inspector tags each reference;
  Analyzers shows guessed references separately from ambiguous and unresolved ones.
- **Analysis coverage.** Codebase › Overview lists, per language, whether imports and references were
  extracted and how many imports look like unresolved path aliases (`@/…`). Impact warns when the
  selected file's language is not analysed, and the AI context lists these gaps.
- **Graph accuracy fixtures** (`services/graphFixtures.js`) scored by `services/graphAccuracy.js`;
  `npm run bench:index` reports references by confidence.

### Changed

- Re-exports (`export * from`, `export { a } from`) are dependency edges, and imports through a
  barrel link to the file that defines the symbol.
- A default import links only to the default export (including `export default name` and
  `module.exports = name`); it previously matched every export of the file.
- `import('x')` and `require('x')` are dependency edges.
- A name imported from a package no longer links to a repository symbol with the same name, and JS
  globals (`console`, `require`, …) are no longer counted as unresolved references.
- The `symbol-resolution` analyzer reports same-name guesses as `guessed`.
- The index cache version is 5; existing cached indexes are rebuilt once.

## Unreleased — Temenos code intelligence (Phase 6)

### Added

- **Temenos T24 / Transact BASIC is indexed.** `.b` files and extensionless routines and inserts
  (recognised by their content, e.g. `BP/ACCOUNT.VALIDATE`, `I_COMMON`) are parsed: routines,
  labels, `CALL`, `DEFFUN`, `$INSERT` and `CALLJ` links, `GOSUB`/`GOTO` references and the T24
  applications each routine reads or writes. Impact and Dependencies show which routines call or
  include a routine; `CALLJ` links a routine to its Java class.
- **Temenos analyzers** (Codebase › Analyzers, only for folders with BASIC): Routines, Applications,
  Services (`.LOAD` / `.SELECT` / `I_*.COMMON`), Core and External Routines, Java Links and Coding
  Practices.
- Analyzers can declare `appliesTo(index)`; unrelated analyzer packs are not listed.

### Changed

- "External imports" no longer includes relative imports that could not be resolved; those are
  counted only as unresolved relative imports.
- The index cache version is 4; existing cached indexes are rebuilt once.

### Fixed

- On phones the header grows to fit its wrapped buttons instead of pushing them above the screen.

## Unreleased — Analyzer contract and grounded AI (Phases 4 and 5)

### Added

- **Analyzer contract.** Every analyzer is defined, validated and registered the same way
  (`defineAnalyzer`, `definePatternAnalyzer`, `registerAnalyzer`) and returns findings with a
  severity, title, file and line. One run reads each file once and isolates a failing analyzer.
  See `docs/ANALYZERS.md`.
- **Analyzers view:** **Run All**, one findings table per analyzer with its own columns, counts by
  severity, run time and errors; clicking a finding's file opens it in the Editor.
- **Grounded AI answers.** **Build Prompt** picks the files relevant to your question (or uses the
  Context Builder selection), adds a repository overview, a repository map, analyzer findings and
  line-numbered source within a token budget (8k–128k), and shows which files were included and why.
- **Grounding check:** every `path:line` the model cites is checked against the index; references to
  missing files, lines past the end of a file, or code that was not sent are flagged.
- Copied and exported prompts include the grounding instructions.

### Changed

- API discovery and the secret scan are now the **Route Discovery** and **Secret Scan** analyzers;
  the separate API and security panels are gone.
- Symbol Resolution lists only ambiguous and unresolved references (resolved counts stay in the
  summary cards).
- Context Builder produces the same grounded context; the "Include file metadata" option is replaced
  by token budget, repository map and analyzer-findings options.
- The project report says "Security findings: not scanned" instead of 0 when the scan has not run.
- Dependency hotspots use one ranking everywhere (Health, Dependencies, report, analyzer).

### Fixed

- Lines that look like credentials are masked in AI context and prompts; before, source was sent as-is.
- **Saved contexts no longer store source code in `localStorage`.** They store the question, file
  list and options and rebuild on load. Existing saved contexts lose their stored source the first
  time the list is read; they stay listed as "saved by an older version" so they can be deleted.
- A FastAPI decorator such as `@app.get('/orders')` was also reported as an Express route.
- A file named in a question followed by punctuation (e.g. "cart.js?") was not recognised.

## Unreleased — Indexer performance, incremental indexing and unified search (Phase 3)

### Added

- **Incremental indexing.** Rebuilding the index reuses the analysis of every file whose size and
  modification time are unchanged, from the index on screen or the repository's last cached index,
  so only changed files are read and parsed. The Codebase and Dashboard show e.g. "Updated index
  (3 changed, 1,497 unchanged)".
- **One Search.** The Search workspace finds symbols (once the code index is built), file paths and
  source text in one place, with Regex and Match case options.
- `npm run bench:index`: an indexer benchmark on synthetic small/medium/large repositories or a real
  folder. Results are in `docs/INDEXER_BENCHMARK.md`.

### Changed

- References resolve only to declarations in scope: a function's locals are visible inside that
  function (the innermost declaration wins), and imports and matches by name from other files consider
  only top-level declarations. Previously a local `value` in one function was also counted as a
  reference to every other `value` in the file and in the repository; on RepoMind's own source this
  removes ~78% of reference links, most of them wrong. Symbols show fewer references, and some
  references become unresolved.
- The Codebase workspace no longer has its own Search view; links to it open the Search workspace.
- The index cache format is now version 3. Existing cached indexes are discarded once and rebuilt on
  the next **Build Project Index**. Only the latest snapshot of each repository is kept.
- Index progress is reported every 25 files instead of every file.

### Fixed

- Indexing was quadratic: linking every reference and import to its symbols scanned the whole
  symbol list, so a 20-file repository took ~47 s and RepoMind's own source ~22 s (now 0.17 s). A
  1,500-file, 240k-line repository indexes in ~4 s.
- Indexing crashed on any file declaring a symbol named like an `Object.prototype` member (for
  example a class `constructor` or a `toString` method).
- Restoring a cached index took seconds even for small repositories, and snapshots were up to ~14×
  larger than needed because every symbol stored full copies of its references.
- The Codebase index status ran the label and date together ("✓ Fresh index9/28/2026").

## Unreleased — Fixes

### Fixed

- After a new deploy, a page opened earlier showed "Failed to fetch dynamically imported module" in
  the Diagram tab (and could fail to open a workspace). RepoMind now says it was updated and offers a
  page reload.
- The Reports, Diagram and AI text areas in Codebase were narrow; they now use the full panel width.

## Unreleased — Dashboard and first-run workflow (Phase 2)

### Added

- **Investigate** on the Dashboard: build or restore the code index, then see health signals,
  dependency hotspots, unresolved imports and circular dependencies. Each item opens the Codebase view
  that explains it (Impact focused on the file, Dependencies, Health, Analyzers).
- A workflow guide (Open → Index → Understand → Investigate → Analyze → Report / AI) on the first-run
  screen and on the Dashboard, with an **Open Repository Folder** button on first run.

### Changed

- The Dashboard and Codebase share one index. A cached index is restored as soon as a folder opens,
  not only when Codebase is visited.
- The Codebase security card reads "not scanned" until the security scan runs, instead of showing 0.
- Faster folder open on large repositories: the cache key no longer looks up every file by path, and
  health hotspots no longer rescan all symbols per file. Existing cached indexes stay valid.

## Unreleased — Product consolidation (Phase 1)

### Changed

- Header navigation is grouped by workflow: **Understand** (Dashboard, Codebase), **Explore**
  (Explorer, Search, Editor), **Analyze** (Ingest, Quick Analysis, Transform, Compare) and a small,
  secondary **Tools** group (Developer Tools, Temenos / OFS, Markdown). Codebase is emphasised as the
  centre of the product.
- **Project Analysis** is now **Quick Analysis** and links to Codebase Intelligence for the full index.
- Codebase views follow one order: Overview, Search, Symbols, Dependencies (was Architecture), Impact,
  Health, Analyzers, Git, Diagram, Reports, Context Builder, AI (was AI Workspace). API discovery and
  the security scan moved into **Analyzers**.
- Page headings match their navigation labels (Ingest, Compare, Markdown, Engineering).
- Help is grouped the same way as the header navigation.

### Unchanged on purpose

- **Engineering** stays out of the header; it still opens from `?tool=eng`. All `?tool=` links and
  internal workspace ids are unchanged.

## 0.9.0 — Production readiness

Based on the audit in [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md).

### Fixed

- The production build on `main` failed: `App.jsx` was duplicated and corrupted and `indexCache.js`
  was invalid. Both are repaired.
- **Compare** treated every file as a single line; it now splits lines correctly and uses an LCS line
  diff that aligns inserted and removed lines.
- **Project Analysis** never recognised JS/TS files; its patterns are fixed.
- The IndexedDB cache awaited inside a transaction and could fail; a restored cache could also replace
  a freshly built index.
- Clicking a Codebase search result did nothing; it now opens the file in the Editor. Invalid regex
  searches show an error.
- The Codebase index was lost on every tab switch.
- The Cancel button appeared while building context; indexing now has its own busy state.
- Editor Find moved focus into the document while typing, so the next keystroke could overwrite text.
  Find and Replace now use the same matching, with an optional **Match case**.
- The Regex tool's test text could not be edited.
- `.gitignore` rules with a leading slash or `**` did not match.
- Git index versions 3 and 4 were mis-parsed.
- Clicking a file in the Dashboard's file list crashed the app.

### Added

- **Tools** navigation group (Developer Tools, Temenos / OFS, Engineering).
- Notice for browsers without folder access; the Open Folder button is disabled there.
- Unsaved-changes confirmation and a warning before closing the tab with unsaved edits.
- Error boundaries per workspace, dark mode, visible focus styles, skip link and `aria-current`.
- Warning when a folder exceeds 50,000 files.
- AI settings require a model; per-provider model hints.
- Security findings mask secret values.
- Proprietary LICENSE (Zainknoman Software Services), SECURITY.md, CONTRIBUTING.md and this changelog.
- Unit tests (Vitest), linting (ESLint) and formatting (Prettier) in CI.

### Changed

- `App.jsx` split into feature modules; workspaces load on demand (initial bundle 721 KB → ~250 KB).
- Repository indexing runs in a Web Worker; long file lists are virtualised; search results are capped.
- Mermaid and JSZip are bundled from npm instead of loaded from a CDN.
- Production builds include a Content Security Policy.
- Embedded tools run in an opaque-origin sandbox with a message bridge; the T24 analyzer escapes log
  content and no longer loads the Tailwind CDN.
- E2E tests run against the production build; the E2E job is part of CI, and Pages deploys only after
  CI passes.
- Removed the unused backend and the separate E2E workflow.

## 0.8.0

Visualization and cache hardening. See [`docs/UPGRADE_JOURNEY.md`](docs/UPGRADE_JOURNEY.md) for
earlier milestones.
