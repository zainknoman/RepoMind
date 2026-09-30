# Routine Creator Phase 1

Phase 1 is a native JavaScript/Vite domain layer. It does not import or port Swing UI code.

## RoutineSpec

`generateRoutine(spec)` accepts `routineName`, `developer`, `purpose`, optional `header`, ordered `tables`, ordered `functions`, ordered `fields`, `concat`, and `separator`.

A field may be a string or `{ name, table, position }`. When a position is supplied it is emitted as a numeric dynamic-array position; otherwise the selected field name is retained as the field expression.

## Application catalog

The catalog contains the 16 applications requested by Phase 1, exact matching only, and the suffixes `""`, `$HIS`, `$NAU`. Each application owns `name`, `alias`, `fieldPrefix`, `recordVar`, and `hasLayoutInsert`.

The aliases/record variables are normalized so the same record variable is used by F.READ/F.WRITE and extraction. This intentionally corrects the legacy inconsistencies for DRAWINGS, USER, LD.LOANS.AND.DEPOSITS and other table handling.

## Snippet catalog

All 14 useful snippets from `Functions.java` are represented with stable IDs and readable metadata. The useful legacy snippet text is preserved; contextual Fread/Fwrite expansion is handled by the generator.

## Template catalog

The four presets are recovered from `TempleateCode.java`, `OFS_rtn.java`, `OFS_OPM.java`, and `FWrite.java`. They are stored as data only. No Swing classes are imported.

## Generator API

- `generateRoutine(spec)` — deterministic header/common/equate/layout/enquiry/INIT/PROCESS/read/extraction/concat/clear/RETURN/END output.
- `generatePreset(id, routineName)` — returns a recovered template with the routine name substituted.
- `generateEvalQuery(table, fields, separator)` — emits `SELECT FBNK.<TABLE> SAVING EVAL ...` with exact, application-specific prefix stripping.
- `insertSnippet(text, offset, snippetId)` — uses JavaScript offsets and returns a structured result for invalid offsets.

## Intentionally corrected legacy defects

- exact application matching instead of substring matching;
- one deterministic application metadata source instead of a mutable alias variable leaking between tables;
- consistent record variables across F.READ/F.WRITE and extraction;
- deterministic `$HIS` / `$NAU` handling;
- USER uses the `EB.USE.` prefix and `R.USR` record variable;
- LD.LOANS.AND.DEPOSITS uses `LD.` and `R.LND`;
- DRAWINGS uses `TF.DR.` and `R.DRA` rather than the legacy incorrect teller record;
- STMT.ENTRY.DETAIL and STMT.PRINTED do not receive nonexistent I_F inserts;
- duplicate tables/fields are normalized deterministically;
- invalid snippet offsets do not throw unexpectedly.

## Source verification

The source repository now contains the JADX sources used for this reconciliation. The four recovered template payloads and the 14 snippet definitions were checked directly against the uploaded `JADX-OUTPUT/sources/defpackage` files. MainWindow was inspected only to recover pure generation behavior; no Swing code is copied into RepoMind.
