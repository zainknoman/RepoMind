# RepoMind — Product Readiness Audit

- **Date:** 2026-09-27
- **Scope:** entire repository (frontend, services, tests, CI/CD, docs)
- **Local state at audit time:** `main` at `185d8fe`, mid-merge with `origin/main` (`efee89f`)
- **Method:** read-only. Every recent commit was built in isolation to find where the build breaks. The Playwright suite was run against the last commit that builds (`58302fa`). Suspect regexes were executed against sample input. CI run history was pulled from the GitHub API. All sources were read in formatted scratch copies.

## Verdict

**Not ready for production.** The deployed GitHub Pages site is serving a stale build, `origin/main` does not compile, and the local working tree is in an unfinished merge. Underneath that, the Codebase Intelligence core is solid: 24 of 25 E2E tests pass on the last commit that builds.

## Architecture summary

- **Stack:** React 19 + Vite 8, deployed to GitHub Pages at `/RepoMind/`. There is no backend; the old FastAPI backend is deleted in the staged changes.
- **Data flow:** local folder → File System Access API (Chromium only) → in-browser index → UI. The index is cached in IndexedDB.
- **Code layout:**
  - `frontend/src/App.jsx`: the app shell plus about 15 workspaces (Dashboard, Explorer, Search, Editor, Ingest, Project Analysis, Transform, Compare, Markdown, Tools, OFS, Engineering, Help).
  - `frontend/src/features/codebase/CodebasePanel.jsx`: Codebase Intelligence, with 14 sub-tabs.
  - `frontend/src/services/*.js`: AST indexing (`@babel/parser`), analyzers, Git metadata reader, index cache, AI provider adapters (OpenAI, Anthropic, Gemini), Mermaid diagrams, reports.
  - `frontend/public/tools/*.html`: standalone embedded tools (OFS Generator, T24 Log Analyzer, Engineering Utilities) loaded in iframes.
- **Auth:** none; the app is local-only. AI API keys are held in the browser's `sessionStorage`.
- **CI:** `CI.yml` (build), `repomind-e2e.yml` (Playwright), `deploy-pages.yml` (Pages deploy).

## Build status by commit

| Commit | Description | `vite build` |
|---|---|---|
| `d54455a` | Style interactive repository dashboard | ✅ |
| `d180b4a` | Add interactive repository dashboard | ✅ |
| `06a6670` | Publish repository dashboard to main | ✅ |
| `58302fa` | Update E2E tests for current navigation | ✅ **last commit that builds** |
| `05ebaee` | Expand repository dashboard analytics and charts | ❌ first broken commit |
| `442031a`, `b3d6458`, `06cf7c1` | Dashboard analytics follow-ups | ❌ |
| `efee89f` | Fix production build and harden local analysis (`origin/main`) | ❌ |
| `185d8fe` | Local `HEAD` (before merge) | ✅ |

GitHub Actions on `efee89f`: **CI failed, Deploy to Pages failed, E2E cancelled.** The live site (HTTP 200) is therefore serving an older build.

---

## A. What works

The E2E suite passes these on `58302fa`, the last commit that builds (24 of 25 tests pass):

- **Codebase Intelligence:** AST index, symbols and references, architecture and dependency hotspots, health, analyzer registry, impact analysis, API discovery (Express, FastAPI, Spring, ASP.NET), security heuristics, Mermaid architecture diagram, Git metadata, project reports, Context Builder, AI prompt building without a provider.
- **Other working parts:**
  - Help workspace and the top-level navigation.
  - Cancellable indexing with progress.
  - Markdown sanitised with DOMPurify, and Mermaid set to `securityLevel: "strict"`.
- **Changes in `efee89f`** (the latest commit on `origin/main`) that are good and should be kept:
  - Dependencies are pinned (no more `latest`) and CI uses `npm ci`.
  - The AI API key moved from `localStorage` to `sessionStorage`.
  - The Gemini key moved from the URL query string into the `x-goog-api-key` header.
  - `.gitignore` rules are respected when a folder is opened.
  - Sensitive files are excluded by default, with an opt-in toggle, and files over 2 MB are treated as non-text.
  - Invalid regex search input is handled instead of throwing.
  - Branch names containing slashes are read correctly.
  - Iframe paths use `BASE_URL`, so they work in both dev and production.
  - More secret-detection patterns (AWS, GitHub, Slack, Stripe).
  - Code-block language names are HTML-escaped in rendered Markdown.

