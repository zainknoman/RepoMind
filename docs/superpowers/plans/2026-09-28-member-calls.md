# Member Calls (Phase C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [x]`) syntax for tracking.

**Goal:** Link calls through objects — `this.method()`, `super.method()`, `obj.method()`,
`ns.fn()`, `Class.staticMethod()` — to the methods they call, so References, Impact and Change
Impact include method usage, each link with an honest confidence.

**Architecture:** The Babel parser (`parseJavaScript` in `services/repository.js`) records member
references (`kind: 'member'`) with a receiver descriptor, class symbols record `superClass`, and
variables/parameters with a known class (`new Foo()`, `: Foo`) record it. The resolution loop in
`buildRepositoryIndex` gets a member branch that resolves the receiver's class (enclosing class,
import binding, local declaration or a unique same-name class) and looks the method up in that
class and its superclasses. An unknown receiver falls back to a low-confidence match on method
names, skipping common built-in names. Unresolved member calls are counted, not recorded.

**Tech Stack:** `@babel/parser` AST, Vitest.

## Global Constraints

- No new dependencies. Existing identifier resolution is unchanged (existing fixtures keep passing).
- Cache version bumps (7): parsed files now carry member references.
- Unresolved member calls (`arr.push`, `res.json`) must not inflate the unresolved count.

## Resolution rules

| Receiver | Resolution | Confidence |
|---|---|---|
| `this` / `super` in a class method (arrow functions keep `this`) | `this` — class, then superclasses | high (1 target) / medium |
| Namespace import `ns.fn()` | `import` — `resolveExported(target, fn)` | high / medium |
| Imported or local class `Foo.create()` | `import` / `local` — static method | high / medium |
| Variable/parameter of known class (`new Foo()`, `x: Foo`), incl. imported singleton `export const api = new Api()` | `member-type` | high / medium; low if the class itself was a name match |
| Anything else (`a.b.c()`, parameters, call results) | `member-guess` — methods with that name | low |
| Receiver is a package import or JS global (`React.x`, `Math.max`) | not a reference (`externalReferences` / `globalReferences`) | — |

Non-call member access is recorded only for `this.name` (method passed as a callback), and only
when it resolves.

## Review Focus

1. `this` inside a nested `function () {}` is not the class — T1 test.
2. A parameter without a type shadows an outer `const x = new Foo()` — T1 test.
3. `items.map()` must not link to a repository method named `map` — T2 test.
4. An inherited method (`this.save()` defined in the superclass in another file) resolves — T2 test.
5. Link keys for methods are unambiguous (`path::Class.method`) — T2 fixture.

---

### Task 1: Parser records member references

**Files:** Modify `frontend/src/services/repository.js`; Test `frontend/src/services/memberCalls.test.js`.

- [x] Test: `analyzeSource` on a class with `this.a()`, `super.b()`, `this.handler` (non-call),
  `obj.c()`, `new Foo().d()`, a nested `function () { this.e(); }` → member refs with receivers
  `{ this: 'Cls' }`, `{ super: 'Cls' }`, `{ object: 'obj' }`, `{ other: true }`, and `e` has no class.
- [x] Test: `const f = new Foo(); f.run();` → receiver `{ object: 'f', type: 'Foo' }`;
  `function g(x: Bar) { x.run(); }` → type `Bar`; `function h(f) { f.run(); }` → no type.
- [x] Implement: `superClass` on class symbols; `instanceOf` on `const x = new Foo()` variables;
  `typedBindings` (name, class, scope) from `new` and TS annotations; member refs in the reference
  walk (callee of a call, or `this.x`).

### Task 2: Resolution

**Files:** Modify `frontend/src/services/repository.js`, `graphAccuracy.js`, `graphFixtures.js`.

- [x] Fixture `member-calls`: class in one file, subclass in another (`this.save()` inherited),
  namespace import, static call, typed variable, imported singleton, guess, `items.map()` not
  linked, `Math.max()` not linked. Link keys for methods are `path::Class.method`.
- [x] Implement the member branch in `buildRepositoryIndex`; stats `memberReferences`,
  `untracedMemberCalls`. References carry `receiver` (display text).
- [x] Existing fixtures still score 1.0.

### Task 3: Impact, UI and docs

- [x] `impact.js`: the `member-calls` blind spot says untyped receivers are guessed and built-in
  names / computed access are not traced. `symbolImpact` test: a method's caller via `this` is high.
- [x] Resolution labels for `this`, `member-type`, `member-guess` in the Symbol inspector;
  Symbol Resolution shows `receiver.name`. Cache version 7.
- [x] CHANGELOG, README, IMPLEMENTATION_STATE, Help.

---

## Outcome

**Status: complete** — on `main`, 2026-09-28.

Differences from the plan:

- A member call through a package or global object (`console.log`, `React.x`) is not counted
  again: its receiver identifier already counts as a package/global reference (a first version
  double-counted and failed the existing "globals are not unresolved" test).
- `render`, `setState` and `forceUpdate` joined the built-in names: on RepoMind's own source,
  `root.render()` (ReactDOM) was guessed to `ErrorBoundary.render`.
- An untyped parameter used as a receiver goes straight to the name guess (it may hold anything);
  a receiver with a known class whose method is not found (inherited from a package class) is
  untraced, not guessed.

Verification: RepoMind `src` (few classes) — 32 member calls linked, 2,356 untraced (almost all
built-in names on arrays, strings, handles and promises); guesses inspected by hand
(`analyzer.run` → the analyzers' `run`, `handle.getFile` → the test handle adapter). The new
`member-calls` accuracy fixture scores 1.0 and every earlier fixture still does. Tests: 149 unit,
62 E2E.
