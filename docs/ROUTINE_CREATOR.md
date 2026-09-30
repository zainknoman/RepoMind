# Routine Creator Domain Layer

Phase 1 adds a pure JavaScript Routine Creator model/generator to RepoMind. It is independent of React, DOM APIs and the original Java Swing UI.

## RoutineSpec

`generateRoutine(spec)` accepts `routineName`, `developer`, `purpose`, optional `header`, ordered `tables`, ordered `functions`, ordered `fields`, `concat`, and `separator`.

A field can be a string or `{ name, table, position }`.

## Catalogs

`routineCatalog.js` contains the 16 requested applications and the exact table suffixes ``, `$HIS`, `$NAU`. Matching is exact. Each entry owns its alias, field prefix, record variable and layout-insert flag.

`routineSnippets.js` exposes the 14 stable IDs: `ReadSeq`, `Readlist`, `Fread`, `Fwrite`, `WriteFile`, `Locate`, `GetLocalRef`, `FindStr`, `CallCDD`, `CallCDT`, `SubString`, `Trim`, `Convert`, `Change`.

`routineTemplates.js` exposes four data presets: `standard-routine`, `ofs-routine`, `ofs-opm`, and `fwrite-routine`.

## Generator API

- `generateRoutine(spec)` — emits header, common/equate/layout inserts, commented enquiry common, INIT/PROCESS flow, reads, field extraction, optional concatenation, clearing, RETURN and END.
- `generatePreset(id, routineName)` — expands a preset without UI dependencies.
- `generateEvalQuery(table, fields, separator)` — emits `SELECT FBNK.<TABLE> SAVING EVAL ...` with exact prefix stripping.
- `insertSnippet(text, offset, snippetId)` — inserts using JavaScript string offsets and returns `{ text, inserted, error }` rather than throwing for invalid offsets.

## Corrected legacy defects

The domain layer intentionally corrects the specified record-variable mismatch, substring-based application matching, `$HIS/$NAU` ambiguity, USER prefix handling, LD.LOANS.AND.DEPOSITS handling, metadata leakage between tables, duplicate handling and unsafe cursor insertion.

No analyzer behavior, navigation, OFS Generator, T24 Log Analyzer or Swing code is changed.

## Source-parity limitation

The requested local source of truth at `D:\Zain\Projects\RoutineCreator\JADX-OUTPUT` was not mounted into this execution environment. The implementation therefore follows the functional specification supplied in the task and existing RepoMind Temenos conventions. Exact byte-for-byte parity of the legacy snippets/templates should be reconciled against the local JADX report before a future UI phase treats those strings as canonical.