## B. Partially working

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| B1 | High | **AI calls fail unless the user types a model name.** `efee89f` emptied every provider's `models: []`. Anthropic and Gemini then send `model: undefined`, which the APIs reject. OpenAI silently falls back to `gpt-4o-mini`. | `frontend/src/services/ai.js`: `AI_PROVIDERS`, and `settings.model \|\| provider.models[0]` in `callAnthropic` and `callGemini` | Make the model a required field with validation, or ship current default models for each provider. Show a clear error before the request is sent. |
| B2 | Medium | **The Codebase panel loses its state when you switch tabs.** It only exists while its tab is open, so every switch reloads the index from cache. That reload recomputes the cache key by reading metadata for every file. AI responses, search results and analyzer results are also lost. | `frontend/src/App.jsx`: `{tab==='codebase'&&<CodebasePanel project={p}/>}`; `frontend/src/services/indexCache.js`: `projectKey` | Lift the index state into `App` or a React context, or keep the panel mounted and hide it with CSS. |
| B3 | Medium | **Clicking a code search result does nothing.** `onOpenFile` is never passed to `CodebasePanel`. An invalid-regex error result is shown as `undefined:undefined`. | `CodebasePanel.jsx`: `onOpenFile?.(project.files.find(...), true)`; `intelligence.js`: `searchCode` returns `[{type:'error', message}]` | Pass `open` from `App` as `onOpenFile`, and render `type === 'error'` results as an error message. |
| B4 | Medium | **The "Cancel" button appears during prompt and context building,** because indexing and those actions share one `busy` flag. Pressing it cancels nothing. | `CodebasePanel.jsx`: `busy` is set by `indexProject`, `generateContext` and `buildPrompt`; the button uses `busy ? cancelIndex : indexProject` | Give indexing its own state (`indexing`) and use a separate flag for context and prompt building. |
| B5 | Low | **Git status only understands the version-2 index format.** It assumes a fixed 62-byte entry header with 8-byte padding, so index version 4 (path compression) and v3 extended flags are mis-parsed. | `frontend/src/services/git.js`: `parseIndex` | Read the index version from the header and handle v3/v4, or report "unsupported index version". |

