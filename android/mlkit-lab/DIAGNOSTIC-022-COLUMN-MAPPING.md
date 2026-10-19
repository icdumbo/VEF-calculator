# Column Mapping diagnostic

Base: cellretry1, 95dccd7864820ae485e8332cdf8c020301383d1c. Only the diagnostic lab is changed. Existing recovered diagnostic/parser and launcher remain available unchanged, with a new Column Mapping entry button.

The source-based mapping screen opens from the existing diagnostic launcher. Its worker runs in :column_mapping, separate from the UI and the previous :ocr_diagnostic process. It uses the same bundled ML Kit Latin recognizer, initialization ordering, calendar validator, quantity validator and bounded invalid-cell reread helper. No network permissions or paid services.

Flow: one whole-image OCR -> persist raw tokens -> physical layout -> inspector edits column limits -> inspector maps each column to one standard field or Ignore -> cached-token association/validation -> bounded invalid-cell rereads -> manual value review. The independent oracle is never part of selection/extraction.

Physical layout uses observed date anchors, skew estimation, repeated row occupancy and gaps, with no dictionary of header names. Header fragments and word confidences are retained in raw JSON. Extra columns are shown, not discarded. The actual observed row count is recorded; at most 20 voyages are imported, with a warning on excess rows.

The photo overlay supports dragging separators (including outer limits), precise pixel limits, splitting a merged column and merging a false split. Samples update without OCR. Any geometry change invalidates semantic choices. No OCR element is divided into guessed character fragments: crossing elements leave affected cells invalid and retain original token evidence in the ambiguity report. Cell rereads use original oriented pixels, clipped/masked to the inspector-confirmed column and row polygon; they never repair digits or auto-confirm candidates.

Confirmed mapping profiles are stored only in local preferences: layout signature hash, normalized separator positions and semantic choices/Ignore. No document values, original header text or photographs are stored in profiles. Compatible profiles are proposals requiring inspector reconfirmation. A local draft supports restart/resume. Original source photos are retained only in private mapping-cache for this workflow; starting a new session removes the previous active cached photo. ZIP diagnostics include JSON/JSONL, not photographs, profiles or credentials.

ProcessingBudget carries previous machine time into each new RunJournal. The cumulative processing deadline remains 15000 ms; inspector interaction time is excluded. A pending job is conservatively charged the full budget after an unclean restart. Worker watchdogs, bounded native waits and process-specific cancellation preserve logs. Native ML Kit tasks do not expose cancellation; only the isolated mapping process is terminated. Session state and diagnostics are durable before result delivery.

The UI uses only neutral field labels in English: Port / Terminal, B/L Date, Cargo, Ship's Figures, B/L Figures. Mapping confirmation never approves OCR values. Original and alternative reread values remain unconfirmed for inspector review.

Validation and real-device limitations will be appended after build checks. JVM replay is not a new Android OCR measurement.

Validated: 70/70 Gradle tests (51 existing + 19 mapping tests), zero skipped/failures. Android Lint: 0 errors, 15 SetTextI18n warnings and 1 DrawAllocation warning. Additional 56/56 diagnostic tests passed against classes extracted from the final signed APK, executed in Codespace with private fixtures kept there.
Real JSON replay: clear 324-element report -> 20 rows, 9 physical columns, explicit inspector mapping, 100 correct / 0 wrong / 0 missing. Latest Fold report -> all 100 original values unchanged, including the invalid quantity; 68 coherent unconfirmed candidates, 31 review candidates, 1 invalid. The 20 header-alias warnings are resolved by explicit inspector column confirmation, not by changing OCR text or suppressing confidence warnings. These are cached JSON replays, not new Android OCR results. Native mapping UI, native timings and cell rereads still require Galaxy Fold testing.
Final APK: org.vef.mlkitlab.diagnostic; versionCode 9; versionName 0.2.2-diagnostic-mapping1. Existing MainActivity launcher and signing certificate retained. APK SHA256 3c74fec88ca71e9b47b9c162d9dd1b16b948bf1783e9c95d4db4dc38b5f4da90. No Internet permission; static APK branding scan passed. No private fixtures, signing keys, photos or local.properties committed.


## mappingfix1: explicit column selectors

The mapping1 device screenshot contains a selector between Column 1 samples
and the Column 2 heading. It displays Port / Terminal, but has no column label
of its own. Source inspection also confirms one Spinner is created for every
physical column, starting at index zero. An actually omitted first Spinner is
not demonstrated by that capture; the demonstrated defect is ambiguous visual
ownership, compounded by implicit control sizing and an unlabelled dropdown.

Each column now has a bordered card, an explicit Map Column N to field label,
a full-width 56dp selector before the samples, a named dialog and a persistent
Column N selection summary. Generated view IDs, zero-based physical-column
tags and a captured physical-column index keep controls bound to their own
column. Ignore remains a normal explicit choice for any column, including
the first and last; there is no header-specific automatic Ignore assignment.

Robolectric view tests exercise the actual Step 2 activity on Android API 28
and 35, nine columns, narrow and wide widths, positive selector dimensions,
unique IDs, first/last selectors, independent choices, Ignore, duplicate
rejection and restored choices without rewriting stored selections.
Run :app:testBaseline01 :app:testMappingUi :app:lintDebug. The view task uses
the app-module working directory for Android resources; legacy replay tests
keep their historical lab-root working directory. Robolectric is test-only
and is not packaged in the offline APK.

OCR, parser, geometry, cell rereads, review rules, the 20-voyage cap and the
15-second cumulative processing deadline are unchanged. A real Galaxy Fold
UI test is still required after installation; JVM view tests do not prove
Samsung rendering or a new device OCR accuracy result.


## confirmfix1: load completed mapping results

Root cause: raw OCR is saved before physical-column detection and intentionally
has no layout property. Confirm Mapping saves the selection and the worker
can finish successfully, but the result loader then demanded layout from the
raw OCR file. The resulting missing-layout exception prevented Step 3 from
being rendered. The saved-results error is therefore the display blocker,
not a rejection of the valid five-field/four-Ignore mapping.

Read original geometry from the separate detection file. Preserve compatibility
with older raw files containing geometry, and fall back to the completed
result's confirmed mapping when the detection file is unavailable. This is a
read-only recovery path: no migration, removal or rewriting of existing OCR,
results, profiles or diagnostics. Reopening a completed result runs no OCR.
Disable repeat confirmation while a saved result is loading, then restore
controls on success or failure. Keep the existing error message and state on
failure with an explicit assurance that saved diagnostics are retained.

Android view regression tests use the saved device JSON, confirm nine physical
columns with five fields and four Ignore choices, inspect the apply request,
simulate the completed worker response, and verify 100 displayed original
values including the invalid four-decimal quantity. They also reopen the saved
result after activity recreation, with and without the separate detection file.
The test does not run native ML Kit or cell rereads; it exercises the real UI,
file loading and worker/UI data contract. Phone confirmation remains required.

Validation: 84/84 tests passed (14 Android view cases on API 28 and 35), Android Lint 0 errors / 19 warnings, debug assembly passed. 56/56 regressions also passed against classes extracted from the final signed APK. Native Galaxy Fold confirmation remains pending.
