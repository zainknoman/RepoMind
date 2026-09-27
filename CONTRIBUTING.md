# Contributing to RepoMind

## Setup

Requires Node.js 22.

```powershell
cd frontend
npm ci
npx playwright install chromium
npm run dev
```

## Before opening a pull request

Run the same checks as CI:

```powershell
cd frontend
npm run check      # format check, lint, unit tests, production build
npm run test:e2e   # Playwright against the production build
```

`npm run format` fixes formatting.

## Guidelines

- **Keep it local-first.** Features must work without a backend and must not send repository content
  anywhere unless the user explicitly asks (as with **Ask AI**).
- **No third-party scripts or CDNs.** Add dependencies through npm with an exact version, and load
  heavy ones lazily (`import()`), as Mermaid and JSZip are.
- **Respect the Content Security Policy.** New network destinations must be added to `connect-src` in
  `frontend/vite.config.js` with a justification in the pull request.
- **Structure.** Workspaces live in `src/features/<name>/`, shared pure logic in `src/lib/`, and
  repository analysis in `src/services/`. Keep logic in plain functions so it can be unit-tested.
- **Tests.** Add Vitest tests for new logic (`*.test.js` next to the code) and Playwright coverage for
  new user-visible behaviour. Prefer role/label locators; note that the Codebase panel stays mounted
  (hidden) after first use, so scope text locators to the visible workspace.
- **Embedded tools** (`public/tools/`) are standalone pages that run sandboxed. Use
  `RepoMindBridge` for persistence instead of `localStorage`, and escape any user or log content
  before inserting it as HTML.

## Commits and releases

Write focused commits with descriptive messages. Record user-visible changes in `CHANGELOG.md` and
bump the version in `frontend/package.json` for releases.
