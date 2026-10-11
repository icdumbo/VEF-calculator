# FULL automatic Photo / Camera import — draft PR #2

Historical report for the first automatic implementation. The exact Android PNG failure, browser-model verification and current correction are documented in [Android photo detection fix](full-photo-android-fix.md). That report supersedes this report's Photo results for the newly supplied file.

Scope: `icdumbo/VEF-calculator`, `codex/full-photo-import`, draft PR #2 only. No merge to main, BASIC Android change, mathematical formula change, or production GitHub Pages update. The separate owner-private Android preview is updated with the exact application files from this branch.

## Corrected issue and workflow

Previously a photo loaded correctly but recognition immediately validated empty manual column bounds and failed with “Assign at least one column on the photo.”

Gallery and Camera now start recognition as soon as the browser loads the chosen image. One whole-image sparse OCR pass identifies table headers and quantity evidence. Geometry automatically supplies table and column bounds, followed by column OCR and the existing conservative parser. The user receives the candidate rows without defining column bounds. Original image pixels are preserved.

Manual bounds are inside the collapsed **Advanced correction** section. Unknown / unreliable headers open that section with a clear fallback message, without inventing a layout or importing any rows. The inspector can use a clearer image, correct available columns and the table area, or retry automatic detection. Missing Cargo can remain unmapped / blank. Unknown layouts, absent key headers, multiple tables, substantial rotation, perspective, wrapping, glare and low resolution can still require correction or a better photo.

Date and number conventions remain visible and inspector-controlled. Single decimal separators followed by three digits are ambiguous in Auto: they remain blank until the inspector chooses the convention and presses **Read selected source**. For the reference document use **Decimal dot / thousands comma**, **Day / Month / Year**. This is independent of column mapping.

Nothing is selected or appended automatically. Explicit row selection and **Append selected rows for review** are required. All appended values remain editable. Calculation / exports remain gated until explicit **Calculate VEF**. No Voyage, document Qualified decision or exclusion decision is imported, and no automatic STS / Dry Dock exclusion or aggregation is added.

## Recognition method

The existing Tesseract.js / core 7 and English model remain unchanged. After image loading (longest side capped at 3,000 px), PSM 11 supplies word boxes on a disposable image copy with long horizontal grid rules removed. Semantic header anchors identify only the five supported fields. Header aliases such as `TERMINAI` help recognize geometry only; no data-cell characters are repaired or guessed. Presence of Ship, B/L and date columns plus paired quantity evidence is required. Title metadata alone is insufficient.

When long vertical grid lines are available on the original image, they refine column boundaries, including splitting a merged `VOY|PORT` header at its actual cell boundary. Otherwise separated header geometry is used conservatively. Table bounds exclude detected totals and footer prose. Failed or overlapping geometry returns to Advanced correction.

The five detected columns are OCRed sequentially with PSM 6, using the previous grid-removal and parser path. Minimum confidence remains 85 for dates / quantities and 70 for port / cargo. Uncertain or malformed fields remain blank with raw OCR review notes. Confidence does not guarantee correctness; every value still needs inspection.

Photo / Camera needs six OCR calls when all five columns are detected: one discovery pass plus five column passes. Processing stays in the browser; photos are not uploaded to an OCR server. Internet is needed for existing engine/model downloads. Changing / cancelling a source invalidates outstanding recognition and releases workers. Phone performance remains device-dependent.

## Exact comparisons

The same previously tested 20-voyage image rasterized from the supplied PDF was compared automatically with the independently transcribed original: 100 target fields. No manual mapping file was supplied to the automatic Photo test. Only the number/date conventions were specified. Real reports, photos and ground truth stay outside git and the hosted preview.

| Source / convention | Detected rows | Fully correct rows | Correct fields | Blank fields | Wrong accepted fields | OCR calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Automatic Photo, Decimal dot / thousands comma | 20 / 20 | 17 / 20 | 97 / 100 | 3 | 0 | 6 |
| Automatic Photo, conservative Auto convention | 20 / 20 | 0 / 20 | 57 / 100 | 43 | 0 | 6 |
| Original digital PDF, direct extraction with Decimal dot | 20 / 20 | 20 / 20 | 100 / 100 | 0 | 0 | 0 |

