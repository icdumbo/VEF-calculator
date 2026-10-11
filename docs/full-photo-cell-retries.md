Current Port-only confidence follow-up: [Port consensus report](full-photo-port-confidence.md). The thresholds and results below describe the previous commit, before that follow-up.

# FULL controlled cell recovery and B/L / Shore header aliases — draft PR #2

Scope: only `icdumbo/VEF-calculator`, branch `codex/full-photo-import`. Keep PR #2 draft and unmerged. No main/GitHub Pages deployment or BASIC Android edits.

## Generic recovery inside existing geometric cells

The perspective engine, horizontal row detector, column refinement and local cell-border fit remain unchanged from `dbed2c23ff128ec99fadcbf355e218e298ef3b39`. Every OCR attempt receives the same voyage index and field. Missing or fragmented recognition cannot add, delete or move a row.

Only uncertain / invalid first reads enter a finite retry list, with early exit after safe agreement:

- Crop slightly wider inside the same column, capped one pixel inside its column edges. Top/bottom expansion stops at the immediately adjacent rule guard (one pixel beyond the existing text band), never at another voyage's text.
- Prefer a content crop within the original cell: connected ink components with letter/digit-sized heights seed the text box; long/edge table strokes and peripheral specks are not seeds. Small numeric/date separators inside the text box stay untouched. Add proportional padding, clamp to the original cell, and use the original bounds when no reliable text box exists. This is not OCR word repair.
- Upscale with grayscale/contrast, binary threshold and optional sharpen. A maximum-RGB projection reduces coloured background interference. A limited 1.15 horizontal glyph-scale variant and line/block/word segmentation variants are available. No pixels from another column/voyage or external answer dictionary are used.
- A retry result is accepted only after **two agreeing confident valid readings**, with no contradictory confident valid reading among the variants already examined. Original thresholds remain 70 for all text words and 85 for all date/quantity words; no threshold is lowered. Dates must pass calendar validation; quantities must pass the existing strict parser; text must pass the existing uppercase/punctuation validation. Malformed values, border fragments, conflicting reads or insufficient confidence stay blank with raw OCR / review warnings. Confidence does not guarantee correctness.

The list is bounded (up to 35 reads including the primary read per uncertain numeric cell in the photographed-background profile). It is not a Cartesian sweep or repeated full-table OCR. Content bounds are computed once per cell; successful readings stop further attempts. Poor images can still take longer on a phone; cancellation and Advanced correction remain available.

## Numeric convention and report aliases

New Gallery/Camera selection still starts Auto and the same processing route as Read selected source. Confident numerical syntax resolves decimal dot vs comma before the initial preview, requiring at least three unambiguous evidence cells and no contrary evidence. Insufficient / genuinely ambiguous evidence remains Auto; manual selection remains a correction option. This inference and shared quantity/date parsers are unchanged.

Both Photo and digital PDF header detection now map **B/L FIGURES, BL FIGURES, B/L QTY, SHORE FIGURES and SHORE QTY** to the same existing `bl` reference-quantity field. Recognition is case-insensitive and also handles joined header tokens such as SHOREFIGURES / BLQTY. A Shore header needs corroborating FIGURES/QTY nearby. B/L DATE remains a date heading, not the reference quantity. No Ship/reference swap or change to VLR, Average Ratio, limits, qualification, exclusions or LOAD V.E.F.

PDF changes are confined to these header aliases. PDF text extraction, text-first selection, strict parsing, scan OCR, preview/import, and conventions retain their prior behavior. Document Voyage, Qualified, STS/Dry Dock decisions are not imported. Imported rows stay editable and import never calculates VEF.

The two changed external import scripts have content-hash query versions in `index.html` to ensure the new files are requested rather than reusing older cached URLs. No interface redesign or inline calculation/export code is changed. The supplied report has no hardcoded count or values in runtime code.

## Independent comparisons

Exact supplied screen photograph `01-71602.jpg`: 1536x1375; SHA-256 `b8986d2494c730d0dab299da1391cf8855103bed35683f3693e918758aab21ec`. Source photographs, independent 20x5 oracle, trained data and diagnostics remain outside git and hosting. Tests use Node/native canvas, Tesseract.js/core 7 and the actual browser English Project Naptha 4.0.0 model, decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`. They are not a new Android browser run.

| Source / mode | Aligned rows | Fully correct rows | Correct fields | Blank | Wrong accepted | OCR calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Exact photograph, initial Auto | 20/20 | 18/20 | 98/100 | 2 | 0 | 278 |
| Exact photograph, explicit decimal dot | 20/20 | 18/20 | 98/100 | 2 | 0 | 278 |
| Clean original PNG, initial Auto | 20/20 | 17/20 | 97/100 | 3 | 0 | 181 |
| Synthetic perspective PNG, initial Auto | 20/20 | 17/20 | 97/100 | 3 | 0 | 179 |
| Original digital PDF | 20/20 | 20/20 | 100/100 | 0 | 0 | 0 |

Exact photograph improves **94 -> 98/100**. Per field: Port **19/20**, Date **19/20**, Cargo **20/20**, Ship **20/20**, B/L **20/20**. First-row Port and fifth-row B/L figure are correct, as are Port row 10 and Date row 11. Remaining uncertain blanks: **Port row 11, Date row 18**. No accepted value differs from its own original voyage. The **100/100 target is not reached** on this exact photograph. Clean PNG remains a separate 97/100 case (blank Ports 1, 11, 19), not a phone-photo result.

Initial Auto independently resolves `dot`. Auto and explicit-dot runs produce **identical complete objects for all 20 rows**, including five values, raw OCR, confidence flags and warnings. No manual selector change or second read is needed to obtain this controlled result. New Android behavior/rendering/camera remains for user confirmation.

## Validation and files

- **75 dependency-free tests pass**, including 1,000 exact-rational math scenarios and existing export assertions. Added tests cover photo/PDF header aliases with varied capitalization and joined tokens, content crops preserving internal separators, safe fallback without ink, and retry bounds preserving row/column identity. Existing low-confidence/conflict tests remain.
- Photo/Camera DOM smoke and PDF digital/scanned DOM regression pass. The original real digital PDF is re-extracted at 20/20 and 100/100, zero OCR. The real photo smoke asserts row count, geometric source index and zero wrong accepted fields.
- Byte comparisons confirm all shared quantity/date/row parsers, PDF column OCR/rule removal, numeric inference, geometric row/column detection and local border fit unchanged. `photo-geometry.js` is byte-identical. The inline VEF and export script in `index.html` is byte-identical; only the two external import script URLs changed.
- Changed files: `photo-import.js`, `pdf-import.js` (header aliases only), `index.html` (script cache versions only), `tests/photo-cells.test.cjs`, `tests/photo-auto.test.cjs`, `tests/pdf-import.test.cjs`, README, a historical report pointer and this report. No source images, oracle, model, Android or unrelated project files are committed/deployed.

## Android check

Existing owner-private preview: https://vef-full-pr2-preview.duskyowl8.chatgpt.site . Reload, select the exact original photo using Gallery or Camera and wait for **20 table rows found. Decimal dot / thousands comma.** Inspect the first preview without changing the convention or pressing Read selected source. Verify/select/import/edit before explicit Calculate VEF. Manual convention and Advanced correction remain fallback. PR #2 stays draft; do not merge.
