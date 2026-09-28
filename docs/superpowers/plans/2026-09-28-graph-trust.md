# Graph Trust (Phase B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RepoMind's dependency/reference graph say how sure it is, fill the cheapest JS/TS holes,
and be measured against fixtures, so that transitive impact (Phase B2) can be built on it.

**Architecture:** The indexer (`services/repository.js`) tags every reference with a `resolution`
(how it was linked) and a `confidence`, records re-exports / dynamic `import()` / `require()` as
import edges, follows re-export chains when resolving bindings, and reports per-language
`index.coverage` (what was and was not extracted). `services/graphAccuracy.js` scores an index
against hand-written expected edges/links; fixture tests pin accuracy. The UI, analyzers and AI
context show confidence and coverage instead of silently presenting partial data as complete.

**Tech Stack:** React 19, Vite 8, Vitest 5, Playwright, `@babel/parser` 7.29.

**Spec:** In-session analysis of 2026-09-28 (the "Where the current graph is unreliable" findings):
only relative imports resolve; re-exports create no edges; dynamic `import()`/`require()` ignored;
global same-name fallback links any top-level symbol; `default` bindings match every export;
pattern-parsed languages have no imports/references; impact is one hop; accuracy never measured.

## Global Constraints

- Local-first: no new runtime dependencies, no network.
- `npm run check` (Prettier, ESLint, Vitest, build) and `npm run test:e2e` must pass at the end.
- Cache format changes bump `CACHE_VERSION` in `services/indexCache.js` (4 → 5).
- Never present partial data as complete: a language without import extraction must say so.
- Match surrounding style: plain functions, JSDoc-style block comments only where behaviour is
  non-obvious, Prettier formatting (single quotes, trailing commas, width 100).
- Out of scope (Phase B2+): transitive impact, Git change impact, tsconfig `paths` resolution,
  Python/Java import resolution, block scopes.

## Review Focus

1. A bare import that names an npm package (`react`) whose local (`useState`) matches a repository
   symbol must not link to that symbol — test in Task 2.
2. Re-export cycles (`a` re-exports from `b`, `b` from `a`) must terminate — test in Task 3.
3. `export default someIdentifier` (no declaration) must resolve default imports — test in Task 3.
4. A repository with only Python/Java files must report that imports/references are not extracted,
   not zero dependencies with no explanation — test in Task 4.
5. Snapshots cached by the previous version must be rebuilt, not reused with missing fields —
   covered by the `CACHE_VERSION` bump and existing cache tests (Task 3).

---

### Task 1: Accuracy harness

**Files:**

- Create: `frontend/src/services/graphAccuracy.js`
- Create: `frontend/src/services/graphFixtures.js` (fixture repositories + expectations)
- Test: `frontend/src/services/graphAccuracy.test.js`

**Interfaces:**

- Produces: `edgeKeys(index): string[]` (`"from -> to"`), `linkKeys(index): string[]`
  (`"from:line name -> path::name"` per resolved symbol), `scoreGraph(index, expected)` →
  `{ edges: Score, links: Score }` with `Score = { expected, actual, tp, precision, recall,
missing: string[], extra: string[] }`; `indexFixture(files)` (test helper in the fixtures module)
  → index built with `toWorkerProject`.

- [x] **Step 1:** Write tests for `scoreGraph` on a hand-built index (perfect, missing, extra) and
      one baseline fixture (`relative-named-import`) that the current indexer already gets right.
- [x] **Step 2:** Run `npx vitest run src/services/graphAccuracy.test.js` → FAIL (module missing).
- [x] **Step 3:** Implement:

```js
const pct = (n, d) => (d ? n / d : 1);
function score(expected, actual) {
  const want = new Set(expected),
    got = new Set(actual);
  const tp = [...got].filter((x) => want.has(x)).length;
  return {
    expected: want.size,
    actual: got.size,
    tp,
    precision: pct(tp, got.size),
    recall: pct(tp, want.size),
    missing: [...want].filter((x) => !got.has(x)).sort(),
    extra: [...got].filter((x) => !want.has(x)).sort(),
  };
}
export const edgeKeys = (index) =>
  (index?.dependencies || []).map((e) => `${e.from} -> ${e.to}`);
export const linkKeys = (index) =>
  (index?.references || []).flatMap((r) =>
    (r.resolvedSymbols || []).map(
      (s) => `${r.from}:${r.line} ${r.name} -> ${s.path}::${s.name}`,
    ),
  );
export function scoreGraph(index, expected) {
  return {
    edges: score(expected.edges || [], edgeKeys(index)),
    links: score(expected.links || [], linkKeys(index)),
  };
}
```

