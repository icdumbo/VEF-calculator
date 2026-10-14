# FULL: Camera / Photo / PDF import — PR #2 review report

Historical report for the PDF extension. Current Photo / Camera automatic detection and updated tests: [Automatic photo import](full-photo-auto-import.md). PDF direct extraction described here remains unchanged.

Work stays on `codex/full-photo-import` in draft PR #2. No merge, deployment, BASIC Android change or change to the audited VEF formulas is part of this work.

## Inspector workflow

- **Camera / Take Photo**: image file input requests `capture="environment"`. **Photo / Gallery**: separate image input without capture. Both use the same local OCR / review path.
- **PDF**: select a report directly with the PDF file input or open **Import PDF** beside the existing controls. Choose a page. Files are limited to 20 MB and PDFs to 30 pages; damaged / password-protected PDFs may require an unlocked copy.
- Check the preview, column bounds, table top / bottom, date order and number convention. Supported digital headers suggest bounds automatically. Inspect / correct those bounds; unknown layouts and scans require manual mapping. Mapping supports only Port / Terminal, B/L Date, Cargo, Ship's Figures and B/L Figures.
- **PDF recognition**: Auto prefers usable selectable table text. Digital text only forbids OCR. Scanned page / OCR explicitly uses OCR, including for a bad or partial text layer. A footer date alone does not classify a scan as a digital table. Mixed / unusual documents may still need the inspector to override Auto.
- Read the selected source. Select only voyage rows in the preview; nothing is selected automatically. Append explicitly from each page. No automatic combining across pages, rows, ports or voyages is added.
- All values are editable in the existing table. `Voyage No.`, document `Qualified YES/NO` and exclusion statements are never imported as fields or decisions. Manual Exclude stays unchecked on every imported row; existing rows / inspector exclusions are preserved.
- Calculation, VLR, totals, eligibility and reports remain suspended until explicit **Calculate VEF**, including after edits, saved-history restore and reload. After that, FULL uses its audited formulas to recalculate Qualified and final VEF. The existing `photoReviewPending` storage field is retained for backward compatibility and now applies to all import sources.

## Methods and dependencies

**PDF digital**: Mozilla PDF.js / pdfjs-dist **5.6.205**, lazy-loaded from jsDelivr with matching module worker, font / CMap / WASM paths. `getTextContent()` supplies text and positions; the page viewport transforms them into displayed coordinates. Header anchors map the five supported fields and bound the voyage table before totals. Word rectangles enter the same conservative parser and human review flow. Direct extraction does not start Tesseract or an OCR API. `isEvalSupported:false` is set for PDF loading. Rendering supplies the original page preview; it is not used for recognition on the digital path.

**Photo / scanned PDF**: Tesseract.js / core **7.0.0**, English model from Project Naptha **4.0.0**. Photos are limited to a longest dimension of 3,000 pixels. PDF pages render at up to scale 3, capped at a 3,000-pixel longest dimension. A copy of the selected table area is processed to remove only long, dark horizontal / vertical grid rules; the original preview is preserved. Each assigned column is OCRed separately, sequentially with one worker and PSM 6. Word boxes are translated back to source coordinates and grouped by vertical position. This avoids joining nearby Ship and B/L quantities into a single OCR token. Five assigned columns mean five OCR recognition calls.

Confidence thresholds stay **85** for dates / quantities and **70** for port / cargo. Low confidence, malformed values, missing fields and ambiguous separators remain blank, with raw-text review notes. No guessed character substitutions or missing values are synthesized. Every value is marked for inspection; confidence and selectable text do not guarantee correctness. Date and number conventions remain inspector-controlled. For this reference PDF, select **Decimal dot / thousands comma** and **Day / Month / Year**. The conservative Auto number convention leaves single separators followed by three digits ambiguous; it must not be used to claim full numeric extraction on this document without reviewing the convention.

Source documents and photos stay in browser memory; no OCR server upload is implemented. CDN / model hosts receive normal asset download requests. Internet is required for dependencies, and offline import is not guaranteed. Workers, object URLs, PDF render tasks and the PDF loading task are released / cancelled when the dialog closes or the source changes. Existing local storage retains imported text and the review flag, not source files.

## Exact reference comparison: supplied 20-voyage PDF

The provided PDF has two pages: the voyage table is on page 1; page 2 contains legal text. Ground truth was independently transcribed from the rendered original, then compared automatically by row and field. Numeric comparisons normalize formatting without rounding; dates normalize to ISO. There are **20 × 5 = 100 target fields**.

The original file, rendered images, expected real values and scanned copy remain outside the repository. This report contains only aggregate counts and row indices.

| Source tested | Detected voyage rows | Fully correct rows | Correct fields | Blank fields | Wrong accepted fields | OCR calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original digital PDF, direct text | 20 / 20 | 20 / 20 | 100 / 100 | 0 | 0 | 0 |
| Image file rasterized from the same original page, Photo path | 20 / 20 | 17 / 20 | 97 / 100 | 3 | 0 | 5 |
| Image-only PDF created by rasterizing the original, scanned PDF path | 20 / 20 | 17 / 20 | 97 / 100 | 3 | 0 | 5 |

