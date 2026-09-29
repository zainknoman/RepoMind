# RepoMind

**RepoMind is a local-first codebase intelligence workspace for developers.**

It turns a selected local repository into a browser-based workspace for:

**Scan → Search → Inspect → Analyze → Visualize → Transform → Document → Understand → Export**

RepoMind is designed to help developers understand an unfamiliar codebase, trace dependencies, inspect symbols, review changes, generate context and documentation, and work with common developer utilities without uploading the repository.

**Current version:** 0.10.0 (see [CHANGELOG.md](CHANGELOG.md)) · **Live:** https://zainknoman.github.io/RepoMind/

## Core principles

- **Local-first:** repository files are processed in the browser.
- **No backend required for the core workflow:** open a local folder with the browser File System Access API.
- **Explicit external AI:** AI provider calls happen only when the user chooses to run them.
- **Heuristic where appropriate:** security, route discovery, Git status and some framework analysis are signals rather than full compiler/security audits.
- **One workspace:** exploration, intelligence, transformation and documentation are connected instead of being separate utilities.

## Getting started

RepoMind is published at **https://zainknoman.github.io/RepoMind/**.

1. Open RepoMind in **Chrome or Edge on desktop** (see [Browser support](#browser-support)).
2. Click **Open Folder** and select a local project directory. Grant read/write access if you want to save edits.
3. On the **Dashboard**, click **Build Project Index**. RepoMind parses the code locally (and restores a cached index when you reopen the same folder).
4. Review **Investigate**: unresolved imports, circular dependencies, dependency hotspots and parser errors. Each item opens the Codebase view that explains it.
5. Open **Help** in the top-right corner for feature-by-feature guidance.

### Browser support

| Browser | Status |
|---|---|
| Chrome, Edge, other Chromium browsers (desktop) | Fully supported |
| Firefox, Safari, mobile browsers | Folder access unavailable (no File System Access API). RepoMind shows a notice; the Markdown workspace still works. |

Folders with more than 50,000 files are truncated with a warning; open a subfolder for complete results. Files larger than 2 MB, and sensitive-looking files (`.env`, keys, credentials) unless **Include sensitive files** is ticked, are listed but not read.

## Workspace guide

The header has two product workflows: **Workspace** for navigating and inspecting a repository, and **Analyze** for understanding, transforming and documenting it. RepoMind intentionally does not expose unrelated developer utilities or embedded Temenos/OFS/Engineering tools.

### Workspace

| Workspace | Purpose |
|---|---|
| **Dashboard** | The investigation starting point. Shows the workflow (Open → Index → Understand → Investigate → Analyze → Report / AI), builds or restores the code index, and lists what needs attention (unresolved imports, cycles, hotspots, parser errors) with links into Codebase. |
| **Codebase** | The centre of RepoMind: symbols, references, dependencies, impact, health, analyzers, Git, diagrams, reports, context and AI. |
| **Explorer** | Browse and filter local project files (virtualised for large folders). |
| **Search** | One search for symbols (from the code index), file paths and source text, with regex and match-case options. |
| **Editor** | Edit supported text files with find/replace (optional match case) and save back to disk. Unsaved changes are protected. |

### Analyze

| Workspace | Purpose |
|---|---|
| **Ingest** | Generate a Gitingest-style summary, directory tree and combined source context. |
| **Quick Analysis** | Fast pattern scan of JS/TS files: line counts, functions, classes, imports and exports. Use **Codebase** for the full index. |
| **Transform** | Combine files into one bundle, split a bundle back into files, export a ZIP. |
| **Compare** | Line diff of two files that aligns inserted/removed lines, with filters and compact output. |
| **Markdown** | Render Markdown, including Mermaid diagrams, for documentation and review. |

## GitHub Intelligence\n\nWhen a repository is imported from the **GitHub Repository** control, Codebase › Git becomes a read-only GitHub workspace for public repositories. It exposes repository metadata, branches, commits, pull requests, issues and releases. Commits and pull requests can be traced through the current local index with **Change Impact**, using RepoMind's existing dependency graph. Historical source that is not present in the imported revision is reported as a blind spot rather than treated as analysed.\n\n## Codebase Intelligence

Codebase is the main RepoMind workspace. After **Build / Refresh Index**, its views are:

**Overview · Symbols · Dependencies · Impact · Health · Analyzers · Git · Diagram · Reports · Context Builder · AI**

Searching lives in the **Search** workspace, which includes indexed symbols once the index is built.

API discovery and the security scan run from **Analyzers**.

### Indexing

The local index captures:

- Files and languages
- Estimated lines, bytes and tokens
- AST symbols
- Definitions
- References
- Imports and exports
- Internal dependencies
- External dependencies
- Unresolved imports
- Import bindings
- Architecture relationships

JavaScript, JSX, TypeScript and TSX use Babel AST parsing with conservative pattern fallback for malformed source.

Indexing is incremental: rebuilding reuses the analysis of every file whose size and modification time are unchanged (from the index on screen, or the last cached index of the repository), so only changed files are read and parsed again. Cross-file links are always recomputed. Indexer performance is tracked with `npm run bench:index`; see [docs/INDEXER_BENCHMARK.md](docs/INDEXER_BENCHMARK.md).

### Symbols and references

RepoMind can identify functions, classes, interfaces, type aliases, variables and class methods.

Reference intelligence connects symbols across files where the available source information allows reliable resolution.

Example:

`orders/controller.js` imports `createOrder` from `orders/service.js`.

RepoMind can show:

- where `createOrder` is defined,
- where it is referenced,
- which file imports it,
- and which files may be affected by a change.

**Every reference has a confidence**, shown as a tag in the Symbol inspector:

| Confidence | Meaning |
|---|---|
| high | Linked through an import, or to a declaration in scope |
| medium | Several possible targets (a namespace import or duplicate declarations) |
| low | Guessed: a top-level symbol with the same name that nothing imports |
| none | Unresolved |

Re-exports (`export * from`, `export { a } from`), default exports (including `export default name` and `module.exports = name`), `import()` and `require()` are followed. Names imported from packages, JS globals, parameters and destructured variables are never linked to unrelated repository symbols.

**Analysis coverage** (Codebase › Overview) lists, per language, whether imports and references were extracted. JavaScript/TypeScript (including `.mjs`/`.cjs`/`.mts`/`.cts`) resolve relative imports and the `paths` and `baseUrl` of the nearest `tsconfig.json`/`jsconfig.json` (with `extends`); **Python** resolves absolute and relative module imports (also packages under `src/`, and `from pkg import submodule`); **Java** resolves imports, wildcard imports and same-package classes by package; Temenos BASIC resolves `CALL`, `$INSERT` and `CALLJ` by name. Other languages (C#, Go, Kotlin, …) currently have symbols only, so their dependencies and impact are empty, and RepoMind says so rather than showing an empty result as complete. Imports that still look like path aliases (`@/…`, e.g. bundler-only aliases) are counted.

### Dependencies and architecture

The Codebase workspace can identify:

- dependency edges,
- dependents,
- circular dependencies,
- dependency hotspots,
- unresolved relative imports,
- external dependencies,
- architecture relationships.

### Impact

**Codebase › Impact** answers "if I change this, what could be affected?":

- **File impact:** every file that imports the selected file, level by level, with the file it came through.
- **Symbol impact:** choose a function, class, method or T24 routine to see every function, method, class, routine or module-level code that uses it, directly or indirectly. Each item has a confidence; a chain is only as strong as its weakest link.
- **Method calls through objects** are followed: `this.save()` (also when `save` is inherited), `super.save()`, `ns.fn()`, `Store.create()`, and calls on variables created with `new` or annotated with a class type. A call on an object of unknown class is matched by method name at low confidence.
- **Blind spots** are always listed, so an empty result is never read as "safe": languages that are not analysed, unresolved references with the same name, calls on objects of unknown class or through computed names (`obj[name]()`), dynamic `CALL @var` sites and guessed links.

The Symbol inspector has **Show impact**.

### Search

The **Search** workspace is the one search for the project. It finds matching symbols (once the code index is built), file paths and source lines, with regex and match-case options, and opens a result in the match viewer or the Editor.

### Health and analyzers

Health signals include:

- unresolved imports,
- unresolved references,
- circular dependencies,
- parser errors,
- dependency hotspots,
- external dependency signals.

**Analyzers** lists every registered analyzer — Route Discovery, Framework Structure, Symbol
Resolution, Architecture Hotspots and Secret Scan. Run one, or **Run All**; each shows its findings
in a table with severity, and clicking a file opens it in the Editor. Findings also feed the project
report and AI context. Analyzers follow one contract, so new ones (including language or domain
packs) plug in without UI changes — see [`docs/ANALYZERS.md`](docs/ANALYZERS.md).

Framework-aware analysis covers patterns used by:

- React
- Vue
- NestJS
- Spring
- ASP.NET
- FastAPI
- Flask

These analyzers are intentionally heuristic and should not be treated as a replacement for a compiler, linter or dedicated security scanner.

### API discovery

Run from **Analyzers → Route Discovery**. RepoMind detects common route declarations for:

- Express
- NestJS
- FastAPI
- Flask
- Spring
- ASP.NET

Results are intended for code navigation and architecture understanding.

### Security scanning

Run from **Analyzers → Secret Scan**. The local security scanner searches for likely:

- API keys
- access/auth/bearer tokens
- passwords and secrets
- private keys
- database connection strings
- common credential environment variables

Findings mask the matched value (only the first four characters are kept), so on-screen results and exported reports never repeat the secret.

**Important:** matches are heuristic findings and can include false positives. Review the source manually before taking action.

## Architecture visualization

The **Diagram** workspace generates Mermaid dependency diagrams from the local codebase graph.

Mermaid is loaded lazily only when visualization is requested. The rendered result is displayed as SVG with:

- Generate
- Re-render
- Copy
- Download
- Error/loading feedback

Mermaid is bundled with RepoMind and loaded on first use, so diagrams render without any network access.

## Git intelligence

RepoMind reads Git data locally from the repository's `.git` folder. Nothing is uploaded, and Git contents are never added to the code index.

Available signals include:

- current branch,
- HEAD,
- remote information,
- working-tree file signals,
- recent reflog activity.

The Modified / Untracked / Deleted counts are timestamp-based signals, because the browser cannot run `git status`.

### Change impact

**Codebase › Git › Impact of uncommitted changes**, or **Impact** next to a commit in Recent Git Activity, shows what a change could affect:

- the changed files, and the functions, methods, classes and routines they modify, add or remove;
- everything that could be affected through them, with confidence and the changed symbols that reach each item;
- references broken by removed exports or deleted files;
- blind spots: binary, large (over 1 MB) and non-code files that are not traced.

**Copy report** / **Download** export it as Markdown for a pull request or review.

To do this, RepoMind reads commits, trees and file contents from `.git` itself (loose objects and packfiles, including deltas). Uncommitted changes are compared with HEAD exactly (by content, tolerant of CRLF line endings). A past commit is compared with its parent, and its changed symbols are traced through the current index.

## AI

RepoMind provides a provider-neutral context workflow and direct browser-side adapters for:

- OpenAI
- OpenAI-compatible endpoints
- Anthropic
- Google Gemini

Answers are **grounded in the local index**. Type a question and click **Build Prompt**:

- RepoMind picks the files most relevant to the question (files you name, files defining symbols you
  mention, T24 routines and applications you name in capitals such as `ACCOUNT.VALIDATE` or
  `CUSTOMER`, then symbol and path matches, then graph neighbours of the best matches: callers of
  the named symbols and files that import or are imported by them) — or uses the Context Builder
  selection — plus their direct dependencies if selected.
- **Explain with AI** (Impact, for a symbol) and **Explain this change with AI** (Git › Change
  Impact) start an *investigation*: the prompt carries RepoMind's own analysis — the impact table
  with confidences and blind spots, or the change-impact report plus a numbered diff — and the
  changed and affected files, strongest first. The model is told to present medium and low
  confidence items as possible, not certain. The prompt is built and shown; nothing is sent until
  you click **Ask AI**.
- The context holds a repository overview, a **repository map** (every file with its top-level
  symbols, so the model knows what exists), **analyzer findings** you have run, and the source with
  **line numbers**, all within a token budget (8k–128k). Files that do not fit are cut or listed as
  left out. The **Context** panel shows each file and why it was included.
- Lines that look like credentials are **masked** before anything leaves the browser.
- The model is instructed to answer only from the context and cite `path:line`. After it answers,
  a **Grounding check** verifies every cited file and line against the index and flags references
  to files that do not exist, lines past the end of a file, or code that was not sent.
- **Copy Prompt** / **Export** include the same instructions, for use with any assistant.

To call a provider, open **AI Settings** and enter the provider, a **model ID** (required; RepoMind does not guess one) and an API key.

- Provider, model and endpoint are remembered in `localStorage`. The **API key is kept only in `sessionStorage`** and is forgotten when the tab closes.
- External AI calls happen only when you click **Ask AI**; indexing never sends source to a provider.
- The production Content Security Policy allows direct calls to `api.openai.com`, `api.anthropic.com` and `generativelanguage.googleapis.com`. An OpenAI-compatible endpoint on another host must be added to `connect-src` in `frontend/vite.config.js`.
- Provider availability also depends on each provider's browser/CORS policy.

## Context Builder

Context Builder creates the same grounded context (overview, repository map, analyzer findings,
numbered and redacted source) from the files you select, within a token budget.

**Saved contexts** store the question, file list and options — never the source. Loading one rebuilds
the context from the files as they are now. (Saved contexts from earlier versions held the full source
in `localStorage`; it is removed the first time the list is read.)

Typical workflow:

1. Build the Codebase index.
2. Select relevant files.
3. Optionally include direct dependencies/importers.
4. Review the estimated token size.
5. Generate context.
6. Copy or download it.
7. Use it for review, documentation or an external AI workflow.

## Documentation and reports

Reports convert local intelligence into reusable Markdown.

### Project Report

Includes, when available:

- project technology profile,
- files and languages,
- symbols and references,
- imports/exports,
- dependency relationships,
- external dependencies,
- circular dependencies,
- unresolved imports/references,
- parser errors,
- API surface,
- security findings,
- dependency hotspots,
- review recommendations,
- limitations.

### Module Report

A focused report for a selected file containing:

- language,
- lines,
- estimated tokens,
- symbols,
- imports,
- exports,
- resolved dependencies.

Reports can be edited, copied and downloaded from the Reports workspace.

## Local cache

RepoMind caches the index metadata in IndexedDB to make reopening a folder faster.

The cache:

- is keyed by the project name plus every file's path, size and modification time, so any change invalidates it,
- keeps the latest snapshot per repository name: when files change, the next build reuses the unchanged files' analysis from it, and the superseded snapshot is deleted,
- stores analysis metadata rather than repository source,
- excludes file handles,
- stores symbol/reference relationships as keys and positions and rehydrates them on restore,
- can be cleared from the Codebase workspace.

A fresh **Build / Refresh Index** remains available whenever you want to regenerate the analysis.

## Privacy model

For the normal local workflow:

`Local Folder → Browser → Local Index → Local UI`

- RepoMind has no backend. All scripts, including Mermaid and JSZip, are bundled and served from the RepoMind site; no third-party CDN is contacted.
- Production builds ship a Content Security Policy: scripts only from the site itself, network access only to the site and the supported AI providers.
- Security-scan findings mask the matched secret value, so reports never repeat a credential.
- The only outbound requests are AI provider calls that you explicitly trigger.
- Git data (including file contents at earlier commits, for change impact) is read from `.git` on your device and never uploaded.

## Current feature map

- [x] Local folder access
- [x] Project explorer
- [x] Project-wide search
- [x] Browser editor
- [x] Code ingest
- [x] Transform / combine / split
- [x] Diff / Compare
- [x] Markdown viewer
- [x] AST codebase indexing
- [x] Symbol definitions and references
- [x] Dependency and architecture analysis
- [x] Impact analysis (transitive, with confidence and blind spots)
- [x] Reference confidence and analysis coverage
- [x] Git change impact (uncommitted work or any commit) with Markdown report
- [x] API discovery
- [x] Security heuristics
- [x] Framework analyzers
- [x] Architecture health
- [x] Git metadata intelligence
- [x] AI (Codebase view)
- [x] Context Builder
- [x] IndexedDB index cache
- [x] Architecture diagrams
- [x] Documentation reports
- [x] In-app Help workspace

## Architecture

```
frontend/
├── index.html
├── vite.config.js            # base path, production CSP, test config
├── eslint.config.js / .prettierrc.json
├── playwright.config.js      # E2E against the production build
├── public/tools/             # sandboxed standalone tools + repomind-bridge.js
├── tests/e2e/                # Playwright suite
└── src/
    ├── main.jsx
    ├── App.jsx               # shell: navigation, folder access, editor state, lazy workspaces
    ├── components/           # ErrorBoundary, VirtualList
    ├── lib/                  # files/gitignore, diff, find/replace, transform, zip, markdown, text
    ├── features/
    │   ├── dashboard/  explorer/  search/  editor/  markdown/
    │   ├── ingest/  analysis/  transform/  compare/  tools/  help/
    │   └── codebase/CodebasePanel.jsx
    └── services/
        ├── repository.js     # AST indexing (Babel), references, dependencies
        ├── indexClient.js    # runs indexing in a Web Worker (indexWorker.worker.js)
        ├── analyzers.js      # analyzer contract, registry, runner and built-in analyzers
        ├── coverage.js       # per-language analysis coverage
        ├── impact.js         # transitive file and symbol impact, blind spots
        ├── changeImpact.js   # changed symbols → merged impact, broken references, report
        ├── gitObjects.js     # reads commits, trees and blobs from .git (loose and packed)
        ├── gitChanges.js     # changed files: working tree vs HEAD, commit vs parent
        ├── graphAccuracy.js  # scores the graph against graphFixtures.js
        ├── aiContext.js      # grounded AI context, file ranking, citation check
        ├── savedContexts.js  # saved context recipes (no source)
        ├── search.js  frameworks.js  health.js  documentation.js  diagram.js
        ├── git.js            # .git metadata, reflog and index (v2–v4) reader
        ├── indexCache.js     # IndexedDB cache
        └── ai.js             # provider adapters
```

There is no backend; the former FastAPI service was removed because the product runs entirely in the browser.

## Development

Requires Node.js 22.

```powershell
cd frontend
npm ci
npm run dev          # http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run build` | Production build (base `/RepoMind/`, with CSP) |
| `npm run preview` | Serve the production build at `http://127.0.0.1:4173/RepoMind/` |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Vitest unit tests for the services and shared libraries |
| `npm run test:e2e` | Build, then run Playwright against the production build |
| `npm run check` | Format check, lint, unit tests and build |
| `npm run bench:index` | Indexer benchmark on synthetic small/medium/large repositories (`-- --dir <folder>` for a real one) |

## Testing

- **Unit tests (Vitest)** cover `.gitignore` matching, folder walking, the line diff, find/replace, Transform bundles, AI request shapes, the IndexedDB cache (via `fake-indexeddb`), the repository indexer and incremental reuse, unified search, security redaction, the Git index parser (checked against indexes written by the `git` CLI), the Git object reader and change detection (checked against `git cat-file`, `git status` and `git diff` on repositories built with the `git` CLI), graph accuracy fixtures (exact expected dependency edges and reference links), transitive impact and change impact.
- **End-to-end tests (Playwright)** run against the production bundle served under `/RepoMind/`, so base-path, code-splitting and CSP problems are caught. An in-browser File System Access fixture stands in for the folder picker.

Run E2E locally:

```powershell
cd frontend
npx playwright install chromium
npm run test:e2e
```

The E2E suite (`npm run test:e2e` reports the current count) covers every workspace in the header (with heading assertions), the two-level header grouping, the Dashboard first-run workflow and its links into Codebase views, each Codebase view, Compare, Quick Analysis, Explorer, Search, Editor find/replace and the unsaved-changes guard, Ingest, Transform, Markdown + Mermaid rendering and sanitisation, index caching, dark mode, AI settings validation and the unsupported-browser notice. Browser-side AI calls are never made during tests.

## CI and deployment

- **CI** (`.github/workflows/CI.yml`) runs on pushes and pull requests to `main`: format check, lint, unit tests and build, then the E2E suite against that build. The Playwright HTML report is uploaded as an artifact. A newer push cancels the superseded run.
- **Deployment** (`.github/workflows/deploy-pages.yml`) publishes to GitHub Pages only after CI succeeds for a push to `main`, and builds exactly the commit CI verified. It can also be run manually.
- Protect `main` in the repository settings by requiring the **CI** checks to pass before merging.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Release notes are in [CHANGELOG.md](CHANGELOG.md).

## Upgrade journey

See **[docs/UPGRADE_JOURNEY.md](docs/UPGRADE_JOURNEY.md)** for the milestone history and architectural evolution, and **[docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md)** for the production-readiness audit and its resolution status.

## Milestones

### Milestone 1 — Codebase Intelligence v1
- [x] AST-backed indexing
- [x] Symbol definitions
- [x] Cross-file references
- [x] Imported-by analysis
- [x] Dependency graph
- [x] Architecture hotspots
- [x] Impact analysis
- [x] Context expansion

### Milestone 2 — Developer Intelligence v1
- [x] Advanced indexed/full-text search
- [x] API/route discovery
- [x] Security/secret heuristics
- [x] Framework/package detection
- [x] Architecture and impact navigation

### Milestone 3 — Git + AI Workspace v1
- [x] Local Git metadata
- [x] Branch/HEAD/remote signals
- [x] Working-tree signals
- [x] Recent reflog activity
- [x] Ask RepoMind prompt builder
- [x] Saved local context snapshots
- [x] AI Workspace

### Milestone 4 — Production Hardening + Performance
- [x] Cancellable indexing
- [x] Progress reporting
- [x] IndexedDB index cache
- [x] Cache clearing and cached/fresh state
- [x] Git → Impact navigation
- [x] State hardening

### Milestone 5 — AI + Advanced Code Intelligence v1
- [x] Direct browser-side provider adapters
- [x] OpenAI/OpenAI-compatible support
- [x] Anthropic support
- [x] Gemini support
- [x] Local AI settings
- [x] Architecture health signals

### Milestone 6 — Analyzer + Framework Intelligence v1
- [x] Analyzer registry
- [x] Framework structure analysis
- [x] Route discovery analyzer
- [x] Symbol resolution analysis
- [x] Architecture hotspot analyzer

### Milestone 7 — Documentation + Reporting v1
- [x] Project reports
- [x] Module reports
- [x] API/security findings in reports
- [x] Dependency hotspot summaries
- [x] Markdown copy/download

### Milestone 8 — Visualization + Cache Hardening v1
- [x] Circular cache serialization fix
- [x] Cached graph relationship rehydration
- [x] Lazy Mermaid renderer
- [x] SVG diagram preview
- [x] Diagram loading/error/re-render controls

### Milestone 9 — Production Readiness v1
- [x] Build repaired and deployment gated on CI
- [x] Compare and Project Analysis fixed
- [x] Modular source with Prettier, ESLint and Vitest
- [x] Lazy workspaces, Web Worker indexing, virtualised lists
- [x] Sandboxed embedded tools, bundled dependencies, production CSP
- [x] Dark mode, accessibility and error boundaries
- [x] E2E against the production build
- [x] Product navigation consolidated into Workspace + Analyze; unrelated legacy utilities removed
- [x] Proprietary LICENSE, SECURITY.md, CONTRIBUTING.md and CHANGELOG.md

### Help Workspace
- [x] Top-right Help entry
- [x] Feature catalogue
- [x] Detailed feature explanations
- [x] How-to guidance
- [x] Practical examples

## Product direction

RepoMind should remain focused on **codebase understanding and developer intelligence**.

Potential future areas:

- More precise language-aware symbol/reference resolution
- Better framework-specific analyzers
- Git diff/change-impact analysis
- More architecture visualization options
- Language and domain analyzer packs (e.g. Temenos) on the analyzer contract

## License

Copyright (c) 2026 Zainknoman Software Services. All rights reserved. See [LICENSE](LICENSE).