- [x] **Step 4:** Run the test → PASS. Run full `npx vitest run` → all pass.
- [x] **Step 5:** Commit `Add graph accuracy harness and fixtures`.

### Task 2: Reference provenance and confidence

**Files:**

- Modify: `frontend/src/services/repository.js` (reference linking loop in `buildRepositoryIndex`)
- Modify: `frontend/src/services/graphFixtures.js`, `frontend/src/services/graphAccuracy.test.js`

**Interfaces:**

- Produces on every `index.references[]` item: `resolution: 'import' | 'local' | 'name-match' |
'unresolved'` and `confidence: 'high' | 'medium' | 'low' | 'none'`; exported
  `referenceConfidence(resolution, count)`; `index.stats.referenceConfidence = { high, medium, low,
none }`; `index.stats.externalReferences`, `index.stats.globalReferences` (not linked, not counted
  as unresolved).

Rules: `import`/`local` with one target → high, several → medium; `name-match` → low; `unresolved`
→ none. A local bound by an import of a module outside the repository (bare specifier or missing
file) is `external` and never falls through to name matching. Identifiers that are JS globals
(`require`, `module`, `exports`, `console`, `window`, `document`, `globalThis`, `process`, `JSON`,
`Math`, `Object`, `Array`, `Promise`, `Error`, `undefined`, …) are `global`. External and global
references are not added to `index.references`.

- [x] **Step 1:** Add fixtures `name-collision` (two files define top-level `init`; a third calls it
      without importing → two low-confidence links) and `external-shadow` (`import { useState } from
'react'` in a repo that also defines `useState` → no link). Add a test that references carry
      `resolution`/`confidence` and that `console` is not counted unresolved.
- [x] **Step 2:** Run → FAIL (`external-shadow` has an extra link; fields undefined).
- [x] **Step 3:** Implement in the linking loop: build `externalLocals` (file::local of bindings of
      non-internal imports), classify, set fields, update stats.
- [x] **Step 4:** Run full suite → PASS (update any existing assertion on `unresolvedReferences`
      that changes because globals are no longer counted, noting why).
- [x] **Step 5:** Commit `Tag references with resolution and confidence`.

### Task 3: Re-exports, default exports, dynamic imports and `require()`

**Files:**

- Modify: `frontend/src/services/repository.js` (`parseJavaScript`, binding resolution)
- Modify: `frontend/src/services/indexCache.js` (`CACHE_VERSION = 5`), `indexCache.test.js` if it
  asserts the version
- Modify: fixtures + tests

**Interfaces:**

- `parseJavaScript` import records gain `reexport: true` (from `export … from`) or
  `dynamic: true` (`import('x')`) or `require: true`; export records from `export … from` gain
  `source`; `export default ident` yields `{ name: 'default', local: ident, kind: 'default' }`.
- Binding resolution uses `resolveExported(path, name, seen)`: named exports (following `source`),
  then `export * from` sources, then the file's own top-level symbol; `default` matches only
  `kind: 'default'` exports. Cycles stop via `seen`.

- [x] **Step 1:** Fixtures: `barrel` (`lib/index.js` with `export * from './math'` and
      `export { fmt as format } from './fmt'`; `app.js` imports `{ add, format }` from `./lib`),
      `default-export` (default import links only to the default, including `export default main;`),
      `commonjs-dynamic` (`const util = require('./util')`, `const { a } = require('./a')`,
      `import('./lazy')`), `reexport-cycle` (two barrels re-exporting each other terminate).
- [x] **Step 2:** Run → FAIL (missing edges/links).
- [x] **Step 3:** Implement parse changes and `resolveExported`; bump cache version.
- [x] **Step 4:** Run full suite → PASS.
- [x] **Step 5:** Commit `Link re-exports, default exports, dynamic imports and require()`.

### Task 4: Analysis coverage

**Files:**

