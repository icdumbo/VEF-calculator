Current crop/header follow-up: [Full-width report](full-photo-full-width.md). The crop limitation and results below describe the preceding commit.

# FULL semantic photo columns — draft PR #2

Scope: only `icdumbo/VEF-calculator`, `codex/full-photo-import`, parent `d4f1c92adeebeaa2a86a37649af635b7c9c10de7`. No merge, BASIC/main edits, PDF or calculation/export changes.

## Diagnosis and change

The legacy bare-DATE path assumes DATE precedes Cargo and requires a recognised Port. The second real form has Cargo before Date; its corrected crop also omits the original Voyage/Port columns. Page-wide/header-block OCR misses Cargo and reads the reference heading incorrectly despite visible clear pixels.

Preserve the legacy detector verbatim as the preferred first-format path. Add a semantic fallback: identify labels and their OCR bounding boxes, pair same-line adjacent or vertically stacked label words, sort anchors by physical coordinates, and use table rules or semantic gaps for boundaries. No fixed order, percentages, source values or voyage count. Dates and both quantity headers plus real paired quantity evidence are required; Cargo or Port must corroborate the table. Incomplete/conflicting/overlapping mappings safely fail.

Aliases include Port / Terminal; DATE / B/L DATE; CARGO / PRODUCT; SHIP'S FIGURES / SHIP FIGURES / VESSEL FIGURES / SF TCV; B/L FIGURES / BL FIGURES / SHORE FIGURES / BoL TCV and existing QTY variants, case-insensitive and joined tokens where applicable. They only select the existing semantic fields. Document Voyage, Qualified or exclusion decisions are never imported.

If sparse/page-block recognition fails, retry a short **DATE-positioned header band** from the untouched detection copy, with rule removal, maximum-RGB grayscale/contrast and bounded scaling/padding. Map OCR coordinates back to the source canvas before combining evidence. No hardcoded band/column positions. Keep the existing horizontal row algorithm, geometry engine, cell preprocessing and confidence policies. Missing optional Port/Cargo columns stay blank with explicit review warnings, rather than aborting all available cells or fabricating their positions.

## Tests and limits

120 dependency-free tests pass, including all 120 permutations of the five semantic fields, 36 reordered alias combinations, same-line/stacked headers, evidence guards, preprocessed-header coordinate remapping and optional-column geometric row preservation. Existing mathematical/export/confidence/exclusion tests and Photo/Camera + digital/scanned PDF DOM smokes pass.

Controlled real OCR uses Node/native canvas and Tesseract.js/core 7 with the browser English model (decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`), not an Android browser rerun.

- First original PNG: **20/20 aligned rows, 100/100 correct fields**, 181 OCR calls, automatic decimal dot; zero blank/wrong. This mandatory regression passes.
- Digital PDF: **20/20 rows, 100/100 correct fields, zero OCR**. PDF source unchanged.
- Second real photograph `71629.jpg`: automatic discovery now succeeds for Cargo, Date, Ship and B/L; rules yield **20/20 aligned voyages** and geometric per-cell OCR runs without manual mapping. Original Port/Voyage columns are outside the existing corrected crop. They cannot be recovered from missing pixels; Port stays blank with a column-not-identified review warning. Perspective engine remains unchanged deliberately.
- Private independent reference: 99 legible source fields transcribed; row 10's tiny mixed Cargo text remains unscored rather than guessing its transcription. Of those 99, **49 correct, 48 blank, 2 wrong accepted**. Port 0/20 (20 blank), Date 9/20 (10 blank, one wrong), Cargo 10/19 (nine blank), Ship 13/20 (seven blank), B/L 17/20 (two blank, one wrong). The second-image zero-wrong smoke assertion **fails** on Date and B/L row 17. These are OCR recognition errors, not swapped rows or formula changes; the existing high-confidence primary-read policy is unchanged in this column-only change. Do not describe this format as accurate/ready for production. 1320 bounded OCR calls can be slow on a phone. Preview is for further Android verification and explicit inspector review, never unattended calculation.

This update fixes automatic semantic column discovery, not the remaining second-photo crop/OCR limitations. No claim of 100/100 on the second source. Browser rendering/model output can differ; report user Android results separately. Photos, reference data, diagnostics and models remain private and outside git/hosting.

Changed files: photo-import.js, index.html (photo script cache hash only), tests/photo-auto.test.cjs, tests/photo-cells.test.cjs, README and this report. All other FULL interface/formulas/export code, PDF file and photo-geometry.js byte-identical.

Owner-private Android preview: https://vef-full-pr2-preview.duskyowl8.chatgpt.site . Reload, choose the second original photo, wait for the automatic preview and check field positions/values against the source. Do not use unverified OCR values for a report. PR #2 stays draft and unmerged.
