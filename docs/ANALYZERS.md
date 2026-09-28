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
