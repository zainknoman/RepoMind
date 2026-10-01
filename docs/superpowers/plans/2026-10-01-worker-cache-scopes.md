# Worker Cache, Block Scopes, Lower-case T24 Names (Phase C5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Take cache serialisation and restore linking off the main thread for large
repositories, resolve `let`/`const` by block instead of by function, and index T24 routines whose
file names are lower case.

**Architecture:**
- `indexCache.js`: `writeSnapshot(db, key, name, index)` and `readSnapshot(key)` shared by the
  main thread and the worker; `saveCachedIndex` uses them. The worker accepts
  `{ type: 'build', cacheKey }` (serialises and saves after building, then posts the index) and
  `{ type: 'restore', key }` (reads, version-checks and links the snapshot, then posts it).
- `repository.js`: `attachFileHandles` split into `linkIndex(index)` (pure: keys → symbols,
  positions → references) and the handle map; the worker links, the main thread only attaches.
- Package detection moves into the index: `analyzeSource` stores a manifest's dependencies on
  `package.json` analyses (`manifest`), `buildRepositoryIndex` fills `index.project.packages`
  (`frameworks.js` `packagesFromManifest`), so a worker-saved snapshot is complete and reused
  files keep it. `useCodebaseIndex` no longer post-processes.
- Block scopes: `BlockStatement` (not a function body), `For…Statement`, `SwitchStatement`,
  `StaticBlock` open scopes for `let`/`const`/`class`/function declarations; `var` keeps the
  function scope.
- `lib/files.js`: `basicCandidate(path, name)` — upper-case names as before, plus lower-case
  extensionless names inside a BASIC source folder (`BP`, `*.BP`, `BP.*`, `*_BP`, case
  insensitive); used by the folder walk, the GitHub importer and commit snapshots.
- Cache version 9.

## Global Constraints

- The main thread must still work without workers (fallback paths unchanged in behaviour).
- A cache written by the worker restores identically to one written by the main thread.
- `var` semantics unchanged; existing fixtures keep their links.

## Review Focus

1. Two sibling blocks each declaring `const x`: a use in one links only to its own — T2 test.
2. `for (const item of list)` then `item` after the loop is not the loop's binding — T2 test.
3. A worker-built snapshot restores with references linked to the same symbols — T1 test
   (`linkIndex` round trip).
4. `readme` or `notes` in a non-BP folder is never sniffed as BASIC — T3 test.
5. Packages survive incremental reuse (package.json unchanged) — T1 test.

---

### Task 1: Cache in the worker, packages in the index

- [x] Tests: `serializeIndex` → `linkIndex` round trip equals `attachFileHandles` result;
  `index.project.packages` from `package.json` content and after reuse; `writeSnapshot` /
  `readSnapshot` with fake-indexeddb.
- [x] Implement `linkIndex`, `writeSnapshot`/`readSnapshot`, worker messages, `buildIndex`
  `cacheKey` option and `restoreIndex(project)` in `indexClient.js`; `useCodebaseIndex` uses them.

### Task 2: Block scopes

- [x] Tests: sibling blocks, loop variable, `var` in a block visible in the function, `catch`
  block, existing fixtures unchanged.
- [x] Implement in `parseJavaScript`.

### Task 3: Lower-case extensionless T24 routines

- [x] Tests: `basicCandidate` table; walk of `BP/account.validate` (BASIC) and `docs/readme`
  (not sniffed); routine name and `CALL account.validate` link.
- [x] Implement `basicCandidate` and use it in the walk, GitHub import and commit snapshots.
- [x] CHANGELOG, README, IMPLEMENTATION_STATE, Help; bench before/after for save/restore.

---

## Outcome

**Status: complete** — on `main`, 2026-10-01.

| Measure (`bench:index`) | Before | After |
|---|---|---|
| 1,500 files / 240k lines: cache save on the main thread | ~5.5 s | 0 (worker) |
| same: cache restore on the main thread | ~14 s (read + link + attach) | ~5.8 s (receive the linked index) |
| RepoMind `src`: medium-confidence references | ~414 | 0 |

Differences from the plan:

- The worker posts `done` before writing the snapshot and `saved` after; the client resolves
  on `done` and terminates the worker on `saved`, so the index appears before the cache write
  and cancelling after `done` cannot cut the write short.
- `detectProjectPackages` (main thread, read package.json through handles) was removed; the
  only remaining reader of a full snapshot on the main thread is `loadLatestCachedIndex` (used
  for incremental reuse when no index is on screen).
- The BASIC content sniff accepts lower-case routine names after `SUBROUTINE`/`PROGRAM`/
  `FUNCTION` (keywords stay upper case), so `SUBROUTINE account.validate` is recognised.
- Receiving the linked index (structured clone of the whole graph) remains the main cost on very
  large repositories; storing references once instead of raw + linked is the next step.

Tests: 237 unit (`blockScopes.test.js`, cache round trip in the worker shape, packages on reuse,
`basicCandidate`, lower-case CALL link).