## C. Broken

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| C1 | **Critical** | **`origin/main` does not build, and hasn't since `05ebaee`.** The CI and Pages deploy failures leave the live site on a stale build. The commit titled "Fix production build" (`efee89f`) did not fix it. | `frontend/src/App.jsx`, `buildDashboardData` / `Dashboard`. `vite build` fails with *"Expected a semicolon…"* at offset 21586. The causes: (1) regex literals with doubled escapes such as `/(^\|\\/)(test\|tests\|__tests__)(\\/\|$)…/`, where `\\` is a literal backslash so the next `/` ends the regex early; (2) a literal two-character `\n` in `…}}\nfunction Dashboard(`; (3) unbalanced JSX around `…</div>}</section>}function Explorer(`. | Restore `buildDashboardData` and `Dashboard` from `58302fa`, or repair all three issues. Verify with `npm run build`. |
| C2 | **Critical** | **`App.jsx` is duplicated.** Lines 58–108 repeat lines 6–56, and line 57 is `export default App;).test(path)\|\|new RegExp(…` (a fragment of line 5 spliced after the export). `function App` is declared twice. Even with C1 fixed, the redeclared `const sensitive` and `const BASE_URL` would still fail to compile. | `frontend/src/App.jsx` (duplicate-line scan: lines 58–108 equal lines 6–56) | Delete lines 57–108 and keep a single `export default App;` at the end. |
| C3 | **Critical** | **`indexCache.js` has a syntax error:** an `await` inside a non-async Promise executor. Even if that were legal, awaiting between `db.transaction()` and `.get()`/`.put()` lets the IndexedDB transaction auto-commit first (`TransactionInactiveError`). | `frontend/src/services/indexCache.js`: `loadCachedIndex` and `saveCachedIndex`, where `…objectStore(STORE).get(await projectKey(project))` sits inside `new Promise(resolve => {…})` | Compute `const key = await projectKey(project);` before creating the transaction, then use `key`. |
| C4 | **Critical** | **The local repository is mid-merge.** `.git/MERGE_HEAD` is `efee89f`, and `frontend/package-lock.json` contains merge-conflict markers (2 hunks), so it is invalid JSON and `npm ci` will fail. | `git status`: `UU frontend/package-lock.json`; `.git/MERGE_MSG` | Finish or abort the merge. Regenerate the lockfile with `npm install` from the resolved `package.json`, and commit it. |
| C5 | High | **Project Analysis always shows 0 JS/TS files and 1 line per file.** Its regexes have doubled escapes. This is already shipped (it is broken in `58302fa` too). | `App.jsx` `analyzeSource` / `buildProjectIndex`. Running the actual code: `/\\.(js\|jsx\|ts\|tsx\|vue)$/.test('src/a.js')` returns `false`; `'a\nb\nc'.split(/\\r?\\n/).length` returns `1`. Every function, class, import and export regex has the same problem. | Fix the escapes (`/\.(js\|jsx…)$/`, `/\r?\n/`, `\b`, `\s`, `\w`), or remove the tab in favour of Codebase Intelligence (see E2). |
| C6 | High | **Compare treats every file as one line,** and its "Compact Diff" output is joined with a literal `\n`. The comparison is also positional, so one inserted line marks every line below it as changed. | `App.jsx` `Diff`: `(await read(f)).split(/\\r?\\n/)` and `.join("\\n")` | Fix the escapes and replace the positional comparison with an LCS/Myers line diff (for example the `diff` npm package). |

## D. Missing

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| D1 | High | **No message for unsupported browsers.** `folder()` calls `showDirectoryPicker` directly, so Firefox and Safari users see the raw error "showDirectoryPicker is not defined". | `App.jsx`: `async function folder(){try{let h=await showDirectoryPicker(…)` | Check for `'showDirectoryPicker' in window`. When it's missing, show a "Use Chrome or Edge" empty state and disable Open Folder. |
| D2 | Medium | **No error boundary.** Any exception while rendering unmounts the whole app and leaves a blank page. | `frontend/src/main.jsx`, `App.jsx` | Add a top-level error boundary plus one per workspace, with a "Reload workspace" action. |
| D3 | Medium | **No unsaved-changes guard.** Opening another file or folder discards edits, and there is no `beforeunload` prompt. | `App.jsx`: `open()` and `folder()` overwrite `text`/`sel` regardless of `dirty` | Ask for confirmation when `dirty` is true, and register a `beforeunload` handler while there are unsaved edits. |
| D4 | Low | **No dark mode, visible focus styles or `aria-current`.** Several buttons are emoji-only. | `frontend/src/styles.css` (no `prefers-color-scheme`, `:focus-visible` or `:focus` rules); nav buttons in `App.jsx` | Add an accessibility pass: focus rings, `aria-current="page"`, `aria-label`s, a colour-contrast check, and a dark theme. |

