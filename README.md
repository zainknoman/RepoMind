# RepoMind

**RepoMind is a local-first codebase intelligence workspace for developers.**

Open a local repository in the browser and use one workspace to **scan, explore, search, inspect, analyze, compare, transform and package codebase context** without uploading the project.

## Codebase Intelligence v1

The repository index is now the central local intelligence layer.

- **AST symbol analysis** for JavaScript, JSX, TypeScript and TSX using Babel parser.
- **Definitions** for functions, classes, interfaces, types, variables and methods.
- **Symbol references** with conservative cross-file resolution.
- **Imported-by intelligence** showing which files/bindings consume a symbol.
- **Import/export mapping** including named, default and namespace imports.
- **Dependency graph** resolving relative imports to indexed files.
- **Architecture hotspots** ranked by incoming/outgoing dependency relationships.
- **Circular dependency detection**.
- **Project profile** with basic framework/language signals.
- **Codebase health** for unresolved imports/references and parser errors.
- **Impact analysis** for files and their symbols.
- **Context Builder** with optional direct dependencies/importers and token estimation.
- **Local-first privacy model** — repository source is processed in the browser.
- **Advanced indexed search** across symbols, files, dependencies and source text.
- **API / route discovery** for common Express, NestJS, FastAPI, Flask, Spring and ASP.NET patterns.
- **Security / secret scanning** using local heuristics for likely credentials, keys and connection strings.
- **Package intelligence** from package.json with common framework/library detection.
- **Mermaid architecture export** for repository dependency graphs.\n- **Architecture health** with dependency hotspots, cycles, unresolved references/imports and parser-error signals.\n- **Analyzer registry** with extensible framework, symbol-resolution and architecture analyzers.\n- **Direct AI Workspace providers** for OpenAI, OpenAI-compatible endpoints, Anthropic and Gemini; provider keys remain browser-local.
- **Architecture hotspot and impact navigation** without a server-side index.
- **Documentation & Reports** for project architecture, technology profile, dependency hotspots, API surface, security findings and module summaries.
- **Dedicated Health and Analyzer workspaces** exposed directly from Codebase Intelligence.
- **Markdown report export** generated entirely from the local index.

### Intelligence flow

    Open Folder
        ↓
      Scan
        ↓
      Index
        ├── Files / Languages
        ├── AST Symbols
        ├── Definitions
        ├── References
        ├── Imports / Exports
        └── Dependency Graph
                ↓
       ┌────────┼─────────┐
       ↓        ↓         ↓
    Search   Impact   Architecture
       └────────┼─────────┘
                ↓
        Context Builder
                ↓
             Export

## Milestone 3 — Git + AI Workspace

- [x] Local Git metadata detection without indexing `.git` contents
- [x] Branch, HEAD, remote and working-tree status signals
- [x] Recent local Git activity from reflog metadata
- [x] Provider-neutral Ask RepoMind prompt builder
- [x] Context snapshots stored locally in browser storage
- [x] Context export/copy for external AI providers
- [x] Shared context selection between Codebase Intelligence and AI Workspace
- [x] Git and AI workspace refresh/error handling

> Git status is intentionally conservative: browser File System Access exposes repository files but does not provide a native `git status` command. RepoMind reads `.git` metadata locally, never indexes `.git` contents, and uses filesystem timestamps only as a probable-modified signal.

## Upgrade Journey

See [docs/UPGRADE_JOURNEY.md](docs/UPGRADE_JOURNEY.md) for the milestone-by-milestone product evolution and commit history.

## Existing workspaces

- Explorer
- Search
- Editor
- Code Ingest
- Analyze
- Transform
- Diff / Compare
- Markdown
- Developer Tools
- Temenos / OFS
- T24 Log Analyzer
- Engineering Utilities

## Architecture

    frontend/src/
    ├── main.jsx
    ├── App.jsx
    ├── features/
    │   └── codebase/
    │       └── CodebasePanel.jsx
    ├── services/
    │   ├── repository.js
    │   ├── intelligence.js
    │   ├── git.js
    │   └── indexCache.js
    └── styles.css

The repository service is browser-safe and keeps the core source workflow local. The index is an in-memory graph derived from the selected folder and can be cached as local analysis metadata in IndexedDB.

## Local development

    cd frontend
    npm install
    npm run dev

Use a current Chromium-based browser such as Chrome or Edge and click **Open Folder**.

## Product roadmap

### Milestone 1 — Codebase Intelligence v1
- [x] AST-backed indexing
- [x] Symbol definitions
- [x] Cross-file references
- [x] Imported-by analysis
- [x] Dependency graph
- [x] Architecture hotspots
- [x] Impact analysis
- [x] Context expansion

### Milestone 2 — Developer Intelligence
- [x] Architecture diagram / Mermaid export
- [x] Advanced code search and navigation
- [x] API/route discovery
- [x] Security/content scanning
- [x] Framework/package detection
- [x] Git metadata, branch and working-tree intelligence
- [x] Recent Git activity metadata

### Milestone 4 — Production Hardening + Intelligence Performance
- [x] Cancellable index builds with progress
- [x] IndexedDB local index cache
- [x] Cached/fresh index state and cache clearing
- [x] Git status → file impact navigation
- [x] Codebase state regression hardening

### Milestone 6 — Analyzer + Framework Intelligence v1\n- [x] Extensible analyzer registry\n- [x] Framework structure analysis\n- [x] Unified route discovery analyzer\n- [x] Symbol resolution status analysis\n- [x] Architecture hotspot analyzer\n- [x] Analyzer workspace UI\n\n### Milestone 5 — AI + Advanced Code Intelligence v1\n- [x] Direct browser-side AI provider adapter layer\n- [x] OpenAI and OpenAI-compatible chat completion support\n- [x] Anthropic Messages support\n- [x] Google Gemini generateContent support\n- [x] Local provider/model/endpoint/API-key settings\n- [x] AI response workspace using RepoMind context\n- [x] Architecture health and dependency hotspot signals\n- [x] Upgrade Journey tracking\n\n### Milestone 3 — Git + AI Workspace
- [x] Provider-neutral AI integration surface
- [x] Ask RepoMind prompt builder
- [x] Symbol/file-aware context selection
- [x] Saved context snapshots
- [x] Git repository intelligence
- [ ] Direct hosted AI provider connections
- [ ] Plugin/analyzer architecture

**Scan → Search → Inspect → Analyze → Transform → Document → Understand → Export**

## Milestone 7 — Documentation + Reporting v1

- [x] Documentation report service
- [x] Project architecture/technology report
- [x] Module-level report generation
- [x] API and security findings included when available
- [x] Dependency hotspot and review-area summaries
- [x] Copy/download Markdown reports
- [x] Dedicated Health and Analyzer workspace tabs
- [x] Frontend version 0.7.0
