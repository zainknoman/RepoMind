# Change Impact Follow-ups (Phase C4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Make change impact actionable and exact: list the test files a change (or a symbol)
affects, count modified files exactly instead of by timestamp, and trace an old commit against
the code as it was at that commit rather than today's index.

**Architecture:**
- `services/gitChanges.js`: `workingTreeStatus(root, files)` — HEAD tree vs working files by blob
  SHA-1 (index fast path with Git's racy rule, CRLF tolerance, deletions confirmed on disk) →
  `{ modified, added, deleted }` paths without reading old blobs. `workingTreeChanges` builds on
  it. `gitStatusSummary` (`git.js`) uses it for Modified/Deleted; Untracked stays "not in the
  index".
- `services/gitChanges.js`: `commitSnapshot(root, sha)` → a project (`{ name, files }` with
  blob-backed handles) of the commit's tree: text extensions, ignored folders skipped, sensitive
  names skipped, extensionless upper-case names sniffed as BASIC, files over 2 MB empty.
- `services/testFiles.js`: `isTestFile(path)` (JS/TS `*.test|spec.*`, `__tests__/`, `tests?/`,
  `e2e/`; Python `test_*.py`, `*_test.py`; Java `*Test(s)|IT.java`, `src/test/`; Go `_test.go`;
  T24 `*.TEST*` / `TEST.*` routines), `affectedTests(result)` → `[{ path, because }]`.
- `changeImpact` and `symbolImpact` results gain `tests`; the Markdown report gets a
  "Tests to run" section; Git and Impact views list them.
- GitView: commit impact builds a snapshot index at that commit (worker, cached per commit in
  the view) by default ("Trace against the code at this commit", toggle), and the AI
  investigation uses that snapshot index so the source sent matches the commit.

**Tech Stack:** File System Access handles, `crypto.subtle`, Vitest with git CLI repositories.

## Global Constraints

- Read-only access to `.git`; nothing leaves the browser.
- Status must agree with `git status` for modified/deleted on CRLF working copies and racy files.
- Snapshot indexing reuses the normal index pipeline (worker) and is cancellable.

## Review Focus

1. A file touched (mtime changed) but not modified is not "Modified" — T1 test.
2. A test file that only imports a changed module (module-level use) is listed — T2 test.
3. A commit whose functions were later renamed still reports its callers — T3 test.
4. A snapshot never includes `node_modules/` or files over 2 MB — T3 test.
5. The AI prompt for an old commit shows that commit's source, not today's — T3 (hook passes the
   snapshot index).

---

### Task 1: Exact working-tree status

- [x] Test (git CLI repo): commit a.js, b.js, c.js; modify a.js, rewrite b.js with identical
  content (touch), delete c.js, add new.js → `workingTreeStatus` = modified [a.js], deleted
  [c.js], added [new.js]; `gitStatusSummary` modified = [a.js] (was [a.js, b.js]).
- [x] Implement `workingTreeStatus`; refactor `workingTreeChanges` to use it; `gitStatusSummary`
  uses it.

### Task 2: Affected test files

- [x] Tests: `isTestFile` table; change to `core.js` with `core.test.js` (calls core) and
  `mid.test.js` (imports mid, module level) → `tests` = both with `because`; `symbolImpact`
  `tests`; Markdown "Tests to run".
- [x] Implement `services/testFiles.js`; add `tests` to results; GitView and ImpactView list
  them (click opens the file).

### Task 3: Old commits against their own code

- [x] Test (git CLI repo): commit 1 `lib.js` exports `oldName`, `use.js` calls it; commit 2
  renames it to `newName` everywhere. Impact of commit 1 against the snapshot at commit 1 lists
  `use.js`; against the current index it finds nothing. Snapshot skips `node_modules/` and
  large blobs.
- [x] Implement `commitSnapshot`; GitView toggle and per-commit cache; `useAIContext` accepts
  `investigation.index`.
- [x] CHANGELOG, README, IMPLEMENTATION_STATE, Help.

---

## Outcome

**Status: complete** — on `main`, 2026-10-01.

The session that started C4 was interrupted after Task 1's first edits; that work reached `main`
inside the owner's commit `6054373` ("Fix GitHub import and working tree change detection"),
which also made `gitStatusSummary` content-exact (hashing each tracked file against its index
entry). C4 was finished on top of it:

- Task 1: `workingTreeStatus` reuses `compareToHead` (index fast path, racy rule, CRLF) instead
  of a second, hash-everything loop; `gitStatusSummary` keeps its worktree-vs-index semantics
  and gains the same fast path.
- Task 2: `services/testFiles.js` (`isTestFile`, `affectedTests`); `tests` on `symbolImpact`
  and `changeImpact` results. Change impact also counts tests that import a changed file
  (directly or transitively) even when no changed symbol reaches them — a side-effect import is
  enough reason to run a test. Shared `TestsToRun` component in Impact and Git.
- Task 3: `commitSnapshot` returns a content-backed project (the same shape the GitHub importer
  uses), indexed with the normal worker pipeline and `attachFileHandles`; GitView caches the
  last three snapshot indexes; the AI investigation carries `index` so its source matches.

Tests: 219 unit (`testFiles.test.js`, `workingTreeStatus`, `commitSnapshot` against git CLI
repositories). E2E unchanged (the fixture has no Git objects).
