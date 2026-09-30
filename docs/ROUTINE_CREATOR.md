# Routine Creator Phase 1

Phase 1 is a native JavaScript/Vite domain layer. It does not import or port Swing UI code.

## Scope

Phase 1 provides deterministic legacy Temenos/Infobasic routine generation from a small application catalog, verified field positions, reusable snippets, recovered legacy templates, EVAL query generation, and safe snippet insertion.

The generator deliberately does **not** infer unverified field positions. A field without a numeric position is emitted as a verification comment rather than invalid BASIC such as `R.ACC<AC.CUSTOMER>`.

## RoutineSpec

`generateRoutine(spec)` accepts:

- `routineName`
- `developer`
- `purpose`
- optional `header`
- ordered `tables`
- ordered `functions`
- ordered `fields`
- `concat`
- `separator`
- optional `clearFields`

A field may be a string or `{ name, table, position }`. A numeric positive `position` is treated as verified and emitted as a dynamic-array field position. Without a verified position, the generator emits a verification comment and does not invent a field expression.

`clearFields` is opt-in. Selecting a field does not automatically clear it.

## Application catalog

The catalog contains the 16 Phase 1 applications with exact matching and the suffixes `""`, `$HIS`, and `$NAU`.

Each application owns:

- `name`
- `alias`
- `fileAlias`
- `fieldPrefix`
- `recordVar`
- `fileNameVariable`
- `fileVariable`
- `errorVariable`
- `idVariable`
- `hasLayoutInsert`

File-variable naming is explicit rather than being accidentally derived from the record alias. This preserves the existing Phase 1 conventions such as `FN.ACC/F.ACC/R.ACC/E.ACC` for ACCOUNT and `FN.CUSTOMER/F.CUSTOMER/R.CUS/E.CUSTOMER` for CUSTOMER.

## Legacy API style

Phase 1 generates classic legacy-style code:

```basic
$INSERT I_COMMON
$INSERT I_EQUATE
$INSERT I_F.ACCOUNT

CALL OPF(FN.ACC,F.ACC)
CALL F.READ(FN.ACC,Y.ACC.ID,R.ACC,F.ACC,E.ACC)
```

Temenos-Skills documents a separate modern DS Packager style using `$PACKAGE`, `$USING`, and dot-notation APIs. Phase 1 does not claim to generate that modern style yet.

## Snippet catalog

All 14 useful legacy snippets are represented with stable IDs and developer-facing help text. The ordering is stable:

```
ReadSeq
Readlist
Fread
Fwrite
WriteFile
Locate
GetLocalRef
FindStr
CallCDD
SubString
Trim
CallCDT
Convert
Change
```

`Fread` and `Fwrite` are contextualized by the application catalog when tables are selected.

## Template catalog

The four recovered templates are stored as data only:

- `standard-routine` — recovered legacy GLOBUS/R19-style application routine.
- `ofs-routine` — recovered legacy OFS routine.
- `ofs-opm` — recovered legacy OFS OPM routine.
- `fwrite-routine` — recovered legacy F.WRITE batch-style routine.

These are **legacy reference templates**, not modern R20+ DS Packager templates.

`generatePreset(id, routineName)` replaces the routine declaration line without accidentally consuming a following comment line when the recovered template has a blank routine name.

## EVAL query generation

`generateEvalQuery(table, fields, separator)` emits:

```
SELECT FBNK.ACCOUNT SAVING EVAL "CUSTOMER":"^":"CURRENCY"
```

Application prefixes are stripped only when they belong to the selected application. A more-specific application prefix is preserved when querying a broader application, so:

```js
generateEvalQuery('ACCOUNT', ['AC.ACL.STATUS'])
```

returns:

```
SELECT FBNK.ACCOUNT SAVING EVAL "AC.ACL.STATUS"
```

while ACCOUNT.CLOSURE strips its own `AC.ACL.` prefix.

## Verification and generation rules

- Do not invent field positions.
- Do not silently clear extracted fields.
- Open each selected application file once in INIT.
- Reuse the application-specific file name, handle, record, error, and ID variables for contextual F.READ/F.WRITE.
- Preserve deterministic table and field ordering.
- Deduplicate repeated tables and fields.
- Keep `$HIS` and `$NAU` suffixes explicit.
- Treat recovered templates as legacy references.
- Keep OFS Generator and T24 Log Analyzer outside this Phase 1 domain layer.

## Source verification

The source repository was used only to reconcile pure generation behavior and Temenos conventions. No Swing UI code is imported into RepoMind.

The corresponding Temenos-Skills references are the Infobasic programming standards, routine types, and API reference. They establish the distinction between legacy `$INSERT`/CALL code and modern `$PACKAGE`/`$USING` code, the `FN./F./R./E./Y.` variable conventions, file-read error handling, dynamic-array rules, and routine lifecycle patterns.

## API summary

- `generateRoutine(spec)` — deterministic legacy routine structure.
- `generatePreset(id, routineName)` — recovered legacy template with safe routine-name substitution.
- `generateEvalQuery(table, fields, separator)` — application-aware EVAL query generator.
- `insertSnippet(text, offset, snippetId)` — safe JavaScript-offset snippet insertion.

Phase 1 intentionally keeps the UI-independent generator/model layer small so it can be integrated into RepoMind without changing existing analyzer behavior or navigation.
