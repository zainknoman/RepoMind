# Changelog

All notable changes to RepoMind are recorded here.

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
