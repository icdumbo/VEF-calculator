# FULL Photo / Camera: geometric rows and cell OCR — draft PR #2

Historical report. Current exact phone-photo correction: [Real camera report](full-photo-real-camera.md).


Current implementation is confined to `icdumbo/VEF-calculator`, `codex/full-photo-import`, draft PR #2. No merge, BASIC Android change, formula change or deployment of main/GitHub Pages. Only the existing owner-private preview is updated.

## Change and inspector flow

The Android report of 22 possible rows exposed a flaw in joining independent column OCR word boxes by their vertical centres. Extra fragments or baselines could split one voyage, leaving values in different preview rows. Automatic Photo / Camera no longer uses this grouping for data rows.

1. Retain the original; apply the existing bounded perspective normalization when the frame geometry supports it, with the corrected copy separately visible.
2. Locate the five supported headers using Tesseract.js/core 7 and the configured Project Naptha 4.0.0 English model. Vertical rules refine column edges when available; header positions remain the fallback for column geometry. Totals text is an endpoint marker, never a data value or decision.
3. Detect long horizontal rules across the five-column table. Collapse adjacent dark pixels into one boundary; verify plausible, consistent spacing. Derive row bands from the header's bottom rule through the rule above totals. The number of rows is measured, not hardcoded to 20. Without a recognised totals marker the existing last-quantity evidence bounds the grid search. Incomplete / inconsistent grids expose Advanced correction without automatic import.
4. Crop each of the five cells in each band, inset away from borders. Apply grayscale, percentile contrast stretching, white padding and bounded enlargement (target height 60 pixels, up to 3x). Recognize each cell separately using PSM 7. For a low-confidence result, retry at target height 80; it can improve acceptance only when the text agrees exactly and all word confidences meet the original threshold. Conflicting readings stay blank; no digit substitutions, whitelist repairs, guessed values or dictionary corrections.
5. Build one candidate per geometric band. Empty cells and multiple OCR fragments cannot create, delete or shift a voyage row. Display preview; nothing is selected or appended automatically. The inspector confirms/selects, imports and edits before explicit Calculate VEF.

There are 100 primary cell reads for a 20-voyage report, plus header recognition and optional confidence retries. This costs more phone processing time than five column reads; progress identifies the current row/cell. Source changes and dialog cancellation invalidate pending results and terminate the worker. Dependencies/model still download from CDN; source images are not uploaded for OCR. Offline import is not guaranteed.

Advanced correction retains the previous manual column OCR fallback. It does not have the geometric-row guarantee of the normal automatic path. Reports without continuous horizontal rules, curved paper, severe perspective, glare, cropped tables, unusually merged or variable-height rows may require correction or a clearer image. PSM 7 works best with one printed line per cell. No claim of universal OCR accuracy is made.

## Exact automatic comparisons

The exact attached `VEF-pagina-1.png` (1448x2048, SHA-256 `aeb8546d54d5f1f8a5b4fef05263dde6f0a686164465b50b31de3c03df83640f`) is compared by row and all five fields with the independently transcribed original PDF. The actual browser English model is used: decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`. Actual recognition runs in Node/native canvas; it does not simulate phone WASM or camera capture.

Tests select **Decimal dot / thousands comma** and **Day / Month / Year**, without a manual mapping file. Auto numeric convention remains conservative: ambiguous three-digit separators stay blank until the inspector chooses the source convention and re-reads.

| Source | Measured rows | Fully correct rows | Correct fields | Blank | Wrong accepted | OCR calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Exact original PNG | 20/20 | 17/20 | 97/100 | 3 | 0 | 105 |
| Same PNG with simulated projective distortion | 20/20 | 17/20 | 97/100 | 3 | 0 | 105 |
| Original digital PDF, direct text extraction | 20/20 | 20/20 | 100/100 | 0 | 0 | 0 |

On both image tests: Port/Terminal 17/20, B/L Date 20/20, Cargo 20/20, Ship 20/20, B/L 20/20. Port on rows **1, 11 and 19** remains blank; every accepted field matches its own original row. No data is moved to another voyage. The distorted sample is a controlled copy, not a fresh physical phone photograph. Source reports, expected real values, models and simulated images remain outside git and hosting.

## Verification and unchanged behaviour

- **49 dependency-free tests pass**, including 1,000 exact-rational mathematical scenarios and existing Excel/PDF export assertions.
- New tests verify measured row counts (20 and three), no discarded first row when its OCR quantity is missing, totals cropping, missing-grid fallback, split fragments/blank cells staying in their band, low-confidence/ambiguous values and safe agreeing/conflicting retries.
- Gallery/Camera DOM smoke tests pass automatic cell preview, selection/editable append, Calculate gate, cancel/cleanup, manual fallback, retry and safe fallback when headers exist but grid rows do not. PDF DOM regression passes digital zero-OCR and scanned-page five-column processing.
- Real reference tests compare each field at its row index and assert expected row count, geometric row indices and zero wrong accepted fields. Digital PDF still asserts all 100 fields and zero OCR.
- `pdf-import.js`, `index.html`, `photo-geometry.js`, quantity/date parsers, `recognizeColumns`, `parse`, rule removal and all calculation/export scripts are unchanged from the preceding commit. Thus PDF digital/scanned paths and audited formulas are preserved. No Voyage No., document Qualified, STS/Dry Dock exclusion or automatic aggregation is imported; Manual Exclude remains the inspector's choice.
- File changes: `photo-import.js`, `tests/pdf-source-smoke.mjs`, `tests/photo-ui-smoke.cjs`, new `tests/photo-cells.test.cjs`, `README.md`, historical pointers in the earlier photo reports, and this report. Hosting-only source provenance remains in the separate preview checkout.

## Reproduction and phone check

Use the optional dependencies and matching browser model described in the preceding Android report. Keep inputs and ground truth outside git:

```sh
VEF_SOURCE_MODE=photo VEF_PHOTO_AUTO=1 VEF_OCR_LANG_PATH=/private/browser-model node tests/pdf-source-smoke.mjs /private/VEF-pagina-1.png /private/expected.json
node --test tests/*.test.cjs
```

Open https://vef-full-pr2-preview.duskyowl8.chatgpt.site in Android Chrome and reload. Select the photo/Camera; allow cell recognition to finish. For this report choose Decimal dot / thousands comma and Read selected source if Auto leaves quantities blank. The current workflow says “Reading table cells: row …” and finishes with “20 table rows found.” Verify/select/import/edit before Calculate. The updated real Android test remains the user's next check. Keep PR #2 draft and unmerged.
