# FULL per-cell native filtering and validation — PR #2

Continues parent `21f1ce9d4b972bd3a3da6bf74891445b88db898b` in `icdumbo/VEF-calculator`, only `codex/full-photo-import`. PR #2 remains draft and unmerged. Existing geometry, row detection, semantic column mapping and earlier OCR improvements are retained.

## Cell processing

For the measured photographed-background profile, supplemental OCR works on a bounded copy of each existing cell before enlargement. Gaussian smoothing, small median filters and native thresholding reduce fine screen texture. A content-only retry uses the already-existing component detector on that filtered copy, still inside the same row and column. Border removal on native copies precedes selected filters. No global crop, perspective, table detector or row/column boundaries are changed.

Each family has at most eight attempts, following a fixed preprocessing order. The existing cached legacy set remains limited to 35 attempts; at most 32 supplemental attempts are possible per cell. A legacy result with validated consensus, weighted confidence >=90 and each word >=60 keeps its existing reading without supplemental work. Native duplicates are cached and identical winning pixel treatments cannot count as two independent families.

Existing per-family semantic validity and confidence checks are retained. Selected families must agree on the canonical value. A moderate winning result (<85) needs confirmation from another distinct family; repeated high-confidence legacy alternatives veto replacement. Disagreement stays blank/flagged. No dictionary, source-specific values, character substitutions, cross-row inference, totals or VEF-derived guesses enter OCR. Dates still require a valid calendar; quantities still use the unchanged strict parser and numeric-convention inference.

## Independent verification

Sources, English model, oracle and diagnostic outputs remain outside GitHub and hosting. Local runs use Tesseract.js/core 7, native canvas and the unchanged browser English model. These are not real Android browser runs.

| Source | Rows | Correct | Blank/flagged | Incorrect |
| --- | ---: | ---: | ---: | ---: |
| First original PNG | 20/20 | 100/100 | 0 | 0 |
| Existing digital PDF | 20/20 | 100/100 | 0 | 0 |
| Second real photograph, prior branch | 20/20 | 61/99 | 34/99 | 4/99 |
| Second real photograph, this update | 20/20 | 69/99 | 28/99 | 2/99 |

One tiny Cargo field on the second reference remains unscored (`null` oracle). The reusable real-source scoring harness now explicitly skips such unknown reference fields instead of counting them as blank or incorrect. No reference data changed. All five columns remain associated; numeric convention is detected as decimal dot. The two residual incorrect accepted fields are Date and B/L on geometric row 17. The zero-incorrect real-source assertion **still fails**; this is an Android test preview, not a finished accurate importer.

| Second-source field | Correct | Blank/flagged | Incorrect |
| --- | ---: | ---: | ---: |
| Port / Terminal | 8 | 12 | 0 |
| Date | 15 | 4 | 1 |
| Cargo (19 scored) | 12 | 7 | 0 |
| Ship | 16 | 4 | 0 |
| B/L | 18 | 1 | 1 |

131 unit tests pass, including native cell-copy bounds, moderate independent agreement, conflicting-family rejection, duplicate-pixel rejection and bounded photographed-cell retries. Photo/Camera and digital/scanned PDF DOM smokes pass. First PNG uses 239 OCR calls; digital PDF uses zero. The photographed source requires many bounded retries and remains slow; cancellation remains available. Inspect every accepted value before importing or calculating.

## Scope and Android handoff

Changes are limited to `photo-import.js`, its cache hash in `index.html`, cell tests, generic source-test scoring and this report/README. Geometry, PDF implementation, FULL calculations/qualification/Manual Exclude/export/UI scripts and BASIC are unchanged.

Owner-private preview: https://vef-full-pr2-preview.duskyowl8.chatgpt.site . Refresh and retry the same second original photograph. Stop here for the user's real Android test. Do not merge PR #2 or modify `main`.
