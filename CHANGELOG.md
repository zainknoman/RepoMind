# Changelog

All notable changes to RepoMind are recorded here.

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