- Create: `frontend/src/services/coverage.js`
- Modify: `frontend/src/services/repository.js` (set `index.coverage` at the end of the build)
- Test: `frontend/src/services/coverage.test.js`

**Interfaces:**

- Produces: `analysisCoverage(index)` →
  `[{ language, files, imports: 'resolved' | 'relative' | 'none', references: boolean,
aliasLikeImports: number, note: string }]`, sorted by files desc; `coverageGaps(index)` → the
  entries with `imports !== 'relative' && imports !== 'resolved'` or `!references` or
  `aliasLikeImports > 0`; `coverageFor(index, path)` → entry for that file's language.
  `index.coverage` holds `analysisCoverage(index)`.

Levels: JS/TS (Babel) → `relative` (+ alias-like count: external imports starting with `@/`, `~/`,
`#`, or whose first segment is a top-level folder of the repository); Temenos BASIC → `resolved`;
everything else → `none`, `references: false`, note "Symbols only: imports and references are not
extracted, so Dependencies and Impact are empty for <language> files." Markdown/JSON/CSS/etc.
(non-code) are omitted.

- [x] **Step 1:** Tests: a Python + Java repo reports two gaps with notes; a JS repo importing
      `@/lib/x` reports `aliasLikeImports: 1`; a JS-only relative repo reports no gaps.
- [x] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Full suite → PASS.
- [x] **Step 5:** Commit `Report per-language analysis coverage`.

### Task 5: Show confidence and coverage

**Files:**

- Modify: `frontend/src/features/codebase/CodebasePanel.jsx` (Symbol inspector references,
  Overview coverage panel, Impact warning)
- Modify: `frontend/src/services/analyzers.js` (`symbol-resolution` reports `guessed` name matches;
  `analyzerSummary` gains `guessed`), `frontend/src/features/codebase/AnalyzersView.jsx`
- Modify: `frontend/src/services/aiContext.js` (overview lists coverage gaps; a grounding rule about
  low-confidence links)
- Modify: `frontend/src/styles.css` (confidence tag)
- Test: `analyzers.test.js`, `aiContext.test.js`, `tests/e2e/repomind.spec.js`

- [x] **Step 1:** Unit tests: `symbol-resolution` returns a `guessed` finding for a name-match
      reference; `buildGroundedContext` overview contains "Analysis coverage" for a Python repo.
- [x] **Step 2:** Run → FAIL. **Step 3:** Implement services, then UI: references sorted by
      confidence with a `conf-high|medium|low` tag and a `title` explaining the resolution; Overview
      "Analysis coverage" panel listing `index.coverage` with gap notes; Impact shows the note from
      `coverageFor` above an empty dependency list.
- [x] **Step 4:** `npm run check` and `npm run test:e2e` → PASS (adjust E2E only where labels
      changed).
- [x] **Step 5:** Commit `Show reference confidence and analysis coverage`.

### Task 6: Documentation

**Files:** `docs/IMPLEMENTATION_STATE.md`, `README.md`, `CHANGELOG.md`, `docs/ANALYZERS.md`,
`frontend/src/features/help/HelpPage.jsx`

- [x] Fix the stale Phase 6 status (it is on `main`), add Phase B1 and the B2 roadmap (transitive
      impact with confidence propagation and coverage boundaries → Git change impact → tsconfig paths /
      Python / Java import resolution).
- [x] Replace hard-coded test counts in the README with the commands that report them.
- [x] CHANGELOG entry; Help text for confidence and coverage.
- [x] `npm run check` → PASS. Commit `Document graph trust phase`.

---

## Outcome

**Status: complete** — merged to `main` and pushed on 2026-09-28 (commits `6c723f1`…`6b55b6e`).

Delivered as planned, Tasks 1–6. Differences from the plan:

- `npm run bench:index` also reports references by confidence (not in the plan), so accuracy work
  can be measured on real repositories.
- The benchmark on RepoMind's own source showed 4,466 unresolved references, mostly parameters and
  destructured variables, which are not symbols. That fix moved to Phase B2
  (`2026-09-28-transitive-impact.md`), where unresolved fell to 42.
- A Prettier run reformatted unrelated Markdown files; that commit was redone with content-only
  edits.

Results on RepoMind `src`: 3,821 high / 174 medium / 218 low / 4,466 unresolved references before
B2. Tests: 111 unit, 61 E2E.