## E. UX / product issues

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| E1 | Medium | **Developer Tools, Temenos/OFS and Engineering can't be reached from the nav,** only through `?tool=` in the URL. Help and the README still advertise them. | `App.jsx`: nav groups contain only Workspace and Analyze; `initialTab` reads `?tool=`; `HelpPage` lists "Developer Tools", "Temenos / OFS" and "Engineering Utilities" | Decide the product direction: restore a Tools nav group, or remove the features and their docs. |
| E2 | Medium | **Two overlapping analysis features.** Project Analysis (a regex analyser in `App.jsx`) duplicates the AST-based Codebase Intelligence index, and it's the broken one (C5). | `App.jsx` `Analyze`, `analyzeSource`, `buildProjectIndex`; `services/repository.js` `buildRepositoryIndex` | Remove Project Analysis, or make it a view of the Codebase Intelligence index. |
| E3 | Low | **Editor Find is case-insensitive but Replace is case-sensitive,** so the match count and Replace disagree. | `App.jsx` `Editor`: `matches` uses `new RegExp(esc(find),'ig')`, while `replaceOne` uses `text.indexOf(find)` and `replaceAll` uses `text.split(find)` | Use the same matcher for Find, Replace and Replace All, with an explicit "Match case" option. |
| E4 | Low | **Small display issues:** the Regex tool placeholder shows `\\b[A-Z][a-z]+\\b` and a literal `\\n`; the JWT decoder doesn't say the signature is unverified; the footer reads "ZainKamali – Repomind". | `App.jsx` `Tools`, `runTool`, footer | Fix the copy and label the JWT output as "decoded, signature not verified". |

## F. Technical / development issues

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| F1 | High | **`App.jsx` is about 147 KB of hand-minified code on 108 lines** (some lines are over 11,000 characters). This is the root cause of C1, C2, C5 and C6: string-based edits corrupted the file and nobody could review the diffs. | `frontend/src/App.jsx`; `CodebasePanel.jsx` and the services are also partly minified | Format it with Prettier and split it into `features/<workspace>/` modules. Add ESLint and a Prettier check to CI. |
| F2 | Medium | **Everything runs on the main thread** and reads files one at a time. The dashboard reads every file when a folder is opened. Search re-reads all files and builds a new `RegExp` for every line. The index cache key reads metadata for every file. There is no file-count cap, and Explorer, Transform and the Compare dropdowns render every file with no virtualisation. The bundle is a single 710 KB chunk (Vite warns above 500 KB). | `App.jsx` `buildDashboardData`, `search`; `services/repository.js` `buildRepositoryIndex`; `services/indexCache.js` `projectKey` | Move indexing into a Web Worker and share one file-content cache. Virtualise long lists. Lazy-load `@babel/parser` and the Codebase panel. Add a configurable file limit with a warning. |
| F3 | Medium | **Dead or duplicate code:** `combine()` is passed to `Transform` but never used; `rootHandle` state is set but never read; `Transform.parse()` calls `dosplit()` and then repeats the same logic; `cp`/`dl` are defined in both `App.jsx` and `CodebasePanel.jsx`. There is an empty nested git repository at `frontend/.git`. `@vitejs/plugin-react` is installed but there is no `vite.config`. `vite` and the plugin are in `dependencies` instead of `devDependencies`. | `App.jsx`, `CodebasePanel.jsx`, `frontend/.git`, `frontend/package.json` | Remove the dead code, move shared helpers to `src/utils`, delete `frontend/.git`, add `vite.config.js` (or remove the plugin), and move build tools to `devDependencies`. |
| F4 | High | **The embedded tools can reach the main app.** Their iframes are same-origin with no `sandbox`. The T24 Log Analyzer uses `innerHTML` 23 times on log content (the OFS generator 11 times) and loads the Tailwind **Play CDN** (`cdn.tailwindcss.com`), which isn't meant for production. A crafted log file could run script against the parent page, which holds the AI key in `sessionStorage` and the folder's read/write handles. | `App.jsx` `OFSWorkspace` / `EngineeringWorkspace` iframes; `frontend/public/tools/t24_logMultiFile.html`, `ofsMessageGenNew.html` | Add `sandbox="allow-scripts allow-downloads"` without `allow-same-origin`. Escape all log output (`textContent`). Replace the Tailwind CDN with bundled CSS. |
| F5 | Medium | **Third-party scripts load on every page view.** `index.html` loads JSZip and `mermaid@11` (a floating major version) from jsDelivr with no integrity (SRI) hashes. `diagram.js` pins `mermaid@12.0.0`, but that copy is never loaded because `window.mermaid` (v11) already exists. | `frontend/index.html`; `frontend/src/services/diagram.js` | Install `jszip` and `mermaid` through npm, import Mermaid lazily with `import('mermaid')`, and remove the CDN tags. |

