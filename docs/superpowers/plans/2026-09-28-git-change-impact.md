# Git Change Impact (Phase B3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Answer "what could my uncommitted changes, or this commit, affect?": changed lines →
changed symbols → combined transitive impact, plus references and imports the change breaks.

**Architecture:** `services/gitObjects.js` reads Git objects straight from `.git` (loose objects and
packfiles with offset/ref deltas, inflated with `DecompressionStream`), parses commits and trees,
and lists changed files for the working tree (vs HEAD) or for a commit (vs its first parent).
`services/changeImpact.js` diffs each file with `lib/diff.js`, finds changed symbols by parsing the
old and new text with `analyzeSource`, maps them to the current index and merges `symbolImpact`
results. The Git view gets a Change Impact panel and a Markdown report.

**Tech Stack:** Browser File System Access handles, `DecompressionStream`, `crypto.subtle` (SHA-1),
Vitest with the git CLI building real repositories.

## Global Constraints

- No new dependencies; nothing leaves the browser. Read-only access to `.git`.
- CRLF working copies (core.autocrlf) must not show every file as modified.
- Binary files and files over 1 MB are skipped and reported, never diffed.
- Every result lists blind spots (from `symbolImpact`, plus skipped and non-code files).

## Review Focus

1. Objects stored as deltas in packfiles (after `git gc`) read identically to `git cat-file` — T1.
2. A CRLF working copy of an unchanged file is unchanged — T2.
3. A change outside any function (module-level) reports the file's importers — T3.
4. A removed exported function reports importers whose binding it breaks — T3.
5. First commit (no parent): all files added, no crash — T2.

---

### Task 1: Git object store (`services/gitObjects.js`)

- `createObjectStore(gitDir)` → `{ read(sha) → { type, bytes } }`: loose `objects/xx/…`; packs via
  `.idx` v2 (fanout, binary search, 64-bit offsets) and exact entry slices (next entry offset or
  pack end − 20); types commit/tree/blob/tag, `OFS_DELTA`, `REF_DELTA`; delta copy/insert.
- `parseCommit(bytes)` → `{ tree, parents, author, date, message }`; `parseTree(bytes)` →
  `[{ mode, name, sha }]`; `flattenTree(store, sha)` → `Map(path → sha)` (blobs only).
- Tests (`gitObjects.test.js`, real repos via git CLI, a Node directory-handle adapter in
  `test/nodeHandles.js`): every object of `rev-list --objects --all` equals `git cat-file -p`, before
  and after `git gc --aggressive`; commits and trees parse.

### Task 2: Changed files

- `resolveHead(gitDir)`, `workingTreeChanges(root, files)` (HEAD tree vs working files: blob SHA-1,
  retried with CRLF → LF; added / modified / deleted by existence check), `commitChanges(root, sha)`
  (vs first parent; root commit = all added). Each change: `{ path, status, oldText, newText }` or
  `{ path, status, skipped: 'binary' | 'too large' }`.
- Tests: modified, added, deleted, CRLF-only, root commit, binary.

### Task 3: `services/changeImpact.js`

- `changedSymbols(change)` → `{ symbols: [{ name, kind, parent, change: 'modified' | 'added' |
  'removed', line }], moduleLevel }` using `lineDiff` + `analyzeSource` on old and new text.
- `changeImpact(index, changes)` → `{ files, affected (merged; `because` lists changed symbols),
  broken (importers of removed exports, unresolved refs of the removed name), counts, blindSpots }`.
- `changeImpactMarkdown(result, title)`.
- Tests: modified function → callers; module-level change → importers; removed export → broken
  importer; added symbol; merge keeps best confidence.

### Task 4: UI and docs

- Git view: **Change Impact** panel — "Uncommitted changes" button and a per-commit button in the
  activity list; changed files/symbols, affected items (confidence, level, because), broken
  references, blind spots, Copy / Download report. E2E: fixture without `.git` shows the
  "no Git repository" state; unit tests cover the logic.
- CHANGELOG, IMPLEMENTATION_STATE, Help.
