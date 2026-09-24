# RepoMind

**RepoMind is a local-first codebase intelligence workspace for developers.**

It turns a selected local repository into a browser-based workspace for:

**Scan → Search → Inspect → Analyze → Visualize → Transform → Document → Understand → Export**

RepoMind is designed to help developers understand an unfamiliar codebase, trace dependencies, inspect symbols, review changes, generate context and documentation, and work with common developer utilities without uploading the repository.

## Core principles

- **Local-first:** repository files are processed in the browser.
- **No backend required for the core workflow:** open a local folder with the browser File System Access API.
- **Explicit external AI:** AI provider calls happen only when the user chooses to run them.
- **Heuristic where appropriate:** security, route discovery, Git status and some framework analysis are signals rather than full compiler/security audits.
- **One workspace:** exploration, intelligence, transformation and documentation are connected instead of being separate utilities.

## Getting started

1. Open RepoMind in a supported Chromium browser such as Chrome or Edge.
2. Click **Open Folder**.
3. Select a local project directory.
4. Start with **Overview** for a quick project summary.
5. Use **Codebase → Build / Refresh Index** for deeper code intelligence.
6. Open **Help** in the top-right corner for feature-by-feature guidance.

## Workspace guide

### Workspace

| Workspace | Purpose |
|---|---|
| **Overview** | Project summary, file statistics and local-first status. |
| **Codebase** | Central code intelligence: symbols, references, dependencies, health, analyzers, Git, AI, reports and diagrams. |
| **Explorer** | Browse and filter local project files. |
| **Search** | Search source text and jump to matching files/lines. |
| **Editor** | Edit supported text files with find/replace and local save. |

### Build

| Workspace | Purpose |
|---|---|
| **Ingest** | Generate a Gitingest-style summary, directory tree and combined source context. |
| **Analyze** | Run project-level analysis. |
| **Transform** | Combine/split text artifacts and export or ZIP results. |
| **Compare** | Review differences between text content/files. |

### Tools

| Workspace | Purpose |
|---|---|
| **Developer Tools** | JSON Formatter, Text Cleanup, Base64, Regex, JWT Decoder, UUID and Timestamp utilities. |
| **Temenos** | OFS Generator and T24 Log Analyzer workflows. |
| **Markdown** | Render Markdown and Mermaid documentation. |
| **Engineering** | Engineering-oriented calculations and conversion utilities. |

## Codebase Intelligence

Codebase is the main RepoMind workspace.

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

Codebase provides indexed/full-text search across the local project, including source text and intelligence metadata.

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

RepoMind detects common route declarations for:

- Express
- NestJS
- FastAPI
- Flask
- Spring
- ASP.NET

Results are intended for code navigation and architecture understanding.

### Security scanning

The local security scanner searches for likely:

- API keys
- access/auth/bearer tokens
- passwords and secrets
- private keys
- database connection strings
- common credential environment variables

**Important:** matches are heuristic findings and can include false positives. Review the source manually before taking action.

## Architecture visualization

The **Diagram** workspace generates Mermaid dependency diagrams from the local codebase graph.

Mermaid is loaded lazily only when visualization is requested. The rendered result is displayed as SVG with:

- Generate
- Re-render
- Copy
- Download
- Error/loading feedback

If network access to the Mermaid CDN is unavailable, the diagram renderer may fail even though the repository analysis remains local.

## Git intelligence

RepoMind reads selected Git metadata locally without indexing or uploading Git object contents.

Available signals include:

- current branch,
- HEAD,
- remote information,
- working-tree file signals,
- recent reflog activity.

Git status is intentionally conservative because browser File System Access does not expose the native `git status` command. Filesystem timestamps are used as probable-modified signals.

## AI Workspace

RepoMind provides a provider-neutral context workflow and direct browser-side adapters for:

- OpenAI
- OpenAI-compatible endpoints
- Anthropic
- Google Gemini

The AI workspace can use selected files, symbols and dependencies from the local Codebase index.

API keys and provider settings are stored in browser storage. External AI calls are explicit user actions; the normal indexing workflow does not send repository source to an AI provider.

Provider availability can also depend on browser/network/CORS policies.

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

RepoMind can cache the index metadata in IndexedDB to make repeated work faster.

The cache:

- stores analysis metadata rather than independently uploading repository source,
- excludes file handles,
- serializes circular symbol/reference relationships into stable keys,
- rehydrates relationships when the repository is reopened,
- can be cleared from the Codebase workspace.

A fresh **Build / Refresh Index** remains available whenever you want to regenerate the analysis.

## Privacy model

For the normal local workflow:

`Local Folder → Browser → Local Index → Local UI`

RepoMind does not require a server to process the core repository workflow.

External services are involved only when you explicitly use functionality that requires them, such as a configured AI provider or the lazy Mermaid CDN renderer.

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
- [x] AI Workspace
- [x] Context Builder
- [x] IndexedDB index cache
- [x] Architecture diagrams
- [x] Documentation reports
- [x] In-app Help workspace

## Architecture

```
frontend/src/
├── main.jsx
├── App.jsx
├── features/
│   └── codebase/
│       └── CodebasePanel.jsx
├── services/
│   ├── repository.js
│   ├── intelligence.js
│   ├── analyzers.js
│   ├── documentation.js
│   ├── diagram.js
│   ├── git.js
│   └── indexCache.js
└── styles.css
```

## Local development

```powershell
cd frontend
npm install
npm run dev
```

For a production build:

```powershell
npm run build
```

## Upgrade journey

See **[docs/UPGRADE_JOURNEY.md](docs/UPGRADE_JOURNEY.md)** for the milestone history and architectural evolution.

Current product direction:

`Scan → Search → Inspect → Analyze → Visualize → Transform → Document → Understand → Export`

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
- Larger-project indexing performance
- Optional plugin/analyzer architecture
