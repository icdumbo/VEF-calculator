# Diagnostic 0.2.2 parserfix1 (versionCode 6)

Base: 8e9d952 on codex/vef-mlkit-lab-diagnostic-022. This is an isolated lab.

## Device evidence and scope of the diagnosis

The exported Fold initfix1 run reaches OCR completion (975 ms, one call), extracts
173 blocks / 194 lines / 275 elements, and persists the raw OCR. The combined
PARSER_INCLUDING_INTERNAL_VALIDATION stage is terminated after 5504 ms against
its unchanged 5000 ms budget. That old journal does not identify a substage.

JVM instrumentation of the same raw token input finds 574468 bounds/letter checks
inside textGroups. The greedy algorithm restarts its scan after each successful
merge, repeatedly reconstructing unchanged bounds and compiling the letter regex.
A local instrumented JVM replay spent about 305 / 395 ms in grouping. This is a
confirmed redundant-work defect and the leading explanation for the Android
parser timeout; the new device journal must confirm the actual on-device phase.

## Narrow performance repair

The existing recovered textGroups control flow, comparisons, merge order and
membership are retained. A per-call identity cache reuses bounds for each group;
addAll changes its size and invalidates only that group's cache entry. Letter
checks use the exact existing regex, precompiled once, with per-call text caching.
The original bounds implementation is copied to a public diagnostic bridge by ASM,
not rewritten from decompiler pseudocode. Cache contents are discarded after
normal completion, and the service wrapper clears them on exceptions as well.

The auditable recovery tool changes only TableParser and OcrDiagnosticService;
the other 39 recovered classes are byte-identical to the normalized original.
The initialization fix remains in place. Historical 0.1 sources remain untouched
and excluded from the diagnostic implementation.

## Persistent phase measurements

The service calls ParserRuntime.parse. Persistent PARSER_PHASE_BEGIN/END events
cover DATE_ANCHORS, HEADER_CANDIDATES, HEADER_SELECTION_AND_GEOMETRY,
TEXT_FRAGMENT_GROUPING, CELL_ASSOCIATION, and
CELL_VALUE_ASSEMBLY_AND_INTERNAL_VALIDATION. The last block includes cell text
assembly and final bookkeeping as well as internal validity/boundary/confidence
checks; its label deliberately does not claim pure syntax-validator time.
PARSER_SUMMARY contains durations in nanoseconds, total milliseconds, cache
requests and real computation counts. The last persisted BEGIN identifies the
active phase even if the OCR process is killed before an END can be written.

These events never reset the parser's 5000 ms budget or the global 15000 ms
budget. The existing independent watchdog, secondary process, cancellation,
raw persistence, report export and manual-review policy remain unchanged.

## Executed validation

- Codespace Gradle 9.7.1 / JDK 25, Java target 17: 32 tests, 0 failures, 0 skipped.
  This includes 14 historical 0.1 tests, 13 recovered diagnostic tests and 5 new tests.
- Android Lint: 0 errors, 10 existing SetTextI18n warnings for English-only labels.
- assembleDebug succeeded in 35 seconds.
- New tests check cache invalidation, Unicode/newline regex equivalence, unchanged
  deadlines, 120 randomized grouping cases, all 100 distinct synthetic cell values
  AND token IDs, and replay of the new 275-element real raw OCR report.
- Old 267-element fixture: 20 rows / 100 associated; 66 candidates, 32 review,
  2 invalid. Existing per-cell values/status/reasons remain unchanged.
- New Fold 275-element fixture: 20 rows / 80 associated; 41 candidates, 39 review,
  0 invalid among associated cells, 20 blank/review. Every value, status, reason,
  header decision, geometry result, unassigned reason and evidence ID matches the
  old parser. No token is assigned to two cells. No numeric repair was added.
- Same-run Codespace JVM replay: before 649.332 ms, after 240.348 ms including
  persistent journal writes. This is a single replay, not an Android benchmark.
  New grouping phase: 106.356 ms; cell assembly/internal-validation block: 4.101 ms.
  Group bounds computations: 574468 requests -> 323 actual computations;
  letter checks: 574468 requests -> 255 actual regex evaluations.
- 18 diagnostic tests were also rerun successfully against classes extracted from
  the compiled APK, rather than only against the pre-build JAR.

## Association limitation (not an accuracy score)

The new input reads the B/L Figures header as BIL + FIGURES. The existing header
aliases do not accept BILFIGURES. Therefore all 20 cells in that column remain
blank with MISSING_OR_CONFLICTING_HEADER. Each of the other four columns has
20 associated cells. No header alias or VEF extraction rule was changed in this
performance fix. This is 80 associated cells, NOT 100 correct cells. Neither a
matching prior parser nor a synthetic 100-cell test proves accuracy on the photo.
The original photo/independent ground truth was not present in this diagnostic
ZIP; no new 100/100 accuracy result or zero-error accuracy claim is made.

## APK and device follow-up

Package: org.vef.mlkitlab.diagnostic (different from BASIC).
Version: 0.2.2-diagnostic-parserfix1, versionCode 6.
Delivered APK signed with the same existing lab certificate as initfix1;
v2/v3 verified. Only signing metadata differs from the Codespace build artifact.
SHA-256: 904f29d1b1a25adc5d88ba04f424aee2c2d68f7a4f845e4c5cc250ba3036a9c8.
No photos, raw reports, private fixtures, keystores or local.properties committed.

Install over initfix1 without clearing data. Process the same photo, then export
the diagnostic ZIP whether it succeeds or times out. Inspect phase durations,
PARSER_SUMMARY, final outcome, row/column evidence and visually verify the values.
A new Galaxy Fold test is required before declaring the timeout resolved or the
15-second target met. No BASIC, FULL, main, PR #2, preview or other branch changed.
