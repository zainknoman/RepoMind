# Routine Creator

RepoMind's Routine Creator is a native JavaScript/Vite Temenos routine workspace built on the recovered Phase 1 generator. It deliberately does not import or port the standalone Java Swing UI.

## Phase 1 — generator/model layer

Phase 1 provides deterministic legacy Temenos/Infobasic routine generation from a small application catalog, verified field positions, reusable snippets, recovered legacy templates, EVAL query generation, and safe snippet insertion.

The generator deliberately does **not** infer unverified field positions. A field without a numeric position is emitted as a verification comment rather than invalid BASIC such as `R.ACC<AC.CUSTOMER>`.

## Phase 2 — native RepoMind UI

Phase 2 exposes the Phase 1 model through the **Analyze → Routine Creator** workspace.

The UI provides:

- routine name, developer and purpose metadata
- application table selection
- explicit `$HIS` and `$NAU` suffix selection
- field selection with optional verified positions
- all 14 recovered snippets
- contextual F.READ and F.WRITE generation
- concatenate and explicit clear-field options
- recovered legacy template presets
- EVAL query helper
- live generated routine preview
- validation feedback
- copy and `.b` download actions

The UI calls the Phase 1 generator directly. It does not duplicate routine-generation logic.

## Verification rules

Phase 2 preserves the Phase 1 safety rules:

- field positions are never invented
- unverified fields produce verification comments
- table and field ordering remains deterministic
- repeated table/field input is handled by the Phase 1 generator
- `clearFields` remains opt-in
- recovered templates are presented as legacy reference presets
- the UI does not inspect or modify the repository index

## Deliberate exclusions

Phase 2 does not:

- modify existing analyzer behavior
- replace OFS Generator or T24 Log Analyzer
- port Swing/decompiled Java UI code
- introduce TypeScript
- discover application fields from the indexed repository
- claim modern DS Packager generation
- save generated routines back into a repository

Repository-aware schema/field discovery is reserved for a later phase.
