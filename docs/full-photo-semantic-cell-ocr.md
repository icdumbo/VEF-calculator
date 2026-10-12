# FULL semantic cell OCR and conservative review — draft PR #2

Only `icdumbo/VEF-calculator`, branch `codex/full-photo-import`, parent `1ccec2a3a3c3608e71f1bad4f583ac4ef5d7cc8e`. Keep draft unmerged; no BASIC/main changes.

## Changes inside fixed voyage/field cells

The complete perspective/crop engine, semantic header/table discovery and horizontal row detector remain byte-identical. Field identity and geometric voyage index never change. A necessary OCR-only adjustment locates those same separators inside each existing row: residual sloping rules were clipping final date digits when fixed column percentages were used. The bounded search stays near each original separator, requires continuous local grid support, preserves ordered non-overlapping cells and falls back to the original regions. It does not mutate the global mapping, anchors or row bands. Every crop is clamped inside its actual row/column; retries never read another voyage or field.

Each cell uses bounded scale, white padding, grid removal, grayscale/contrast, binary thresholds/sharpen, local adaptive threshold or gentle Gaussian smoothing against screen moire. Numeric/date trials also include recognition without a character whitelist, since forced character restrictions can distort Tesseract word confidence. Exact repeated preprocessing/segmentation requests reuse a cell-local cache. At most 35 candidate attempts per cell; no unbounded Cartesian search or whole-page value inference.

Separate semantic validity from confidence:

- Port and Cargo allow multiword uppercase text, digits and normal punctuation, including terminal periods such as product abbreviations. Whitespace/case normalization only; no port/product dictionary or guessed characters.
- Dates accept unambiguous DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY (and existing ISO) under the selected date order, normalize spaces around separators, and validate the real calendar. Missing digits or inconsistent separators are rejected.
- Ship/B/L quantities use the unchanged strict positive-number parser and selected/detected convention. Ambiguous numeric syntax cannot populate a value until the convention is resolved. No digit/separator invention.

Acceptance compares canonical semantic values across distinct preprocessing/segmentation variants. A single high-confidence read is no longer sufficient. Require at least two distinct pixel treatments and either two high reads (weighted confidence >=85, each word >=60) or three corroborating reads including two with weighted confidence >=65. Corroborating reads must have each word >=10 and weighted confidence >=45; zero/weak-only agreement is insufficient. Conflicting high reads or multiple conflicting strong variants keep the cell blank. Choose the highest-confidence supported reading; equivalent valid date separators and numeric formatting agree by their parsed value. Moderate accepted values carry a review note. Photographed-background cells evaluate the bounded set before final selection; clean cells may stop after safe agreement. Confidence remains an engine heuristic, not a correctness guarantee.

## Regression and independent scoring

Private images, models and source references stay outside git/hosting. Node/native canvas and Tesseract.js/core 7 use the actual browser English model (decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`). These are controlled local tests, not a new Android run.

| Source | Aligned rows | Correct | Blank/flagged | Incorrect |
| --- | ---: | ---: | ---: | ---: |
| First original PNG | 20/20 | 100/100 | 0 | 0 |
| Existing digital PDF | 20/20 | 100/100 | 0 | 0 |
| Second real photograph, 99 legible reference fields | 20/20 | 61/99 | 34/99 | 4/99 |

Second reference has one unscored tiny mixed Cargo cell (row 10); its text is not guessed for the oracle. All five columns remain automatically detected. No returned-but-wrong field counts as success. Per field:

| Field | Correct | Blank/flagged | Incorrect | Scored |
| --- | ---: | ---: | ---: | ---: |
| Port | 6 | 13 | 1 | 20 |
| Date | 14 | 6 | 0 | 20 |
| Cargo | 11 | 7 | 1 | 19 |
| Ship | 14 | 5 | 1 | 20 |
| B/L | 16 | 3 | 1 | 20 |

Correct second-source fields increase **44 -> 61** against the previous committed full-width version. Blank fields decrease **52 -> 34**; incorrect accepted fields are **3 -> 4**, so this does **not** solve OCR accuracy or justify a production-readiness claim. The second-source zero-wrong assertion still **fails on four values**. Inspector verification remains mandatory; import never calculates. No rows/columns were shifted. First-source runs use 239 OCR calls; second-source runs use 3443 and can be slow on Android. Cancellation remains available. More recognised fields alone is not proof of a safer result.

127 dependency-free tests pass, including calendar/punctuation/quantity validity, independent moderate-confidence agreement, conflict/weak-only rejection, cache/confirmation fixtures, row-local support bounds and existing mathematical/export/exclusion checks. Photo/Camera and digital/scanned PDF DOM regressions pass. Previously threshold-specific tests now check unsupported/very-low/conflicting values; explicit new tests cover supported moderate values. Mock OCR returns the value of the actual crop rather than advancing a value on every retry.

An earlier faster acceptance candidate was rejected after the private reference exposed more errors. Final reported counts come from the conservative complete photographed-background comparison. No oracle or form values enter production code.

## Files and handoff

Changed: photo-import.js, index.html (photo import cache hash only), tests/photo-cells.test.cjs, tests/photo-ui-smoke.cjs, README and reports. photo-geometry.js, PDF and inline FULL UI/calculation/qualification/exclusion/export scripts remain unchanged. Imported values stay editable, Manual Exclude stays inspector-controlled, no Voyage/Qualified/exclusion decisions are imported.

Owner-private preview: https://vef-full-pr2-preview.duskyowl8.chatgpt.site . Reload and choose the same second original photograph. Wait for the fixed 20-row preview; compare actual values against the source before any import/calculation. This remains an Android test version, not an accuracy guarantee. Keep PR #2 draft and unmerged.
