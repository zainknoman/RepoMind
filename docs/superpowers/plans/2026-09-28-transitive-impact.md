# Transitive Impact (Phase B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Answer "if I change this file or symbol, what could be affected?" across any number of
hops, with a confidence for every affected item and an explicit list of blind spots.

**Architecture:** (1) Parameters, destructured and catch bindings become per-file `localBindings`
so references to them stop counting as unresolved and correctly shadow outer names. (2) Symbols
record `endLine`, so a reference can be attributed to the function/class/method/routine that
contains it. (3) `services/impact.js` walks reverse dependency edges (file impact) or reverse
reference links between containing symbols (symbol impact), best-confidence-first: a path is as
strong as its weakest link. (4) Impact view shows direct + transitive results and blind spots.

**Tech Stack:** React 19, Vitest, Playwright, `@babel/parser`.

**Spec:** Phase B2 in `docs/IMPLEMENTATION_STATE.md` ("Next recommended task") and the B1 findings.

## Global Constraints

- No new dependencies. `npm run check` and E2E pass. Cache version 5 → 6.
- Local bindings are not symbols: Symbols view, search, counts and AI map are unchanged.
- Impact never claims completeness: blind spots (coverage gaps, unresolved same-name references,
  dynamic BASIC calls, low-confidence links) are always reported.

## Review Focus

1. A parameter that shadows an imported or top-level name must not link to it — Task 1 test.
2. Recursive and mutually recursive functions must terminate — Task 2 test.
3. A node reachable by a low-confidence path and a high-confidence path reports high — Task 2 test.
4. BASIC routines chain through CALL across files — Task 2 test.
5. Module-level code (no containing symbol) is reported as a file, not dropped — Task 2 test.

---

### Task 1: Local bindings and symbol end lines (`repository.js`)

- Parser: for every function node, each parameter name (including patterns, defaults, rest) →
  `localBindings: [{ name, scopeStart, scopeEnd }]` scoped to the function; destructured variable
  names and `catch (e)` scoped to the enclosing function (or file); TS type parameters scoped to
  their declaration. Symbols gain `endLine` (from `node.loc.end.line`); BASIC routine symbols end at
  the last line.
- Linking: the innermost local binding containing the reference offset wins over imports and any
  outer declaration; such references are counted in `stats.localReferences` and not linked.
- Tests (`graphAccuracy.test.js`): parameter shadowing an import; destructured and catch bindings
  not unresolved; `endLine` on functions/classes/methods.

### Task 2: `services/impact.js`

- `containerAt(index, path, line)` → innermost symbol of kind function/method/class/variable/BASIC
  routine with `line <= L <= endLine` (no `endLine`: end of file).
- `fileImpact(index, path, { maxDepth = 8 })` → `{ root, affected: [{ path, depth, via }], direct,
  transitive, blindSpots }` over reverse `index.dependencies`.
- `symbolImpact(index, symbolOrKey, { maxDepth = 8, limit = 2000 })` → `{ root, affected: [{ key,
  symbol | null, path, line, depth, confidence, via: { name, from, line } }], files, counts:
  { high, medium, low }, blindSpots }`. Three FIFO buckets by confidence; the first pop finalizes a
  node (widest path). References with no container yield a module-level file entry (not expanded).
- `blindSpots`: coverage gaps without references, unresolved references with the root's name,
  dynamic BASIC calls in the repository, count of low-confidence affected items.
- Tests (`impact.test.js`): JS chain a→b→c across files; recursion; best confidence wins; BASIC
  CALL chain; module-level usage; blind spots; file impact depth and via.

### Task 3: Impact view

- File: summary (direct / transitive / deepest), affected files grouped by depth with the
  importing path, blind spots.
- Symbol: each symbol row has **Impact**; the panel shows counts by confidence, affected symbols
  (`name`, `path:line`, depth, confidence tag, via), module-level files, blind spots. Clicking an
  item opens the file in the Editor.
- Symbol inspector gets **Show impact**.
- E2E: extend the Impact test to assert transitive results on the fixture folder.

### Task 4: Docs

- CHANGELOG, IMPLEMENTATION_STATE (B2 done, B3 next), Help (Impact), benchmark note.