| Field | Digital PDF correct | Photo correct | Scanned PDF correct |
| --- | ---: | ---: | ---: |
| Port / Terminal | 20 / 20 | 17 / 20 | 17 / 20 |
| B/L Date | 20 / 20 | 20 / 20 | 20 / 20 |
| Cargo | 20 / 20 | 20 / 20 | 20 / 20 |
| Ship's Figures | 20 / 20 | 20 / 20 | 20 / 20 |
| B/L Figures | 20 / 20 | 20 / 20 | 20 / 20 |

The OCR paths leave **Port / Terminal blank on rows 1, 11 and 19**, because their OCR text fails the conservative confidence / geometry checks. They need manual verification / completion. Date, Cargo and both quantities are correct on all 20 rows. No Voyage value, Qualified decision or manual exclusion was copied.

These are controlled rasterizations of the supplied report, not photographs taken with a real phone or samples from a physical scanner. They validate the image / scan code paths but do not establish performance on glare, perspective, handwriting or compressed phone photos. No claim of universal 97% accuracy is made.

## Other verification

- `node --test tests/full-math.test.cjs tests/photo-import.test.cjs tests/pdf-import.test.cjs`: **31 tests passed**, including 1,000 deterministic exact-oracle mathematical scenarios and all existing export cases.
- PDF tests cover header detection, mapped fields only, totals cropping, no imported Voyage / Qualified / exclusions, ambiguous numeric formats, viewport coordinates, footer-only text, rule removal and column OCR coordinates.
- Photo DOM smoke test passed: gallery selection, separate camera input event / capture attributes, preview, explicit row selection, edit / reload review gate, Calculate and cleanup.
- PDF DOM smoke test passed: 20 digital preview rows and zero OCR, explicit editable append, persistent review gate, document NO values becoming YES only after the application's calculation, page switching to a scan, five OCR calls and cancellation / PDF cleanup.
- Existing two-row photo fixture passed actual Tesseract recognition with the updated column path.
- Independent synthetic 20-row digital fixture: 100 / 100 fields, 20 / 20 complete rows. Synthetic scan fixture: 90 / 100 fields, 10 / 20 complete rows; ten Cargo fields were conservatively blank, zero wrong accepted fields. This second sample demonstrates that OCR quality varies by layout / font and must be reviewed.
- All 16 Excel regression exports passed independent recalculation; PDF export assertions also passed. Source comparison confirms the audited `calculateVEF` body is identical to main apart from the existing import review gate. No calculation or Excel / PDF formula was changed.
- Both pinned PDF.js engine and worker CDN URLs returned HTTP 200 with cross-origin access headers.

Real browser rendering, Web Worker / WASM startup in a phone browser, physical camera / gallery behavior and mobile performance remain unverified. jsdom mocks rendering and OCR APIs; actual extraction / raster rendering / OCR tests run separately in Node with PDF.js, native canvas and Tesseract. Phone acceptance testing remains necessary before any merge.

## Reproduce without committing confidential source data

Install optional test dependencies outside the repository:

```sh
npm install --prefix /tmp/vef-import-tests jsdom@26.1.0 tesseract.js@7.0.0 pdfjs-dist@5.6.205 @napi-rs/canvas
NODE_PATH=/tmp/vef-import-tests/node_modules node tests/photo-ui-smoke.cjs
NODE_PATH=/tmp/vef-import-tests/node_modules node tests/pdf-ui-smoke.cjs
python tests/make-pdf-fixtures.py /tmp/vef-pdf-fixtures
NODE_PATH=/tmp/vef-import-tests/node_modules VEF_SOURCE_MODE=text node tests/pdf-source-smoke.mjs /tmp/vef-pdf-fixtures/digital.pdf /tmp/vef-pdf-fixtures/expected.json
NODE_PATH=/tmp/vef-import-tests/node_modules VEF_SOURCE_MODE=ocr node tests/pdf-source-smoke.mjs /tmp/vef-pdf-fixtures/scan.pdf /tmp/vef-pdf-fixtures/expected.json /tmp/vef-pdf-fixtures/settings.json
```

Fixture generation needs Pillow, reportlab and PyMuPDF. Optional `VEF_OCR_LANG_PATH` points to a directory containing decompressed `eng.traineddata`; model caching is disabled when it is used. `VEF_SOURCE_MODE=photo` accepts a PNG / JPEG with the same external expected JSON and inspector mapping. `VEF_SOURCE_RESULT` writes the aggregate comparison JSON to an external path. Real source files / expected values must stay outside git.

Serve the branch with `python -m http.server 8000` for browser review; PDF.js workers require a served origin rather than file://. On a phone, verify camera / gallery selection, PDF page preview, explicit conventions / mapping, corrections, reload before calculation, Calculate, manual exclusion and Excel / PDF reports. Do not replace BASIC Android.

## Files modified in this extension

`index.html`, `photo-import.js`, new `pdf-import.js`, `README.md`, `docs/full-photo-import.md`, this report, `tests/photo-ocr-smoke.cjs`, `tests/photo-ui-smoke.cjs`, and new `tests/pdf-import.test.cjs`, `tests/pdf-ui-smoke.cjs`, `tests/pdf-source-smoke.mjs`, `tests/make-pdf-fixtures.py`.
