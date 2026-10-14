# FULL Photo / Camera: exact Android failure and correction — draft PR #2

Historical report. Current automatic Photo / Camera geometry and cell OCR: [Cell OCR report](full-photo-cell-import.md).


Work is confined to `icdumbo/VEF-calculator`, `codex/full-photo-import`, draft PR #2. No merge, BASIC Android change, audited formula change, or GitHub Pages / main deployment. Only the existing separate owner-private preview is updated.

## Reproduced cause

The supplied `VEF-pagina-1.png` is 1448 × 2048 pixels. Its SHA-256 is `aeb8546d54d5f1f8a5b4fef05263dde6f0a686164465b50b31de3c03df83640f`. The exact file, original PDF and transcribed oracle remain outside git and hosting.

The preceding commit reproduced the Android failure with the actual configured English model: OCR read the B/L Figures header as `BIL` with low header confidence, and the rigid detector rejected it. A previous test using the system English model did not reproduce that failure. This validation corrects that mismatch: Tesseract.js / core 7.0.0 uses the same Project Naptha 4.0.0 English model as the browser. The downloaded CDN model was compared byte-for-byte by decompressed SHA-256: `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`.

## Changes

- Header geometry recognizes separated and combined headings (`B/LDATE`, `SHIP'SFIGURES`, `PORT/TERMINAL`) and a merged `VOY|PORT` heading. Splitting a combined heading changes geometry only, never data text.
- `BIL` / `B1L` header aliases require a corroborating, confident FIGURES anchor in the same column; weak B/L DATE anchors require the adjacent confident DATE header. Quantity evidence below the header is still required. These are contextual header checks, not relaxed cell confidence thresholds or substitutions in values.
- Long vertical rules can refine boundaries, but are optional. Conflicting rule geometry retries header-only boundaries before declaring failure. No column percentages are required for the reference file.
- Photo resolution is normalized up to 2×, capped at a 3,000-pixel longest side. This is ordinary resampling, not generated text or guessed digits.
- A bounded search for long horizontal / vertical frame edges estimates a quadrilateral, refines its line slopes, and applies a projective transform when reliable non-upright geometry is found. The original is retained. A corrected copy is shown separately, with Advanced bounds explicitly referring to that copy. Upright, blank, unsupported or excessively dark frames are not forcibly warped.
- Header recognition first uses sparse PSM 11. If it cannot identify the table, a PSM 6 retry on the upper 40% removes short-area grid lines and contributes header geometry before fallback. The actual data columns are then recognized separately using the existing PSM 6 / conservative parser.
- Advanced correction remains available; unknown / unreliable layouts still import nothing automatically. The limits of the frame search include moderate slope ranges, missing frames, cropping, glare, handwriting, multiple tables and curved documents. No universal perspective or OCR guarantee is made.

Photo / Camera alone uses these steps. `pdf-import.js`, direct PDF text extraction and scanned-PDF processing are unchanged. The inline application calculation / report scripts are byte-identical to the preceding commit. No VEF formula, Android file, Voyage field, aggregation, Qualified decision or automatic exclusion was added or changed.

## Exact automatic comparisons

Ground truth is the independently transcribed original PDF, with 20 rows × five fields. Numeric formatting is normalized without rounding. Tests use **Decimal dot / thousands comma**, **Day / Month / Year**, and no manual mapping file.

| Test source | Detected rows | Fully correct rows | Correct fields | Blank fields | Wrong accepted fields |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact attached PNG, browser English model | 20 / 20 | 17 / 20 | 97 / 100 | 3 | 0 |
| Same PNG with a simulated projective distortion, corrected automatically | 20 / 20 | 18 / 20 | 98 / 100 | 2 | 0 |
| Original digital PDF, direct extraction | 20 / 20 | 20 / 20 | 100 / 100 | 0 | 0 |

On the exact PNG: Port / Terminal 18/20, Date 20/20, Cargo 19/20, Ship 20/20, B/L 20/20. Ports on rows **1 and 11**, and Cargo on row **16**, remain blank for inspection. Six OCR calls were used: one discovery and five columns.

