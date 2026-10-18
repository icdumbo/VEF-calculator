# Invalid-cell reread diagnostic (cellretry1)

Based on headerfix1 ffec79e. Parser, geometry, associations and VEF rules unchanged.
Only cells with status `invalid` are eligible. Original oriented-bitmap evidence crop, clipped padding before adjacent evidence; unsafe/oversized crops are skipped. Two variants: original crop and 2x bilinear upscale with contrast 1.12. The existing offline Latin recognizer is reused. No extra document OCR or ML Kit initialization.

All original values/statuses/reasons remain unchanged. New raw text, element confidences and crop coordinates are diagnostic candidates, never automatically selected. Both matching and conflicting rereads require inspector confirmation. UI lists candidates beside the original editable field in English with Review Required.

Limits: at most 4 invalid cells, 2 calls per cell, 1700 ms per native wait, 4500 ms total retry budget, 3000 ms reserve before the existing 15000 ms global deadline. No new calls after cancellation, native timeout, error or budget exhaustion. ML Kit tasks cannot be cancelled; a timed-out native task may finish later, owns its crop until completion, and is not retried. Existing secondary-process cancellation/watchdog remain authoritative. Original bitmap is never recycled by the optional reread helper.

Before every native call, attempt metadata is durably persisted. After each completion, all candidates and timings are persisted to `<run>-cell-rereads.json` and journal. Existing ZIP export includes these JSON files, including after restart. Whole-document count remains `ocrCalls=1`; additional `cellOcrCalls` and `totalOcrCalls` prevent misleading counts.

Tests use a real headerfix1 result fixture stored only under ignored build/private-fixtures, and fake engines for deterministic policy checks. Replaying the fixture targets one invalid cell and leaves all 100 original cells unchanged. Fake candidates are test data, not a claim about ML Kit reread accuracy. Actual retry duration and successful recovery must be measured in the new Galaxy Fold export. No claim of 100/100 is made before that test.

Validation: 51/51 Gradle tests, zero skipped/failures; Android Lint 0 errors and 10 pre-existing SetTextI18n warnings. Additional 37/37 diagnostic tests passed against classes extracted from the final signed APK. The recovered parser class in the generated pre-D8 JAR is byte-identical to headerfix1. Final APK package org.vef.mlkitlab.diagnostic, versionCode 8, same lab signing certificate verified locally. Real-device reread time/accuracy remain pending. Private fixture excluded from source control and APK.
