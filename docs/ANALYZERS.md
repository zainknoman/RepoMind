# Analyzer contract

Every Codebase analysis that produces findings is an **analyzer**, registered in
`frontend/src/services/analyzers.js`. The Analyzers view, the project report and AI context all read
analyzer results in one shape, so a new analyzer needs no UI work.

## Defining an analyzer

```js
import { defineAnalyzer, registerAnalyzer } from './analyzers';

const todo = defineAnalyzer({
  id: 'todo-comments',          // unique, lowercase-kebab
  name: 'TODO Comments',
  category: 'Maintenance',
  description: 'Lists TODO and FIXME comments.',
  scope: 'source',              // 'index' = metadata only, 'source' = also reads file contents
  appliesTo: (index) => true,   // optional; when false the analyzer is not offered for this index
  columns: [                    // optional; default: severity, title, file, line
    ['severity', 'Severity'],
    ['title', 'Comment'],
    ['file', 'File'],
    ['line', 'Line'],
  ],
  async run({ index, readText, lineLocator, signal }) {
    const findings = [];
    for (const file of index.files) {
      const text = await readText(file.path);
      // …
      findings.push({ severity: 'low', title: 'TODO: tidy up', file: file.path, line: 12 });
    }
    return findings;
  },
});

const unregister = registerAnalyzer(todo);
```

`appliesTo` keeps a domain pack out of unrelated repositories: `listAnalyzers(index)` and a
`runAnalyzers(index)` without ids include only the analyzers that apply. `listAnalyzers()` with no
index lists them all.

`defineAnalyzer` validates the definition and throws one error listing every problem.
`registerAnalyzer` accepts a definition or a raw spec, refuses duplicate ids and returns a function
that removes it again.

### The run context

| Field | Meaning |
|---|---|
| `index` | The code index (`files`, `symbols`, `references`, `dependencies`, `project`, …). |
| `readText(path)` | File contents as a string (`''` if unavailable). Shared by every analyzer in one run, so each file is read at most once. |
| `lineLocator(text)` | Returns `offset → 1-based line` for `text`. |
| `signal` | An `AbortSignal`; long loops should stop when it is aborted. |

### Findings

A finding is a plain object. The runner normalises these fields:

| Field | Normalised to |
|---|---|
| `severity` | `'high'`, `'medium'`, `'low'` or `'info'` (anything else becomes `'info'`) |
| `title` | string — the one-line summary used in reports and AI context |
| `file` | indexed path or `null` |
| `line` | integer or `null` |
| `analyzer` | the analyzer's id |

Any other fields (e.g. `method`, `path`, `framework`) are kept and can be shown through `columns`.
In the Analyzers view a `file` cell opens the file in the Editor.

## Pattern analyzers

Most framework and domain rules are regular expressions over file contents. `definePatternAnalyzer`
builds a `source` analyzer from rules:

```js
definePatternAnalyzer({
  id: 'todo-comments',
  name: 'TODO Comments',
  category: 'Maintenance',
  description: 'Lists TODO and FIXME comments.',
  files: (file) => !file.path.endsWith('.md'),   // optional: which files to read
  key: (f) => f.file + '|' + f.line,             // optional: duplicate key (default file|line|title)
  rules: [
    {
      pattern: /\b(TODO|FIXME)\b:?\s*(.*)/,       // the g flag is added
      severity: 'low',
      applies: (file, index) => true,             // optional, per rule
      finding: (match, { file, line, lineText }) => ({ title: match[1] + ': ' + match[2] }),
    },
  ],
});
```

Route Discovery, Framework Structure and Secret Scan are pattern analyzers.

## Running

```js
const results = await runAnalyzers(index, ['routes', 'security'], { signal, onResult });
// { routes: { name, findings, ms, ranAt }, security: { name, findings: [], error, ms, ranAt } }
```

One failing analyzer does not stop the others; its result carries `error`. Cancellation (an aborted
`signal`) rejects the whole run with an `AbortError`. `runAnalyzer(index, id)` runs one and returns its
findings, throwing on error.