## G. Testing gaps

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| G1 | High | **No tests at all** for Explorer, Search, Editor (including save), Ingest, Project Analysis, Transform, Compare, Markdown, Developer Tools, OFS or Engineering. This is why C5 and C6 shipped unnoticed. | `frontend/tests/e2e/repomind.spec.js` (only navigation, Codebase sub-tabs and Help are covered) | Add an E2E test for each workspace that checks its actual output: diff counts, analyzer symbol counts, the ingest tree, split/ZIP, Markdown rendering, and each tool's output. |
| G2 | High | **The navigation tests prove nothing about content.** Each tab has an expected heading defined, but it is never asserted. The tests never open a folder, and the `pageerror` listener is attached after `page.goto`, so errors during load are missed. | `repomind.spec.js`: the `RepoMind parent navigation` describe block and `openFixture` | Assert each heading, run the tabs with a folder open as well, and attach the listener before `goto`. |
| G3 | Medium | **The dashboard test fails even at the last commit that builds** (`58302fa`). It expects the text "Repository Dashboard", which only appears in the empty state; a loaded project shows "Local Repository Intelligence". | `repomind.spec.js`: `Dashboard loads repository analytics` | Fix the test or the badge text so they agree, then keep the suite green as a merge requirement. |
| G4 | Medium | **No unit tests for the services** (`repository.js`, `git.js`, `intelligence.js`, `analyzers.js`, `indexCache.js`, `ai.js`). | `frontend/src/services/*` | Add Vitest with fixture-based unit tests: import resolution, cycles, secret patterns, git index parsing, cache serialisation, AI request shapes. |
| G5 | Low | **The cache path is never tested.** The fixture sets `lastModified: Date.now()`, so the cache key changes on every read and a cache hit never happens. | `repomind.spec.js`: `makeFile` | Use a fixed timestamp and add a "reopen folder, cached index restored" test. |

## H. Production / deployment gaps

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| H1 | **Critical** | **Nothing stops a failing build from reaching `main` or deploying.** `deploy-pages.yml` runs on every push to `main` regardless of the CI or E2E result, and broken commits were merged. | `.github/workflows/deploy-pages.yml`, `CI.yml`, `repomind-e2e.yml` | Enable branch protection that requires CI and E2E to pass. Trigger deploy with `workflow_run` on a successful CI run, or merge the jobs so deploy `needs` them. |
| H2 | Medium | **E2E runs against the dev server** (`npm run dev`, base `/`), not the production build with `--base=/RepoMind/`, so base-path bugs slip through (for example the hardcoded `/RepoMind/tools/...` iframe paths in `58302fa`). | `frontend/playwright.config.js`: `webServer.command` | Build first, then run E2E against `vite preview --base=/RepoMind/` with `baseURL` pointing at `/RepoMind/`. |
| H3 | Medium | **E2E runs on every push to every branch, with no concurrency group.** The `fix/build-and-hardening` branch produced 15 runs in about 2 minutes, and all were cancelled. | `.github/workflows/repomind-e2e.yml`: `push: branches: ["**"]` | Add `concurrency: { group: e2e-${{ github.ref }}, cancel-in-progress: true }` and limit push triggers to `main`, with PRs covering branches. |
| H4 | Medium | **No Content Security Policy.** GitHub Pages can't set response headers. | `frontend/index.html` | After F5, add a `<meta http-equiv="Content-Security-Policy">` that allows only `'self'` scripts and the selected AI provider endpoints in `connect-src`. |
| H5 | Low | **Compiled Python files were committed** (`backend/app/__pycache__/*.pyc`), and `.gitignore` is missing `__pycache__/`, `playwright-report/` and `test-results/`. | `.gitignore` | Update `.gitignore` and finish removing the backend. |

## I. Documentation gaps

