# RepoMind

**RepoMind is a local-first codebase intelligence workspace for developers.**

It turns a selected local repository into a browser-based workspace for:

**Scan → Search → Inspect → Analyze → Visualize → Transform → Document → Understand → Export**

RepoMind is designed to help developers understand an unfamiliar codebase, trace dependencies, inspect symbols, review changes, generate context and documentation, and work with common developer utilities without uploading the repository.

**Current version:** 0.9.0 (see [CHANGELOG.md](CHANGELOG.md)) · **Live:** https://zainknoman.github.io/RepoMind/

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
| Firefox, Safari, mobile browsers | Folder access unavailable (no File System Access API). RepoMind shows a notice; the Markdown viewer and the Developer Tools (under **Tools**) still work. |

Folders with more than 50,000 files are truncated with a warning; open a subfolder for complete results. Files larger than 2 MB, and sensitive-looking files (`.env`, keys, credentials) unless **Include sensitive files** is ticked, are listed but not read.

## Workspace guide

The header groups follow one workflow: **Understand → Explore → Analyze**, with a small secondary **Tools** group at the far end. RepoMind is a codebase intelligence workspace, not a utility collection, so Tools is deliberately kept short.

### Understand

| Workspace | Purpose |
|---|---|
| **Dashboard** | The investigation starting point. Shows the workflow (Open → Index → Understand → Investigate → Analyze → Report / AI), builds or restores the code index, and lists what needs attention (unresolved imports, cycles, hotspots, parser errors) with links into Codebase. The repository profile (composition, structure, quality signals, file list) follows below. |
| **Codebase** | The centre of RepoMind: symbols, references, dependencies, impact, health, analyzers, Git, diagrams, reports, context and AI. |

### Explore

| Workspace | Purpose |
|---|---|
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

### Tools

| Workspace | Purpose | Deep link |
|---|---|---|
| **Developer Tools** | JSON Formatter, Text Cleanup, Base64, Regex, JWT Decoder (decode only), UUID and Timestamp utilities. | `?tool=json`, `text`, `base64`, `regex`, `jwt`, `uuid`, `timestamp` |
| **Temenos / OFS** | OFS Generator and T24 Log Analyzer (sandboxed). | `?tool=ofs` |
| **Markdown** | Render Markdown, including Mermaid diagrams. | — |

The **Engineering** utilities (sandboxed) are intentionally not in the header. They open only from `?tool=eng`.

## Codebase Intelligence

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

### Dependencies and architecture

The Codebase workspace can identify:

- dependency edges,
- dependents,
- circular dependencies,
- dependency hotspots,
- unresolved relative imports,
- external dependencies,
- architecture relationships.

The **Impact** workspace uses this information to help inspect the likely affected area around a file or symbol.

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

The analyzer registry provides framework-aware analysis for patterns used by:

- React
- Vue
- NestJS
- Spring
- ASP.NET
- FastAPI
- Flask

These analyzers are intentionally heuristic and should not be treated as a replacement for a compiler, linter or dedicated security scanner.

### API discovery

Run from **Analyzers → API / Route Discovery**. RepoMind detects common route declarations for:

- Express
- NestJS
- FastAPI
- Flask
- Spring
- ASP.NET

Results are intended for code navigation and architecture understanding.

### Security scanning

Run from **Analyzers → Security / Secret Scan**. The local security scanner searches for likely:

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

RepoMind reads selected Git metadata locally without indexing or uploading Git object contents.

Available signals include:

- current branch,
- HEAD,
- remote information,
- working-tree file signals,
- recent reflog activity.

Git status is intentionally conservative because browser File System Access does not expose the native `git status` command. Filesystem timestamps are used as probable-modified signals.

## AI

RepoMind provides a provider-neutral context workflow and direct browser-side adapters for:

- OpenAI
- OpenAI-compatible endpoints
- Anthropic
- Google Gemini

The **AI** view can use selected files, symbols and dependencies from the local Codebase index.

To call a provider, open **AI Settings** and enter the provider, a **model ID** (required; RepoMind does not guess one) and an API key.

- Provider, model and endpoint are remembered in `localStorage`. The **API key is kept only in `sessionStorage`** and is forgotten when the tab closes.
- External AI calls happen only when you click **Ask AI**; indexing never sends source to a provider.
- The production Content Security Policy allows direct calls to `api.openai.com`, `api.anthropic.com` and `generativelanguage.googleapis.com`. An OpenAI-compatible endpoint on another host must be added to `connect-src` in `frontend/vite.config.js`.
- Provider availability also depends on each provider's browser/CORS policy.

## Context Builder

Context Builder creates focused, token-aware Markdown context from selected files and related dependencies.

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
- The embedded Temenos/OFS and Engineering tools run in an **opaque-origin sandbox**. They cannot read RepoMind's storage (including the AI key) or navigate the app, and they have no network access. They exchange two allow-listed settings with RepoMind through a `postMessage` bridge.
- Security-scan findings mask the matched secret value, so reports never repeat a credential.
- The only outbound requests are AI provider calls that you explicitly trigger.

## Current feature map

- [x] Local folder access
- [x] Project explorer
- [x] Project-wide search
- [x] Browser editor
- [x] Code ingest
- [x] Transform / combine / split
- [x] Diff / Compare
- [x] Developer utilities
- [x] Temenos / OFS utilities
- [x] T24 Log Analyzer
- [x] Markdown viewer
- [x] Engineering utilities
- [x] AST codebase indexing
- [x] Symbol definitions and references
- [x] Dependency and architecture analysis
- [x] Impact analysis
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
        ├── intelligence.js   # search, API discovery, security scan, packages, diagrams
        ├── analyzers.js  health.js  documentation.js  diagram.js
        ├── git.js            # .git metadata and index (v2–v4) reader
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

- **Unit tests (Vitest)** cover `.gitignore` matching, folder walking, the line diff, find/replace, Transform bundles, developer tools, the embedded-tool bridge, AI request shapes, the IndexedDB cache (via `fake-indexeddb`), the repository indexer and incremental reuse, unified search, security redaction and the Git index parser (checked against indexes written by the `git` CLI).
- **End-to-end tests (Playwright)** run against the production bundle served under `/RepoMind/`, so base-path, code-splitting and CSP problems are caught. An in-browser File System Access fixture stands in for the folder picker.

Run E2E locally:

```powershell
cd frontend
npx playwright install chromium
npm run test:e2e
```

The E2E suite (57 tests) covers every workspace in the header (with heading assertions), the header grouping (including Engineering staying out of it), the Dashboard first-run workflow and its links into Codebase views, each Codebase view, Compare, Quick Analysis, Explorer, Search, Editor find/replace and the unsaved-changes guard, Ingest, Transform, Markdown + Mermaid rendering and sanitisation, Developer Tools opened by deep link, the sandboxed tools and their bridge, index caching, dark mode, AI settings validation and the unsupported-browser notice. Browser-side AI calls are never made during tests.

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
- [x] Tools menu hidden from the header (opened by `?tool=` deep links)
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
- Incremental (per-file) re-indexing for very large projects
- Optional plugin/analyzer architecture

## License

Copyright (c) 2026 Zainknoman Software Services. All rights reserved. See [LICENSE](LICENSE).
