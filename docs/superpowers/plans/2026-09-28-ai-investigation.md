# AI Investigation (Phase C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [x]`) syntax for tracking.

**Goal:** Let the AI explain a change or an impact from RepoMind's own analysis — changed symbols,
the diff, affected items with confidence, broken references and blind spots — instead of from a
bare question; and rank files for any question using the dependency graph and, for T24, routine
and application names.

**Architecture:** `services/aiInvestigation.js` turns a `symbolImpact` result or a `changeImpact`
result (plus the raw changes) into (a) Markdown briefing sections and (b) an ordered file list with
reasons. `buildGroundedContext` accepts `sections` (budgeted, placed before Source). The AI hook
gets a third context source, `investigation`, set from Impact (**Explain with AI**) and Git
Change Impact (**Explain this change with AI**), which switch to the AI view with a task and a
prompt already built. `rankFilesForQuestion` adds graph neighbours of the lexical hits and T24
routine/application matches.

**Tech Stack:** React 19, Vitest, Playwright.

## Global Constraints

- Nothing is sent to a provider without the user clicking **Ask AI**; the prompt is shown first.
- Briefing sections are capped (impact 10 % of the budget, diff 25 %); source still gets the rest.
- The grounding rules gain one line: impact data comes from static analysis with confidences; low
  confidence items and blind spots must be presented as uncertain.
- Secret masking applies to diff lines exactly as to source lines.

## Review Focus

1. A diff of a file with a credential line is masked — T2 test.
2. A huge change (diff over its share) is cut with a note, not dropped silently — T2 test.
3. Graph neighbours never outrank a file that defines the named symbol — T1 test.
4. A T24 question naming `ACCOUNT.VALIDATE` ranks that routine first, even though the words
   `account` / `validate` appear in many routine names — T1 test.
5. Switching back to "Files relevant to the question" after an investigation uses the question,
   not the investigation files — T3 (hook logic, E2E).

---

### Task 1: Ranking (`services/aiContext.js`)

- [x] Test: the question "How does loginUser hash the password?" still ranks `login.js` first;
  a file that only imports `login.js` gets reason `imports src/auth/login.js`; a caller of a
  named symbol gets `uses loginUser`; neither outranks the defining file.
- [x] Test: T24 index — `ACCOUNT.VALIDATE.b`, `ACCOUNT.VALIDATE.CHARGES.b`, `CUSTOMER.UPDATE.b`
  (writes CUSTOMER); "What does ACCOUNT.VALIDATE do?" → `ACCOUNT.VALIDATE.b` first with reason
  `routine ACCOUNT.VALIDATE`; "Which routines write CUSTOMER?" → `CUSTOMER.UPDATE.b` with reason
  `writes CUSTOMER`.
- [x] Implement: dotted names (`[A-Z][A-Z0-9]*(\.[A-Z0-9]+)+`) and upper-case words matched
  against `files[].temenos.routine` (40) and `applications` (write 12, read 8, other 6);
  then neighbours of the top 5 hits: callers of symbols named in the question (4, `uses X`),
  importers and imports of each hit (3, `imports P` / `imported by P`), capped below the seed.

### Task 2: Briefings (`services/aiInvestigation.js`, `buildGroundedContext`)

- [x] `impactBriefing(result)` → `## Impact analysis` (root, counts, up to 60 affected items with
  confidence, level and the use site, blind spots).
- [x] `changeBriefing(result, changes, { maxTokens })` → `changeImpactMarkdown` (heading level
  shifted under `## Change impact`) and `## Diff` (per file, hunks with 3 lines of context,
  `+`/`-` lines numbered by new/old line, masked secrets, cut with "… diff truncated" at
  `maxTokens`).
- [x] `impactFiles(result)` / `changeFiles(result)` → `[{ path, reason }]`: root/changed files,
  then affected by confidence and depth (`affected: calls greet (high)`), then broken.
- [x] `investigationTask` strings for both.
- [x] `buildGroundedContext({ sections })`: inserted after the findings, before Source.
- [x] Tests for all of the above, including masking and truncation.

### Task 3: UI

- [x] `useAIContext.investigate({ title, task, files, sections })`: stores the investigation,
  sets the task and `source = 'investigation'`, builds the prompt; the AI view shows a third
  radio "Investigation: <title>". `makePrompt` uses the investigation's files and sections only
  for that source.
- [x] ImpactView: **🤖 Explain with AI** in Symbol Impact; GitView Change Impact:
  **🤖 Explain this change with AI** (keeps the raw changes in state). Both switch to AI.
- [x] E2E: Impact → greet → Explain with AI → prompt contains `## Impact analysis` and `UserCard`;
  Git → uncommitted → Explain → prompt contains `## Diff`.
- [x] CHANGELOG, README, IMPLEMENTATION_STATE, Help.

---

## Outcome

**Status: complete** — on `main`, 2026-09-28.

Differences from the plan:

- Reasons: a file keeps its three *strongest* reasons (they were the first three found), so
  "routine ACCOUNT.VALIDATE" is not crowded out by weaker path matches found earlier.
- Neighbour scores are capped at half the score of the file they came from (not "seed − 1"), so
  they never outrank it even when several neighbour reasons add up.
- The existing E2E "AI prompt is grounded…" matched the context row by text; with graph
  neighbours another row's reason ("imports src/service.js") contains that path, so it now
  matches the row by its path element.
- Switching to another index resets an investigation back to "Files relevant to the question".

Tests: 156 unit (`aiInvestigation.test.js`, ranking tests), 62 E2E (Impact and Git tests now
build an investigation prompt).
