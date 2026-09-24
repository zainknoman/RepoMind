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
- **Mermaid architecture export** for repository dependency graphs.
- **Architecture hotspot and impact navigation** without a server-side index.

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
    │   └── repository.js
    └── styles.css

The repository service is browser-safe and keeps the core source workflow local. The index is an in-memory graph derived from the selected folder.

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
- [ ] Git status and history

### Milestone 3 — AI Workspace
- [ ] Provider-neutral AI integration
- [ ] Ask RepoMind
- [ ] Symbol-aware context selection
- [ ] Saved snapshots/reports
- [ ] Plugin/analyzer architecture

**Scan → Search → Inspect → Analyze → Transform → Document → Understand → Export**