| ID | Severity | Finding | Affected files / evidence | Recommended solution |
|---|---|---|---|---|
| I1 | Medium | **The README's privacy claim is inaccurate.** It says "External services are involved only when you explicitly use functionality that requires them", but JSZip and Mermaid load from jsDelivr on every page view (F5), and the T24 tool loads Tailwind from a CDN. | `README.md` › Privacy model | Fix F5, or document exactly which CDN requests happen and when. |
| I2 | Medium | **The README and the in-app Help describe a different nav.** They list "Overview" (now "Dashboard") and a "Tools" group (Developer Tools, Temenos, Markdown, Engineering) that isn't in the nav, and they put Markdown under Tools when it's under Analyze. | `README.md` › Workspace guide; `App.jsx` `HelpPage` | Regenerate both from a single workspace registry that the nav also uses. |
| I3 | Low | **The README's architecture tree is incomplete.** It's missing `services/ai.js`, `services/health.js` and `public/tools/`, and doesn't mention that the backend was removed. | `README.md` › Architecture | Update the tree and add a short "Architecture decisions" note. |
| I4 | Low | **Standard project files are missing:** no LICENSE, SECURITY.md, CONTRIBUTING or CHANGELOG. The browser-support matrix is a single line. There are no release notes for `0.8.0`. | repository root | Add a LICENSE, SECURITY.md (with the AI key handling notes), CONTRIBUTING, a CHANGELOG, and a browser-support table. |
| I5 | Low | **`docs/UPGRADE_JOURNEY.md` repeats the "Milestone 5 — AI + Advanced Code Intelligence v1" section** (lines 108 and 123). | `docs/UPGRADE_JOURNEY.md` | Merge the two sections. |

---

## Prioritized implementation plan

### Phase 1 — Critical blockers (get `main` building and keep it that way)
1. Resolve or abort the local merge and regenerate `package-lock.json` (C4).
2. De-duplicate `App.jsx`, fix its regex escapes and JSX, and fix `indexCache.js` (C1, C2, C3). The fastest safe route is to take `58302fa`'s dashboard and re-apply `efee89f`'s hardening changes on top.
3. Confirm `npm run build` and the full E2E suite pass, then redeploy Pages.
4. Enable branch protection (CI and E2E required) and make deploy depend on a successful CI run (H1).

### Phase 2 — Core product gaps
1. Fix Compare with a real LCS line diff and correct line splitting (C6).
2. Remove or fix Project Analysis (C5, E2).
3. Fix AI model handling and validation (B1).
4. Wire up `onOpenFile` and render search error results (B3).
5. Keep the codebase index across tab switches (B2).
6. Separate the indexing busy state from other busy states (B4).

### Phase 3 — UX improvements
1. Unsupported-browser screen (D1).
2. Unsaved-changes guard and `beforeunload` (D3).
3. Decide whether the Tools nav group returns or the tools are removed (E1).
4. Make Find and Replace consistent (E3).
5. Accessibility pass and dark mode (D4).
6. Copy fixes (E4).
7. Error boundaries (D2).

### Phase 4 — Testing and quality
1. Format `App.jsx` and split it into feature modules; add Prettier and ESLint to CI (F1).
2. E2E tests for every workspace that check real output (G1).
3. Fix the navigation and dashboard tests (G2, G3).
4. Vitest unit tests for the services (G4).
5. Cache-path test (G5).
6. Remove dead and duplicate code (F3).

### Phase 5 — Production / deployment
1. Sandbox the embedded tool iframes, escape log output, and remove the Tailwind CDN (F4).
2. Bundle JSZip and Mermaid through npm (F5), then add a meta CSP (H4).
3. Run E2E against the production build with the `/RepoMind/` base (H2).
4. CI concurrency groups and narrower triggers (H3).
5. `.gitignore` cleanup (H5).
6. Update the README privacy model, workspace guide and architecture (I1–I3).

### Phase 6 — Nice-to-have improvements
1. Web Worker indexing, virtualised lists, code splitting and a file-count limit (F2).
2. Git index v3/v4 support (B5).
3. LICENSE, SECURITY.md, CONTRIBUTING, CHANGELOG and tagged releases (I4).
4. Merge the duplicated Milestone section (I5).

---

## Suggested next step

Phase 1 steps 1–3 are a well-scoped repair and should get a short design that is approved before any code changes. Splitting up `App.jsx` (F1) changes how the app is structured and should get its own written spec first.

