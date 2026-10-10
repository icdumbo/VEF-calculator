# FULL: Import VEF from Photo — first implementation

Scope: FULL only, based on main `bcf3df5a3d5483237aeaa22344139c5b8fb69bfe`. This branch is for review, not deployment or merge. BASIC Android, its signing, package and release refs are unchanged.

## Workflow

1. Open **Import from Photo** beside the existing controls.
2. Choose an image from the device, or use **Take photo**. The file input requests the rear camera with `capture="environment"`; the browser / OS decides what picker it provides. Gallery selection has a separate input without capture.
3. Assign the left / right edges of each available column using percentages of the photo width. Select an edge and tap the image, or type the bounds. Missing columns can remain unassigned. Column regions cannot overlap.
4. Set the top / bottom percentages to include the voyage table, and confirm the date and number conventions. The default number mode leaves ambiguous separators blank. The date convention is explicitly shown as day/month/year, with month/day/year also available; ISO dates are accepted directly.
5. Read the photo. Check the preview against the original and explicitly select voyage rows. No rows are selected automatically; skip headers and totals.
6. Append the selected rows to the existing editable table. Existing voyages and manual exclusions are preserved. Imported rows have Manual Exclude unchecked and no exclusion reason.
7. Verify and correct every value and make any manual exclusions. Press **Calculate VEF** only when ready. Import itself does not calculate VLR, totals, average, qualifications or final VEF. Input edits, row additions, saving / restoring history and page reloads preserve this review gate. Excel / PDF export is blocked until explicit calculation.

No Voyage No., automatic aggregation, STS / dry-dock exclusion, extra calculation rule, OCR account or server upload is added.

## Recognition method and privacy

- Tesseract.js **7.0.0**, Tesseract.js-core **7.0.0**, English `eng.traineddata.gz` from `https://tessdata.projectnaptha.com/4.0.0`.
- Lazy-loaded browser Web Worker / WebAssembly. Engine and worker / core assets come from jsDelivr; the language model comes from Project Naptha. These hosts receive normal asset-download requests. The photograph is processed locally in memory; there is no OCR API request containing it.
- Image recognition is capped at a longest dimension of 3,000 pixels; input files must be images of at most 20 MB. There is no automatic rotation or perspective correction.
- `tessedit_pageseg_mode=6` (single text block); TSV output contains word rectangles and confidence. Words are grouped by vertical centers and assigned to the inspector's column regions by horizontal position. A word crossing a region edge makes that cell uncertain.
- Minimum word confidence: **85** for quantities / dates, **70** for port / cargo. Below threshold, the field is blank and the preview shows the original OCR text in review notes. Missing / syntactically invalid values are also blank. Every imported value still requires human review: high confidence can be wrong.
- Quantity parsing never substitutes guessed characters (for example `O` → `0`). Positive values with at most three decimal places are accepted. In Auto mode, a single separator followed by three digits (`1,234`, `1234.567`) is ambiguous and remains blank; choose an explicit decimal convention if appropriate. Invalid thousands grouping is rejected.
- Dates require four-digit years and real calendar dates; no missing date or year is inferred.
- Photo object URLs and workers are released on completion / cancellation. Photos are not written to localStorage or history. Imported text and the review-pending flag use the existing local draft / history storage. Standard browser caching may retain downloaded OCR assets / language data.

## Limitations and phone review still required

This is assisted OCR, not automatic semantic table detection. It requires the inspector to map columns. Best input: upright, sharp printed table, one physical line per voyage. Handwriting, glare, low contrast, skew, dense grids and wrapped / multiline cells can produce missing, split or incorrect rows. No automatic stitching of split rows is attempted. Incorrect column assignments can swap otherwise confident values; the inspector must check them. Header / total rows can appear in the preview and must not be selected.

Internet access is required for OCR assets; offline OCR availability is not guaranteed even after a prior use. Existing calculations / reports do not depend on these downloads. HEIC support depends on the browser; convert to JPEG / PNG if it cannot display the photo. Runtime performance and memory vary on phones.

A real Android / iOS browser and camera / gallery test was **not** completed in this environment. Browser automation could not install its Chromium binary. The DOM interaction test below uses jsdom, a mocked OCR worker and canvas; it does not prove real rendering, WASM downloads, camera behavior or mobile performance. Those remain acceptance checks before merge.

For review, check out this branch and serve the repository with `python -m http.server 8000`, then open `http://localhost:8000`. Do not publish or replace the BASIC Android build. On a phone, open a reachable review server and test both file controls, a real photo, edits, reload before calculation, explicit calculation, manual exclusion and both reports.

## Verification performed

- `node --test tests/full-math.test.cjs tests/photo-import.test.cjs`: **24 tests passed**, including the existing 16 calculation / export cases and 1,000 deterministic scenarios against the exact rational oracle.
- Added parser tests: quantity ambiguity / conventions, calendar dates, five-field geometry, confidence / boundary rejection, missing optional columns, cropping, invalid / overlapping mappings and no automatic exclusions for STS / Dry Dock.
- Added application integration tests: append preserves existing data, no calculation / exports before explicit Calculate, editing / restoring preserve the gate, manual exclusions remain inspector-controlled, and Excel / PDF generation after review.
- Optional real OCR smoke test: Tesseract.js 7.0.0 recognized the committed synthetic PNG and produced two exact five-field row payloads. Tested with the same English model downloaded from the configured Project Naptha 4.0.0 URL (local copy, caching disabled). The synthetic fixture contains no real vessel or personal data and is not loaded by the app.
- Optional jsdom interaction test: file / camera attributes, opening, loading, OCR preview, zero automatic row selection, explicit selection / append, editable quantities, draft reload, explicit Calculate, blocking saved unreviewed reports without changing the current calculation, and cancellation cleanup.
- All **16 generated Excel workbooks** passed independent `@oai/artifact-tool` recalculation, including exact limits and edited manual exclusion / invalid precision. Existing PDF checks passed within the math suite; the import integration additionally generated a PDF after review.
- Source comparison confirms the audited `calculateVEF` body is identical to main after removing the newly added review gate. No VEF formula or export formula was changed.

Optional test dependencies are installed outside the repository:

```sh
npm install --prefix /tmp/vef-photo-tests jsdom@26.1.0 tesseract.js@7.0.0
NODE_PATH=/tmp/vef-photo-tests/node_modules node tests/photo-ui-smoke.cjs
NODE_PATH=/tmp/vef-photo-tests/node_modules node tests/photo-ocr-smoke.cjs
```

For an offline real OCR smoke test, set `VEF_OCR_LANG_PATH` to a directory containing the downloaded `eng.traineddata` (decompressed). The test disables model caching when this path is set.

## Files changed

- `index.html`: FULL import controls / dialog, editable row append, persisted review gate and export guards. Existing controls, columns, calculation and report formulas preserved.
- `photo-import.js`: browser OCR lifecycle, column mapping, conservative parser and preview.
- `README.md`: link to this review / testing guide.
- `docs/full-photo-import.md`: this guide and test report.
- `tests/photo-import.test.cjs`: dependency-free parser / application tests.
- `tests/photo-ocr-smoke.cjs`: optional actual Tesseract.js test.
- `tests/photo-ui-smoke.cjs`: optional jsdom interaction test.
- `tests/fixtures/vef-photo-clean.png`: synthetic printed table for OCR regression.
