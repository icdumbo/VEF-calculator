# FULL cell OCR and automatic numeric convention — draft PR #2

Historical cell OCR report. The current controlled retry and header alias results are in [the cell retry report](full-photo-cell-retries.md).

Scope: only `icdumbo/VEF-calculator`, `codex/full-photo-import`, draft PR #2. Do not merge. The current geometric detector, header/column placement, horizontal row bands, local border fit, audited VEF formulas, main, BASIC Android and PDF paths are unchanged.

## Behavior

Photo / Gallery and Camera reset the new photo's numeric selector to Auto and immediately use the same `recognize()` pipeline as Read selected source. Cell OCR still receives exactly the pre-existing geometric bands: no fragment can add or shift a voyage. After reading all cells, Auto uses confident numerical evidence to identify the source convention and converts the same raw values before rendering the first preview. It updates the visible selector without another OCR pass or inspector action.

Inference requires at least three confident numerical cells whose grouping syntax is valid in only one convention, with no opposite evidence. `6431.190` supports decimal dot: interpreting its dot as a thousands separator fails the standard grouping syntax. Repeated genuinely ambiguous `1.234` cells do not count as evidence. Conflicting, insufficient or low-confidence evidence keeps Auto and leaves ambiguous values blank. Explicit manual dot/comma selections override inference on re-read. The shared quantity parser and PDF convention behavior are unchanged.

## Cell recognition

- Use bounded upscaling within the existing cell (up to 4x, content width capped at 1800 px), white padding, grayscale and percentile contrast. Mid-tone photographed cells have threshold variants; optional sharpening and differing size/segmentation variants are tried only for uncertain cells. The gray Port pass avoids losing narrow strokes to binarization.
- Per-column OCR character constraints: dates use digits and date separators, quantities use digits and numeric separators, Port/Cargo use uppercase text, digits and supported punctuation. Numeric/date fallback verification also reads the same cell without a whitelist; strict column validation and confidence still apply.
- Preserve confidence thresholds: all words >=85 for dates/quantities and >=70 for Port/Cargo. An uncertain first reading can be replaced only by two confident agreeing variant readings. No dictionaries of the source ports, expected voyage count, supplied answers, digit reconstruction or shifting values between cells.
- Reject malformed dates/quantities and isolated leading/trailing border punctuation in text. Keep raw OCR for inspector review. Only separator-adjacent numeric whitespace is joined; no digits/separators are substituted.
- Preview/selection/confirmation/edit stay explicit. Calculate VEF is never run by import. Voyage No., Qualified and document exclusions are not imported. Manual Exclude remains inspector controlled.

## Independent real comparisons

Exact supplied screen photograph `01-71602.jpg`: 1536x1375; SHA-256 `b8986d2494c730d0dab299da1391cf8855103bed35683f3693e918758aab21ec`. The clean PNG and synthetic perspective case are separate fixtures. Source images, independent 20x5 oracle, model and diagnostics remain outside git and hosting. Node/native canvas uses Tesseract.js/core 7 with the actual browser Project Naptha 4.0.0 English model, decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`; this is not an Android browser run.

| Source / mode | Aligned rows | Fully correct rows | Correct fields | Blank | Wrong accepted | OCR calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Exact photograph, initial Auto | 20/20 | 15/20 | 94/100 | 6 | 0 | 230 |
| Clean original PNG, initial Auto | 20/20 | 17/20 | 97/100 | 3 | 0 | 118 |
| Synthetic perspective PNG, initial Auto | 20/20 | 17/20 | 97/100 | 3 | 0 | 116 |
| Original digital PDF | 20/20 | 20/20 | 100/100 | 0 | 0 | 0 |

The exact photograph was independently re-run with initial Auto and explicit Decimal dot / thousands comma. All 20 full row objects are identical, including all five fields, raw OCR, confidence flags and warnings; both produce 94/100, six blanks, zero wrong accepted fields and 230 OCR calls.

Auto resolves decimal dot on all three photo fixtures. Exact photograph: Port **17/20**, Date **18/20**, Cargo **20/20**, Ship **19/20**, B/L **20/20**. First-row AGIOI THEODOROI and row-five B/L 6533.107 are correct. Remaining blanks: Port rows **10, 11, 20**; Date rows **11, 18**; Ship row **17**. Each accepted value matches its own voyage. The **100/100 target is not reached**: six fields still need inspector completion, and confidence scores do not guarantee correctness on other photos.

## Verification and changed files

- **54 dependency-free tests pass**, including 1,000 exact-rational math scenarios and existing export checks. Regressions cover initial Auto vs explicit convention, conflicting/ambiguous/low-confidence evidence, per-column constraints, retry agreement, border fragments and fixed row identity during blank-cell retries.
- Photo/Camera DOM smoke and digital/scanned-PDF DOM regression pass. Digital PDF real extraction remains 100/100 with zero OCR. The photo smoke defaults to Auto and reports its inferred convention; it asserts the actual row count, geometric row indices and zero wrong accepted fields.
- Byte comparison confirms `photo-geometry.js`, `index.html`, `pdf-import.js`, all shared parsers/PDF OCR/rule removal, header detection, row detection, column refinement and local cell bounds are unchanged from `ce3f6e123e2bf0c4e14eea6ce98235e4363f98cb`.
- Changed files: `photo-import.js`, `tests/photo-cells.test.cjs`, `tests/photo-ui-smoke.cjs`, `tests/pdf-source-smoke.mjs`, this report, README and a historical report pointer. No Android, VEF math or export source changes.

## Android preview

Use the existing owner-private https://vef-full-pr2-preview.duskyowl8.chatgpt.site and reload. Select the exact photo using Gallery or Camera, wait for cell OCR and look immediately for **20 table rows found. Decimal dot / thousands comma.** The selector should already show that convention. No manual selector change or second Read selected source should be needed for this fixture. Verify all values before selection/import/edit/Calculate. Advanced correction and the manual selector remain available.

Additional cell reads can take longer on Android. CDN assets/model downloads need internet; processing stays in the browser and sources are not uploaded. New live Android confirmation, camera capture and WASM/canvas differences remain the user's next check. PR #2 remains draft and unmerged.