---

## Resolution status (2026-09-27)

All six phases were implemented in the working tree (release 0.9.0). Verified with `npm run check` (format, lint, unit tests, build) and the Playwright suite against the production build.

| Finding | Status | Resolution |
|---|---|---|
| C1–C4 | ✅ Fixed | `App.jsx` de-duplicated and repaired, `indexCache.js` fixed, merge conflict resolved. |
| C5 | ✅ Fixed | Project Analysis regexes corrected (tab kept, see E2). |
| C6 | ✅ Fixed | LCS line diff with correct line splitting (`src/lib/diff.js`). |
| B1 | ✅ Fixed | Model required before any provider call; per-provider hints. |
| B2 | ✅ Fixed | Codebase panel kept mounted (hidden) after first visit; stale-cache race guarded. |
| B3 | ✅ Fixed | Code search results open in the Editor; invalid regex shows an error. |
| B4 | ✅ Fixed | Separate `indexing` state. |
| B5 | ✅ Fixed | Git index v2–v4 parser, tested against indexes written by the `git` CLI. |
| D1 | ✅ Fixed | Unsupported-browser notice; Open Folder disabled. |
| D2 | ✅ Fixed | Error boundary per workspace. |
| D3 | ✅ Fixed | Unsaved-changes confirmation and `beforeunload` warning. |
| D4 | ✅ Fixed | Dark mode (theme tokens), focus rings, skip link, `aria-current`, labels, reduced motion. |
| E1 | ✅ Fixed | Tools navigation group restored (Developer Tools, Temenos / OFS, Engineering). |
| E2 | ✅ Decided | Project Analysis kept as a quick JS/TS index now that it works; Help describes how it differs from Codebase Intelligence. |
| E3 | ✅ Fixed | Shared find/replace logic with a Match case option; Find no longer steals focus. |
| E4 | ✅ Fixed | Placeholders, JWT "not verified" note, footer. Also fixed: Regex test text was not editable. |
| F1 | ✅ Fixed | `App.jsx` split into `features/`, `lib/`, `components/`; Prettier + ESLint in CI. |
| F2 | ✅ Fixed | Lazy workspaces (initial JS 721 KB → ~250 KB), Web Worker indexing, virtualised Explorer, capped search, 50,000-file limit. |
| F3 | ✅ Fixed | Dead code removed, nested `frontend/.git` deleted, `vite.config.js` added, build tools moved to devDependencies. |
| F4 | ✅ Fixed | Opaque-origin sandbox + allow-listed `postMessage` bridge; T24 log output escaped; Tailwind CDN removed; per-tool CSP. |
| F5 | ✅ Fixed | JSZip and Mermaid bundled from npm and loaded on demand. |
| G1–G5 | ✅ Fixed | 48 E2E tests (every workspace, headings asserted, cache hit, sandbox, dark mode, unsupported browser) and 51 unit tests. |
| H1 | ⚠️ Partly | Deploy runs only after CI (which now includes E2E) passes. **Manual step:** require the CI checks via branch protection on `main`. |
| H2 | ✅ Fixed | E2E runs against `vite preview` at `/RepoMind/`. |
| H3 | ✅ Fixed | Single CI workflow with a concurrency group; E2E is a CI job. |
| H4 | ✅ Fixed | CSP `<meta>` injected into production builds. |
| H5 | ✅ Fixed | `.gitignore` covers Python bytecode and Playwright output. |
| I1–I3 | ✅ Fixed | README rewritten for navigation, browser support, privacy/CSP, architecture, development, testing and CI. Help updated. |
| I4 | ✅ Fixed | Added SECURITY.md, CONTRIBUTING.md, CHANGELOG.md and a proprietary LICENSE (Zainknoman Software Services). |
| I5 | ✅ Fixed | Duplicate Milestone 5 section merged; Milestone 9 added. |

Additional issues found and fixed during implementation: security-scan findings exposed the full secret (now masked); `.gitignore` rules with a leading `/` or `**` never matched; a restored cache could overwrite a fresh index; clicking a Dashboard file crashed the app.