The perspective sample is a deliberately warped copy of this PNG, not another phone photograph. It checks the correction path without exposing the real report in fixtures. Its two blank ports are rows 1 and 11. Six OCR calls were used. This controlled result does not establish accuracy for every physical photo.

With the application's conservative **Auto** number convention, the exact file still yields 20 rows, but its 40 ambiguous quantities remain blank until the inspector chooses the source convention and re-reads: 57/100 correct fields, 43 blank, zero wrong accepted fields. Choosing Decimal dot resolves those formatting ambiguities; it does not bypass confidence checks.

## Safety and verification

Cell thresholds remain **85** for dates / quantities and **70** for port / cargo. Malformed / uncertain cells and ambiguous separators remain blank with raw text notes. Every accepted value still needs human inspection. No recognized data text is corrected by header aliases or geometry code.

No row is selected or appended automatically. Selection and append remain explicit; values remain editable. Calculation / export stays blocked until explicit **Calculate VEF**, including after edit / reload / restore. No document Voyage, Qualified or exclusion decision is imported. Manual Exclude remains the inspector's decision.

- **42 dependency-free tests passed**, including 1,000 exact-rational mathematical scenarios and existing export assertions.
- Header tests cover merged / combined headings, absent or conflicting grid geometry, weak BIL headers with corroboration, safe unknown-layout fallback, and unchanged conservative data parsing.
- Geometric tests cover homography, degeneracy, sloping frames, aligned rules after correction, source pixel preservation, bounded output and rejecting unsupported frames.
- Gallery / Camera jsdom tests load the geometry module and pass automatic preview, explicit selection / editable append, Calculate gate, manual fallback after retry, automatic retry and cleanup. PDF jsdom regression also passes.
- Real PDF.js direct extraction retains 20/20 rows, 100/100 fields and zero OCR. Real Tesseract comparison uses the exact newly attached PNG and verified browser model, not the earlier substitute rasterization / system model.

Extraction tests run with actual Tesseract / PDF.js and native canvas in Node. DOM tests mock canvas and worker. The updated real Android browser / camera acceptance test remains the user's next check; Node does not verify phone rendering or browser WASM startup.

## Reproduction and phone test

Install the optional external dependencies described in `full-pdf-import.md`. Download and decompress the **configured Project Naptha 4.0.0 English model**, verify its hash above, and use that directory for `VEF_OCR_LANG_PATH`. A different system model is not an equivalent reproduction.

```sh
VEF_SOURCE_MODE=photo VEF_PHOTO_AUTO=1 VEF_OCR_LANG_PATH=/private/browser-model node tests/pdf-source-smoke.mjs /private/VEF-pagina-1.png /private/expected.json
```

No mapping argument is needed. The smoke test uses the explicit reference convention dot; `VEF_NUMBER_MODE=auto` checks conservative ambiguity handling. Its image preparation, normalization and discovery helpers are the same as the application's. Keep real sources, simulated distortions, models and ground truth outside git / dist.

Open https://vef-full-pr2-preview.duskyowl8.chatgpt.site in Android Chrome and reload. Open Import from Photo, choose the exact PNG or Camera, and wait for automatic rows. For this report select Decimal dot / thousands comma and Read selected source if the initial Auto preview leaves quantities blank. Verify / select / append / edit before Calculate VEF. The manual percentages should not be needed for this exact PNG. PR #2 remains draft; do not merge after testing.

## Files modified

`photo-import.js`, new `photo-geometry.js`, import-dialog markup / local script include in `index.html`, `tests/photo-auto.test.cjs`, new `tests/photo-geometry.test.cjs`, `tests/photo-ui-smoke.cjs`, `tests/pdf-source-smoke.mjs`, `README.md`, the historical pointer in `docs/full-photo-auto-import.md`, and this report. Hosting-only state stays in the separate preview checkout.
