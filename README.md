# RepoMind

**RepoMind is a local-first codebase intelligence workspace for developers.**

Open a local repository in the browser and use one workspace to **scan, explore, search, inspect, analyze, compare, transform and package codebase context** without uploading the project.

## P0 capabilities

- **Repository Index** — one reusable local index for files, languages, lines, symbols, imports and exports.
- **Dependency Graph** — resolves relative imports into deterministic file-to-file edges.
- **Impact Lookup** — inspect a file's direct dependencies and importers.
- **Cycle Detection** — identifies circular dependency paths in the indexed graph.
- **Symbol Index** — functions, arrow functions, classes, interfaces and types for supported source formats.
- **Token Estimation** — approximate context size using a local character/token heuristic.
- **Context Builder** — select a subset of files, preview token budget, generate Markdown/text context and download/copy it.
- **Grouped Workspace Navigation** — Workspace, Build and Tools areas keep the application coherent as functionality grows.
- **Local-first privacy model** — the core repository workflow uses the browser File System Access API; source is not uploaded by RepoMind.
- Existing capabilities remain available: Explorer, Search, Editor, Code Ingest, Transform, Diff/Compare, Markdown, Developer Tools, OFS Generator, T24 Log Analyzer and Engineering Utilities.

## Architecture

The frontend now has a thin `main.jsx` entry point and a reusable repository intelligence service:

    frontend/src/
    ├── main.jsx
    ├── App.jsx
    ├── features/
    │   └── codebase/
    │       └── CodebasePanel.jsx
    ├── services/
    │   └── repository.js
    └── styles.css

The intended data flow is:

    Local Folder
        ↓
    Repository Index
        ├── Files
        ├── Symbols
        ├── Imports / Exports
        ├── Dependency Edges
        └── Token Estimates
              ↓
       ┌──────┼────────┬─────────┐
       ↓      ↓        ↓         ↓
     Search Symbols Dependencies Context

The P0 parser is deliberately dependency-free and browser-safe. It currently performs deterministic source-structure extraction using language-aware patterns. A future AST engine can replace the extraction layer without changing the index/UI contract.

## Local development

    cd frontend
    npm install
    npm run dev

Use a current Chromium-based browser such as Chrome or Edge and click **Open Folder**.

## Deployment

The frontend is designed for static GitHub Pages deployment. Vite uses the `/RepoMind/` base path.

The FastAPI backend in `backend/` remains available for future optional server-side capabilities.

## Product direction

**Scan → Search → Inspect → Analyze → Transform → Document → Understand → Export**

RepoMind is intentionally broader than a repository-to-text packer: the long-term goal is a local-first codebase intelligence workspace that understands the structure of a project and can produce focused developer/AI context from it.