## Built-in analyzers

| id | Scope | What it reports |
|---|---|---|
| `routes` | source | HTTP routes (Express, NestJS, FastAPI, Flask, Spring, ASP.NET) |
| `framework-structure` | source | React/Vue components, controllers, application entry points |
| `symbol-resolution` | index | Ambiguous (`low`) and unresolved (`medium`) references |
| `architecture-hotspots` | index | Files with internal dependency edges, most coupled first |
| `security` | source | Likely hard-coded secrets (values masked) |

## Temenos T24 / Transact analyzers

`services/temenos.js` registers these when imported (the Codebase panel imports it). All apply only
when the index contains BASIC sources.

| id | Scope | What it reports |
|---|---|---|
| `temenos-routines` | index | Every routine/insert: type, calls (in repository vs core), callers/includers, applications; `medium` when a routine name is defined in more than one file |
| `temenos-applications` | index | T24 applications with the routines that write, read or only use their layout |
| `temenos-services` | index | Multi-threaded services (`NAME`, `NAME.LOAD`, `NAME.SELECT`, `I_NAME.COMMON`); `low`/`medium` for missing parts |
| `temenos-calls` | index | Routines called but not in the repository (the core API), by number of callers |
| `temenos-java` | source | `CALLJ` calls (resolved to the class file or not) and Java classes that extend `com.temenos.*` types |
| `temenos-practices` | source | Direct `READ`/`WRITE`, `EXECUTE`/`PERFORM`, `STOP` in a subroutine, `GOTO`, `CRT`, hard-coded company codes |

What the index records for BASIC (`services/temenosBasic.js`):

- **Sources:** `.b` files, and extensionless upper-case files (`BP/ACCOUNT.VALIDATE`, `I_COMMON`) whose
  first 4 KB contain a BASIC header, `$INSERT`/`$PACKAGE`/`$USING`, `COMMON /…/` or `EQU … TO`.
  They are classified as `.b` (language "Temenos BASIC").
- **Symbols:** the routine (`subroutine`, `program`, `function`, or `insert` for header-less `I_*`
  files) and its labels (local to the file).
- **Edges:** `CALL X` and `DEFFUN X` → the file of routine `X`; `$INSERT X` / `$INCLUDE X` → the
  insert; `CALLJ "pkg.Class"` → `pkg/Class.java`. Routines are matched by file name (without `.b`).
  Unmatched targets are external dependencies (core routines); they are not counted as unresolved
  references. So **Impact** and **Dependencies** show callers and includers of a routine.
- **References:** call sites (`CALL`, DEFFUN functions) and `GOSUB`/`GOTO` label targets.
- **Applications** (`files[].temenos.applications`): `I_F.APP` inserts (layout), `F.READ`/`F.WRITE`/
  `F.DELETE`/`CACHE.READ` and `READ … FROM`/`WRITE … ON` through file variables set from
  `'F.APP'` and `OPF`, `EB.DataAccess.FRead`/`FWrite`, and the TAFJ table API
  (`AC.AccountOpening.Account.Read(…)` → `ACCOUNT`).

Not covered yet: VERSION / EB.API / PGM.FILE records (which attach routines to applications and
events), `CALL @var` targets (counted as `dynamicCalls` only), Java-to-Java imports, and TAFJ
component (`$USING`) dependencies beyond recording them.

## Where results go

- **Analyzers view** — one table per analyzer, **Run All**, counts by severity, duration, errors.
- **Overview** — the security card reads the `security` result ("not scanned" until it runs).
- **Project report** — routes and secret findings.
- **AI context** — a short "Analyzer findings" section (counts and the most severe findings) when
  *Analyzer findings* is ticked.

Results are kept per open index and reset when the index changes.

## Not yet

- Analyzers run on the main thread (source reads are async). Moving source analyzers into the index
  worker is a follow-up if they become slow on large repositories.
- There is no loading of third-party code at runtime; packs (such as the planned Temenos analyzers)
  are modules in this repository that call `registerAnalyzer`.
