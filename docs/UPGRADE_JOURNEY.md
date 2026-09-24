# RepoMind Upgrade Journey

This document records the major product upgrades, architectural decisions and milestone commits for the RepoMind evolution from a local developer toolbox into a local-first codebase intelligence workspace.

## 2026-09-23 — Baseline / Developer Tools

- Consolidated Developer Tools actions around **Clear + Run** rather than separate operation buttons.
- Preserved local/browser-first processing.
- Established the direction toward a unified developer workspace.

## Milestone 1 — Codebase Intelligence v1

**Commit:** `fa2182bdf8eaa01ddc214d0365ace95a4358827c`

Implemented the first central intelligence layer:

- Repository indexing in the browser.
- Babel AST analysis for JS / JSX / TS / TSX with fallback parsing.
- Symbol definitions for functions, classes, interfaces, types, variables and methods.
- Import/export mapping and relative dependency resolution.
- Cross-file reference and imported-by intelligence.
- Circular dependency detection.
- Architecture hotspots and impact analysis.
- Project/language signals and health metrics.
- Token-aware Context Builder.
- Grouped application navigation and Codebase workspace.
- Local-only source processing.

## Milestone 2 — Developer Intelligence v1

**Commit:** `b21dfcbdf09c0e3fefba8fc224f461ce2ed61c25`

Added higher-level developer intelligence:

- Indexed and full-text search.
- API / route discovery for common web frameworks.
- Local heuristic security/secret scanning.
- Package and framework intelligence.
- Mermaid architecture/dependency export.
- Architecture and impact navigation.
- Explicitly kept Git history/status out of this milestone until a browser-safe design was available.

## Milestone 3 — Git + AI Workspace v1

**Commit:** `db20ba73463ded382af3d55201883d783f2a8664`

Extended RepoMind into a developer workspace:

- Local `.git` metadata detection without indexing `.git` contents.
- Branch, HEAD and remote detection.
- Working-tree status signals.
- Recent reflog activity.
- Provider-neutral Ask RepoMind prompt generation.
- Context snapshots stored locally.
- AI prompt/context copy and export.
- Shared Codebase Context Builder → AI Workspace flow.

## Milestone 4 — Production Hardening + Intelligence Performance

**Commit:** `1c8bb834c928a92b70142a93fddfde94b11c3c8e`

This milestone hardens the browser-first architecture and connects Git changes to code impact:

- Fixed the Codebase Intelligence state wiring regression introduced during Milestone 3.
- Added cancellable repository indexing with progress reporting.
- Added IndexedDB-backed local index caching.
- Restored cached indexes automatically when the same repository structure is reopened.
- Added explicit fresh/cached index state and cache clearing.
- Added Git-file → Impact navigation for modified, untracked and deleted files.
- Added repository package version/check script metadata.
- Kept all source processing local; cached index data remains browser-local.
- Preserved conservative Git status semantics and avoided indexing Git object contents.

### Production boundaries

- IndexedDB stores analysis metadata, not source files independently of the selected local folder.
- Cached indexes are reattached to the currently opened folder before source-dependent operations run.
- A fresh index remains available through **Build / Refresh Index**.
- Git status remains a heuristic because browser File System Access does not expose native Git commands.
- Security/API analyzers remain heuristic analyzers, not full security or framework compilers.

## Milestone commit history

| Milestone | Commit | Status |
|---|---|---|
| Baseline / Developer Tools | `422177c8606816d1d406a28e0c74b0f44a05b686` | Completed |
| Codebase Intelligence v1 | `fa2182bdf8eaa01ddc214d0365ace95a4358827c` | Completed |
| Developer Intelligence v1 | `b21dfcbdf09c0e3fefba8fc224f461ce2ed61c25` | Completed |
| Git + AI Workspace v1 | `db20ba73463ded382af3d55201883d783f2a8664` | Completed |
| Production Hardening + Intelligence Performance | `1c8bb834c928a92b70142a93fddfde94b11c3c8e` | Completed |

## Product evolution

```
Developer Toolbox
      ↓
Local Code Workspace
      ↓
Codebase Intelligence
      ↓
Developer Intelligence
      ↓
Git + AI Workspace
      ↓
Production-grade Local Code Intelligence
```

## Milestone 5 — AI + Advanced Code Intelligence v1

**Commit:** `1e540dc2e87c42ee1a3d0f4a793fc047a3811731`

Completed direct provider adapters, AI Workspace responses, architecture health signals and local AI settings.

## Next planned direction

- Direct AI provider adapters while preserving provider-neutral context generation.
- More precise symbol/reference resolution.
- Framework-aware analyzers.
- Architecture health and dependency risk signals.
- Plugin/analyzer architecture.
- More complete Git history and change-impact analysis where browser-safe APIs permit it.

## Milestone 5 — AI + Advanced Code Intelligence v1

**Implementation branch:** `milestone/ai-advanced-intelligence-v1`

Planned for this milestone:

- Direct browser-side AI provider adapters for OpenAI, OpenAI-compatible endpoints, Anthropic and Google Gemini.
- Local AI settings with provider/model/endpoint/API key controls.
- AI Workspace responses generated from the selected RepoMind context.
- Architecture health signals for unresolved imports/references, cycles, parser errors, external imports and dependency hotspots.
- Dedicated Architecture Health workspace.
- Continued conservative, browser-local analysis and explicit provider-call boundaries.
- Documentation of direct-provider privacy/CORS limitations.


## Milestone 6 — Analyzer + Framework Intelligence v1

**Implementation branch:** `milestone/analyzer-framework-v1`

- Registered analyzer architecture for extensible local analyzers.
- Framework structure analyzer for React, Vue, NestJS, Spring, ASP.NET, FastAPI and Flask patterns.
- Unified route discovery analyzer.
- Symbol-resolution analyzer separating resolved, ambiguous and unresolved references.
- Architecture hotspot analyzer exposed through the analyzer registry.
- Dedicated Analyzer workspace and registry UI.
- Preserved browser-local source processing and explicit analyzer execution.



## Milestone 7 — Documentation + Reporting v1

**Implementation branch:** `milestone/documentation-reports-v1`

- Added local Markdown project reports generated from the indexed repository graph.
- Added module reports covering language, size, symbols, imports, exports and resolved dependencies.
- Added optional API discovery and security findings to project reports.
- Added dependency hotspot and heuristic review-area summaries.
- Added copy/download actions for generated reports.
- Exposed the existing Architecture Health and Analyzer Registry workspaces directly in the Codebase tabs.
- Bumped frontend version to 0.7.0.

### Product direction after Milestone 7

`Scan → Search → Inspect → Analyze → Transform → Document → Understand → Export`

RepoMind now has a first-class **Document** stage that converts local codebase intelligence into reusable Markdown artifacts without uploading repository source.


## Milestone 8 — Visualization + Cache Hardening v1

**Implementation branch:** `milestone/visualization-cache-hardening-v1`

- Fixed IndexedDB cache serialization for symbol/reference graphs that contain object back-references.
- Added cache-link rehydration so cached references and imported-by relationships point back to canonical index objects after restore.
- Prevented circular graph structures from breaking cache persistence.
- Replaced the Diagram tab's source-only preview with an actual Mermaid.js SVG renderer.
- Mermaid.js is loaded lazily only when the Diagram tab is opened; repository source remains local.
- Added explicit render status/error handling and re-render controls.
- Bumped frontend version to 0.8.0.

### Product direction after Milestone 8

`Scan → Search → Inspect → Analyze → Visualize → Transform → Document → Understand → Export`

RepoMind now treats architecture visualization as a first-class workspace rather than only exporting Mermaid source.
