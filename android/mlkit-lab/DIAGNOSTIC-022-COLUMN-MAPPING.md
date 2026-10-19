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
