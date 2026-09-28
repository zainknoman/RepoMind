# Import Resolution (Phase C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [x]`) syntax for tracking.

**Goal:** Resolve the imports that coverage reports as missing — tsconfig/jsconfig `paths` and
`baseUrl` aliases in JS/TS, and Python and Java imports — so Dependencies, References, Impact and
Change Impact work for those files, with the same confidence model as JS.

**Architecture:**
- `services/moduleResolution.js`: `parseModuleConfig(text)` (JSONC: comments, trailing commas),
  `createModuleResolver(files, fileMap)` → `resolve(fromPath, item)` dispatching by language:
  JS/TS relative (existing) then the nearest tsconfig/jsconfig's `paths` / `baseUrl` (following
  relative `extends`); Python absolute (`a.b` → `a/b.py`, `a/b/__init__.py`, or a unique
  `…/a/b.py` under a source root) and relative (`.`, `..`); Java `a.b.C` → `a/b/C.java` via the
  package map (Maven layout or path suffix).
- `analyzeSource` stores `moduleConfig` on tsconfig/jsconfig analyses, so incremental reuse keeps it
  (reused files are not read again).
- `services/pythonParser.js` and `services/javaParser.js` (line/brace scanners over code with
  comments and strings blanked, offsets preserved) produce the index's per-file shape: symbols with
  `endLine` and scopes, imports with bindings, references (identifiers and member calls, reusing
  C1's receiver model: `self.x()` / `this.x()`), local bindings and typed bindings.
- `buildRepositoryIndex` expands Python `from pkg import submodule` into a module edge and Java
  same-package / wildcard imports into implicit edges for referenced class names.
- Coverage: Python and Java move from "symbols only" to resolved modules.

**Tech Stack:** plain JS, Vitest.

## Global Constraints

- No new dependencies. Cache version 8 (analyses change shape).
- A JS bare specifier that no alias matches stays a package import (external), as today.
- Parsers never throw on odd input; unparseable regions yield fewer symbols, not a failed index.
- Java references are emitted only for capitalised names (types, constants) and calls; lower-case
  non-call names (locals, fields) are skipped to keep unresolved counts meaningful.

## Review Focus

1. tsconfig with comments and trailing commas parses — T1 test.
2. `paths` with several targets: the first existing wins — T1 test.
3. Python `from . import sibling` resolves the sibling module and reports no unresolved import — T2.
4. Python parameter / local assignment named like a top-level function elsewhere is not linked — T2.
5. Java class in the same package, used without an import, is an edge and a high-confidence link
   — T3.

---

### Task 1: tsconfig/jsconfig paths

**Files:** Create `frontend/src/services/moduleResolution.js`; modify `repository.js`; test
`frontend/src/services/moduleResolution.test.js`.

- [x] Tests: `parseModuleConfig` on JSONC; index with `tsconfig.json`
  (`baseUrl: "."`, `paths: { "@/*": ["src/*"], "#lib": ["missing/lib", "src/lib/index"] }`) and
  `app/jsconfig.json` extending it: `@/util/format` → `src/util/format.ts`, `#lib` →
  `src/lib/index.ts`, `components/Button` via baseUrl, `react` external; links through aliases are
  high confidence; a tsconfig reused from a previous analysis still resolves.
- [x] Implement `parseModuleConfig`, config lookup (nearest ancestor directory; `extends` relative
  chain, cycle-safe), pattern match (`*` once, longest prefix wins), and wire `resolve` into the
  analysis loop and `resolveExported`.

### Task 2: Python

**Files:** Create `frontend/src/services/pythonParser.js`; test `pythonParser.test.js`.

- [x] Parser tests: `def`/`class`/methods with `endLine` from indentation; nested functions are
  scoped; top-level assignments are variables; `import a.b as c`, `import a, b`,
  `from .m import (x, y as z)` across lines, `from . import s`; parameters and local assignments
  are local bindings; references skip keywords, builtins, strings, comments and attribute names;
  `self.run()` is a member reference with receiver `{ this: 'Cls' }`.
- [x] Index tests: `pkg/service.py` calls `helpers.fmt()` (module import) and `load()`
  (`from pkg.db import load`); `from . import helpers`; a local `load = 1` in another file is not
  linked; edges and high-confidence links; `src/` source root resolves `app.core`.

### Task 3: Java

**Files:** Create `frontend/src/services/javaParser.js`; test `javaParser.test.js`.

- [x] Parser tests: package; imports (single, wildcard, static); classes/interfaces/enums/records
  with nested parents and `endLine` from braces; methods and constructors; typed declarations
  (`Repo repo = …`, parameters) as typed bindings; references to capitalised names and calls;
  `this.save()` / unqualified `save()` in a class → receiver this.
- [x] Index tests: `com/acme/App.java` imports `com.acme.data.Repo`, calls `repo.save()` (typed)
  and uses `Helper` from its own package without an import; wildcard import of `com.acme.util.*`
  used as `Strings.trim()`; `java.util.List` external; all links high.

### Task 4: Coverage, docs

- [x] `coverage.js`: Python/Java `imports: 'modules'`, references on; JS notes mention aliases
  resolved (count) and alias-like imports that still did not resolve. Cache version 8.
- [x] `bench:index` on RepoMind (no regressions) and on a real Python and Java folder if one is
  available; CHANGELOG, README, IMPLEMENTATION_STATE, Help.

---

## Outcome

**Status: complete** — on `main`, 2026-09-28.

Measured on shallow clones of public repositories (Node, using the real indexer):

| Repository | Files | Before C3 | After C3 |
|---|---|---|---|
| pallets/flask (Python) | 83 .py | symbols only, no edges | 326 edges; 1,938 high / 463 medium / 828 low / 67 unresolved refs; 0.9 s |
| spring-petclinic (Java) | 50 .java | symbols only | 549 high / 37 medium / 29 low / 1 unresolved |
| shadcn-ui/taxonomy (TS, `@/*`) | 141 | 254 `@/…` imports external | 276 edges (275 via paths); 29 unresolved (was 611), 0 low |
| RepoMind `src` | 88 | 64 unresolved | 32 unresolved, no regressions |

Differences from the plan, found on those repositories:

- Python: module-level `with … as`, `for` targets and walrus names are module variables; lambda
  parameters are scoped to their statement; starred targets (`*parts, tail = …`); `import a.b`
  binds `a`; one-segment modules also resolve to packages under `src/`, `lib/`, `python/`,
  `source/`; a package's `__init__.py` provides what it imports (`from .app import Flask`);
  a reference to a module binding is a module use (`stats.moduleReferences`), not unresolved.
- Java: annotated and modified declarations (`@Valid Owner owner`, `@Autowired private …`),
  fields without an initializer, and `this.field.method()` receivers.
- JS/TS: `.mjs/.cjs/.mts/.cts` indexed; `.d.ts` candidates; TypeScript qualified names and
  type-literal keys are not references; DOM element types and TS utility types are globals.
- Existing tests that used Python as the "not analysed" language now use Go (unit) and C# (E2E).

Tests: 170 unit (`moduleResolution`, `pythonParser`, `javaParser` tests), 62 E2E.