With Decimal dot, Port is correct on 17/20 rows; Date, Cargo, Ship and B/L are each correct on 20/20. Ports on rows 1, 11 and 19 stay blank. In Auto, those same ports plus all 40 ambiguous quantities stay blank; the raw text appears in review notes. No guessed values or automatic exclusions were accepted.

This reference image is a controlled PDF rasterization, not a physical camera photograph. The supplied Android error screenshots contain only portions of the displayed photo; they confirm the usability failure, but cannot serve as a full 20-row photo accuracy fixture. The updated automatic route still needs the user's real-phone acceptance test on the original full photograph. The reference 97% result is not a universal OCR accuracy claim.

## Tests and preserved behavior

- 36 dependency-free tests pass, including 1,000 exact-rational mathematical scenarios, manual exclusion, outside range, exact limits and existing export assertions.
- New automatic detection tests cover no manual mapping, optional missing Cargo, confidence / separator rejection, missing headers / safe fallback, rejecting title metadata, merged Voyage / Port grid boundaries, totals / footer cropping, and no imported Qualified / exclusions.
- Gallery and Camera jsdom interaction tests pass: automatic discovery → preview without manual configuration → explicit selection → editable append → persistent Calculate gate. Failed detection opens Advanced correction; manual fallback and automatic retry work. No row is selected automatically. Cancellation releases the image/worker.
- PDF jsdom regression passes: 20 direct preview rows, zero OCR, explicit append / Calculate gate; the existing scanned-page column route and cleanup remain functional.
- Real PDF.js direct extraction of the supplied original passes 20/20 rows and 100/100 fields with no OCR. `pdf-import.js` is unchanged.
- Real Tesseract photo test reproduces the two exact synthetic fixture rows on the existing column route.
- `index.html` changes only the import dialog. Its calculation/report script is byte-identical to the preceding PR #2 commit; mathematical formulas and all Android files are untouched.

DOM tests mock the browser canvas / worker. Actual OCR and PDF extraction run separately in Node with Tesseract, native canvas and PDF.js. This environment does not verify real Android camera handling, browser WASM startup or rendering; the private preview is for that acceptance test.

## Reproduction

Use the existing optional external dependencies in `full-pdf-import.md`. For the real reference image and externally stored oracle:

```sh
VEF_SOURCE_MODE=photo VEF_PHOTO_AUTO=1 node tests/pdf-source-smoke.mjs /private/photo.png /private/expected.json
```

No third mapping argument is required. The automatic smoke test defaults to the explicit reference convention `dot`; set `VEF_NUMBER_MODE=auto` to reproduce conservative ambiguity handling. The application itself defaults to Auto. `VEF_OCR_LANG_PATH` may supply the same decompressed English model locally. Run `node --test tests/*.test.cjs`, `tests/photo-ui-smoke.cjs` and `tests/pdf-ui-smoke.cjs` with their external dependency paths.

## Private Android test

Open https://vef-full-pr2-preview.duskyowl8.chatgpt.site in Android Chrome, signing in with the same ChatGPT account if required. Reload after deployment. Open **Import from Photo**, choose Gallery or Camera, and wait for automatic candidate rows. Column configuration should not be required. For the reference report choose **Decimal dot / thousands comma**, then **Read selected source** if the first preview shows blank quantities. Verify / select / append rows, edit them, then calculate explicitly. Test PDF separately; its direct extraction logic is preserved. Do not merge PR #2 after this test.

## Files changed in this update

`index.html`, `photo-import.js`, `tests/photo-auto.test.cjs`, `tests/photo-ui-smoke.cjs`, `tests/pdf-source-smoke.mjs`, `README.md`, `docs/full-pdf-import.md` (historical pointer only), and this report. Hosting-only metadata stays in the separate preview checkout.
