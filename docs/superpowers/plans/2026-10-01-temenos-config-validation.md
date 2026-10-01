# Temenos Configuration Records and Validation (Phase C7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Validate the Temenos support on real T24 code and fix what it gets wrong; read the
configuration records a repository carries (VERSION, ENQUIRY, EB.API, PGM.FILE, BATCH,
TSA.SERVICE) and link them to the routines they name, with the event each routine runs at
(validation, input, authorisation, enquiry build, batch job…), so Impact answers "which
screens and jobs run this routine?".

**References:** github.com/zainknoman/Temenos-Skills — `temenos-component-analyzer`
implementation guide (R19 field positions, Job → Batch → Service model) and
`temenos-dev/references/table-schema` (R25 positions from the I_F inserts).

**Validation corpora (public, read-only, shallow clones):**
- `MD-Shibli-Mollah/Core_Routines_T24_BP` — 2,669 `.b` core routines.
- `MD-Shibli-Mollah/JBLR22NEW` — 4,846 files of a bank's local development (R09–R22):
  extensionless routines, inserts, five DL.DEFINE packages (69 ENQUIRY, 56 EB.API, 36 VERSION,
  10 PGM.FILE records, release R21) and BUILD.CONTROL exports.

## Findings that drive the plan (measured before any change)

- Indexing: 2,669 files in 2.9 s; 4,383 in 6.9 s — fine.
- Missed routines: names ending in `.CLASS`, `.A`, `.O`, `.LIB`… were treated as binary
  (`COB.IS.LD.ASSET.CLASS`); backup copies with a lower-case suffix (`A.CTR.UPDATE_prev`) were
  not candidates; inserts with `EQU lowerCamel TO 1` or an unnamed `COM A, B` failed the sniff.
- Coding Practices false positives: `CRT.DIS.MESS = …`, `ABORT.FLAG = …`, labels such as
  `PERFORM.ACCOUNTING:` (a dotted name or label is not the statement), and company codes inside
  inline `;*` comments.
- Record layouts: positional DL.DEFINE records confirm the R19 guide's VERSION positions on R21
  data (59 validation, 63 input, 74 id, 75 check record, 77 before auth) and the R25 schema's
  ENQUIRY positions (12 build routine, 18 conversion; the guide's 8 is wrong for R21).

## Architecture

- `lib/files.js`: binary-looking suffixes only in lower case for the risky ones; T24-name
  prefix candidates (`A.CTR.UPDATE_prev`); sniff accepts lower-case EQU names and unnamed COM.
  The walk lists a directory before deciding, so files of a DL.DEFINE package (a folder with a
  `DL.D_*` file) are text records (`ext: '.t24r'`, language "T24 Record").
- `services/temenosRecords.js`: `parseDlHeader`, `decodeFields` (FM = line, VM U+F8FD/0xFD,
  SM U+F8FC/0xFC), `parseNamedRecord` (`FIELD: v`, `FIELD = v`, `FIELD:1:1=v`), `LAYOUTS`
  (defaults with their source), `layoutFromInsert` (EQU positions of a repository's
  `I_F.<APP>`), `recordLinks(application, id, fields, layout)` → `[{ routine, role, field }]`.
- `analyzeSource`: `.t24r` analyses keep `t24record` (`{ header }` or `{ fields }`); `parseBasic`
  keeps `temenos.layout` for `I_F.*` inserts. Index time joins headers, records and layouts:
  `index.temenosConfig` (records with links and the layout source), record symbols (kind
  `record`, e.g. `VERSION FUNDS.TRANSFER,ACME`) and `call` edges/references from each record to
  each routine it names that exists in the repository (high confidence). Cached analyses are
  never mutated.
- `impact.js`: `record` is a container kind, so Impact lists "VERSION … (record)".
- `temenos.js`: analyzer **Temenos Configuration** (record, field/event, routine, in repository or
  not); Coding Practices rules fixed.

## Global Constraints

- Records are read-only data; nothing is executed or sent anywhere.
- A link is reported only when the record names it (field evidence); the event comes from the
  layout and the layout's source is shown (repository insert > default for the application).
- Cache version 10.

## Review Focus

1. A VERSION with two input routines (multi-value) links both — T2 test.
2. A repository `I_F.VERSION` with different positions overrides the default — T2 test.
3. A routine named by a record but absent from the repository is listed as "not in repository",
   never as an edge — T3 test.
4. Re-indexing with reused record analyses does not duplicate links — T3 test.
5. `CRT "x"` and `CRT"x"` still match; `CRT.MSG = 1` does not — T1 test.

---

### Task 1: Detection and Coding Practices fixes
- [x] Tests from the real snippets above; implement in `lib/files.js` and `temenos.js`.

### Task 2: Record parsing (`services/temenosRecords.js`)
- [x] Tests: DL header → (application, id, REC file); positional decode with VM/SM; named and
  OFS forms; layouts and insert override; links and roles for each application.

### Task 3: Index, Impact and analyzer
- [x] Walk/import/snapshot classify DL.DEFINE package files; join at index time; record
  symbols, edges and references; `temenosConfig`; analyzer; Impact shows records.
- [x] Validation run on both corpora, numbers recorded; CHANGELOG, README, IMPLEMENTATION_STATE,
  Help.

---

## Outcome

**Status: complete** — on `main`, 2026-10-01.

Validation (Node, the app's indexer and analyzers on shallow clones):

| | Core_Routines_T24_BP | JBLR22NEW |
|---|---|---|
| Files indexed | 2,669 (all `.b`) | 4,729 (was 4,383): 4,365 BASIC (+16), 330 record files |
| Index build | 2.9 s | 6.9 s (before records) |
| Configuration records | — | 171 (69 ENQUIRY, 56 EB.API, 36 VERSION, 10 PGM.FILE) |
| Record → routine links | — | 154: 146 in the repository, 8 named routines absent from it |
| Coding Practices: STOP/ABORT | 326 → 7 | 24 → 19 |
| Coding Practices: CRT | 127 → 112 | (more files now indexed) |
| Coding Practices: EXECUTE/PERFORM | 198 → 178 | 356 → 348 |
| Hard-coded company code in comments | 2 → 0 | — |

Layouts checked against the R21 records: VERSION 59/63/74/75/77 hold routines whose names follow
the bank's own prefixes for those events (`I.` input, `BA.` before authorisation, `CR` check
record); ENQUIRY 12 (build) and 18 (conversion) match the R25 schema, not the R19 guide's 8.

Differences from the plan:

- Links are computed at index time (`buildConfiguration`) and never written into cached analyses,
  so reusing a record file cannot duplicate them (tested).
- `PGM.FILE` and `BATCH` add `.LOAD`/`.SELECT` links only when those routines exist; the R21
  corpus has no type-B PGM.FILE or BATCH records, so batch links are covered by unit tests only.
- BUILD.CONTROL exports (185 files in JBLR22NEW) are a different format and are not read.
- Unicode value marks are written as `\uF8FD` escapes in source (the editor tool had turned them
  into invisible characters once).

Tests: 258 unit (`temenosRecords.test.js`, real-snippet detection and practices tests).
