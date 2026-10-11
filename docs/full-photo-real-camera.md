# FULL Photo / Camera: exact photographed-screen failure — draft PR #2

Historical geometry report. The current cell OCR and initial Auto-convention results are in [the OCR / convention report](full-photo-ocr-convention.md).

Work is confined to `icdumbo/VEF-calculator`, `codex/full-photo-import`, draft PR #2. No merge, main/GitHub Pages deployment, BASIC Android change, PDF import change or audited formula change. Only the existing owner-private preview is updated.

## Reproduction and correction

The exact newly supplied `71602.jpg` is 1536x1375 pixels; SHA-256 `b8986d2494c730d0dab299da1391cf8855103bed35683f3693e918758aab21ec`. It is a photograph of the report on a screen, with tilt, perspective, dark screen borders and colour interference. This differs from the clean PNG and controlled warp used in the preceding report. The previous commit reproduces **Automatic row grid could not be verified** on this exact photograph. The source and real reference values remain outside git and hosting.

The frame estimator selected spurious outer screen edges; the intersections fell outside the image, so normalization was rejected and the row scanner saw sloping rules. The new photographed-screen strategy:

- Samples thin strokes with light pixels on opposed sides, rejecting broad dark borders. Searches slopes at 0.0025 increments, then refines fitted lines. It prefers a repeated ruled table and searches its vertical edges within the table band; frame support tolerates interrupted detection of some long lines without synthesizing data rows. The header and totals remain within the selected table frame.
- Selects this strategy from measured mid-tone/background and border profiles. The prior validated clean-page strategy is retained for clean PNGs and controlled perspective samples. No source filename, expected row count or original values drive recognition.
- Refines column edges from header anchors and continuous vertical support after rectification, tolerating a few pixels of residual slope. It excludes Voyage from Port. Fits each cell's local borders before cropping, keeping those borders out of OCR.
- For a predominantly mid-tone photographed background, the cell copy receives grayscale/contrast and binary processing to reduce coloured background interference. Clean images keep their previous grayscale path. Low-confidence cells can be retried with bounded size/contrast variants; acceptance requires **exactly agreeing text** and all original word-confidence thresholds. Disagreeing or still uncertain readings remain blank.

The existing horizontal row bands still define one candidate per voyage before cell OCR. Extra OCR fragments and missing cells cannot shift a value to another row. No document Voyage, Qualified, STS/Dry Dock exclusion or automatic aggregation is imported. Manual Exclude stays with the inspector. Confirmation/selection/import/edit remain explicit; no automatic VEF calculation.

This is bounded image processing, not reconstruction of missing digits. Severe perspective, glare, cropped grids, curved pages, incomplete horizontal rules or blurred text may still require Advanced correction or another photo. More cell/variant reads increase phone processing time. Assets/model download from CDN; images are processed locally and are not uploaded to an OCR server. Offline import is not guaranteed.

## Actual comparisons

The independent original reference contains 20 voyages x five fields. Tests use **Decimal dot / thousands comma** and **Day / Month / Year**, without manual percentages. All use Tesseract.js/core 7 and the actual browser Project Naptha 4.0.0 English model, decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`. Recognition runs in Node/native canvas, not an Android browser.

| Source | Aligned rows | Fully correct rows | Correct fields | Blank | Wrong accepted | OCR calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Exact phone photograph 71602.jpg | 20/20 | 8/20 | 85/100 | 15 | 0 | 154 |
| Original clean VEF-pagina-1.png | 20/20 | 17/20 | 97/100 | 3 | 0 | 105 |
| Clean PNG with simulated perspective | 20/20 | 17/20 | 97/100 | 3 | 0 | 105 |
| Original digital PDF | 20/20 | 20/20 | 100/100 | 0 | 0 | 0 |

For the exact photo: Port 9/20, Date 19/20, Cargo 18/20, Ship 19/20, B/L 20/20. Blank ports: rows **1, 2, 5, 7, 10, 11, 14, 15, 17, 19, 20**. Blank date: **11**. Blank Cargo: **15, 16**. Blank Ship: **16**. Every accepted field agrees with its own original voyage. The near-100/100 goal is **not reached** on this physical photograph; 15 fields need inspector completion. This must not be reported as the clean PNG's 97/100 result.

Auto numeric convention remains conservative: ambiguous three-digit separators stay blank until the inspector chooses the report's convention and re-reads. Confidence thresholds remain 85 for date/quantities and 70 for Port/Cargo. No permissive parser, guessed values or text repairs were introduced.

## Verification and files

- **52 dependency-free tests pass**, including 1,000 exact-rational mathematical scenarios and existing export assertions.
- New regressions cover dark screen borders around a tilted ruled frame, header-based vertical column refinement excluding Voyage, and local cell borders vs isolated text pixels. Existing row-count, blank-fragment alignment, retry-consensus and safe fallback tests pass.
- Camera/Gallery DOM smoke and PDF DOM regression pass. Digital PDF is re-tested using real PDF.js: 20/20, 100/100, zero OCR. Real photo comparisons assert geometric row indices, expected row count and zero wrong accepted fields.
- `index.html` and `pdf-import.js` are byte-identical to the preceding commit. Existing quantity/date parsers, column OCR, row parser and rule removal used by PDF are unchanged. The new photo-only preparation invokes existing rule removal on copies of photographed cells only. Formula/export scripts, main and Android are not edited.
- Files changed: `photo-geometry.js`, `photo-import.js`, `tests/pdf-source-smoke.mjs`, `tests/photo-cells.test.cjs`, `tests/photo-geometry.test.cjs`, `README.md`, historical pointer in `docs/full-photo-cell-import.md`, and this report. Real photos/oracle/model/diagnostics are outside the repository and deployment archive.

## Reproduction and Android check

With the external dependencies and matching model described in the preceding reports:

```sh
VEF_SOURCE_MODE=photo VEF_PHOTO_AUTO=1 VEF_OCR_LANG_PATH=/private/browser-model node tests/pdf-source-smoke.mjs /private/71602.jpg /private/expected.json
node --test tests/*.test.cjs
```

Open https://vef-full-pr2-preview.duskyowl8.chatgpt.site in Android Chrome and reload. Choose the **exact 71602.jpg**, wait for cell processing, and select Decimal dot / thousands comma / Read selected source if Auto leaves quantities blank. Expected controlled result: **20 table rows found**, with uncertain cells blank. Verify/select/import/edit before Calculate VEF. Real Android WASM/rendering/camera acceptance remains the user's next check. PR #2 remains draft and unmerged.
