# FULL semantic evidence reconciliation — draft PR #2

Continues `baa89a048f8ab2982561b70d85ccd523214ea329` in `icdumbo/VEF-calculator`, only `codex/full-photo-import`. Keep PR #2 draft/unmerged. The previous native filters, geometry, 20-row grid and five-column association are retained.

## Semantic candidates before confidence filtering

The photographed-background path now retains every syntactically valid OCR candidate with an actual word payload and valid engine metadata, including words with **zero confidence**. Candidate values use the existing column-specific text, real-calendar date and strict quantity parsers. Canonically equivalent dates/quantities agree without changing or inventing characters.

A fallback needs the same observed canonical value from at least four distinct pixel treatments and two preparation families. It must clearly dominate other candidates (three times the next candidate's pixel support), with no competing valid value supported by four treatments across two families. Confidence alone does not reject such an agreement. The selected raw value is one the engine actually returned; there is no character repair, dictionary or reconstructed value.

A previously selected date/quantity is flagged if another valid value is repeated across different preparations and includes strong evidence, even when some supporting reads have low confidence. This identifies real ambiguity hidden by early word-confidence filtering. Stable legacy consensus remains unchanged. There is no row borrowing, totals/VEF inference, source-specific data or new qualification logic.

For still-unresolved cells, at most eight further reads clean long peripheral border remnants on a native-resolution cell copy, then compare two scales and line/block segmentation. A removable rule must span both ends of the cell; short or tall internal glyphs are retained. This changes pixels in the existing cell only, never the global crop, perspective, row bands or column bounds. Edge-treatment identity is based on actual image bytes and dimensions (SHA-256 in secure contexts); identical pixels cannot manufacture independent agreement, and duplicate engine requests are cached locally.

The finite upper bound is 75 attempts per photographed cell (35 retained legacy + 32 retained native + 8 new edge trials). Supplemental edge work runs only after unresolved semantic reconciliation; clean images keep the previous path. Source-change/cancellation checks and the UI lifecycle are unchanged.

## Independent reference scoring

Private source images, English model, oracle, per-cell trace and engine cache remain outside GitHub and hosting. Local verification uses the unchanged browser English model with Tesseract.js/core 7 and native canvas. Repeated exact image bytes plus exact engine parameters may reuse private actual-engine outputs for verification; no oracle/form values are substituted into OCR.

| Source | Rows | Correct | Blank/flagged | Incorrect |
| --- | ---: | ---: | ---: | ---: |
| First original PNG | 20/20 | 100/100 | 0 | 0 |
| Existing digital PDF | 20/20 | 100/100 | 0 | 0 |
| Second photograph, prior branch | 20/20 | 69/99 | 28/99 | 2/99 |
| Second photograph, this update | 20/20 | 75/99 | 24/99 | 0/99 |

One tiny Cargo reference remains unscored, unchanged. The two previously wrong values are now flagged for review, not guessed/corrected. The zero-wrong reference assertion passes. Blank reduction is **modest** (28 -> 24); the requested large reduction is not achieved. This remains an Android test version and is not a general OCR correctness guarantee.

| Second-source field | Correct | Blank/flagged | Incorrect |
| --- | ---: | ---: | ---: |
| Port / Terminal | 12 | 8 | 0 |
| Date | 18 | 2 | 0 |
| Cargo (19 scored) | 12 | 7 | 0 |
| Ship | 16 | 4 | 0 |
| B/L | 17 | 3 | 0 |

136 unit tests pass, including zero-confidence agreement by each type, invalid syntax/calendar rejection, weak alternatives, pixel duplicate rejection, uneven-confidence numeric/date conflicts and preservation of glyphs during cell-edge cleanup. Photo/Camera and digital/scanned PDF DOM smokes pass. First PNG uses 239 OCR calls; digital PDF zero; second photograph 5447 (previously 5331). Additional bounded edge retries can increase Android processing time; cancellation remains available.

## Scope and handoff

Only `photo-import.js`, its cache hash in `index.html`, cell tests, README and this report change. Global geometry/header/structure code, PDF implementation, FULL UI/calculation scripts, formulas, qualification, Manual Exclude, exports and BASIC remain byte-identical to the parent. No `main` merge.

Owner-private preview: https://vef-full-pr2-preview.duskyowl8.chatgpt.site . Refresh and retry the same second original photograph. Stop after updating the preview for the user's next real Android test.
