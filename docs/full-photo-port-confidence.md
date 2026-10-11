# FULL Port/Terminal confidence recovery — draft PR #2

Scope: `icdumbo/VEF-calculator`, `codex/full-photo-import`, follow-up to `493f566da9ff2940af83d7471a53d0c037560a74`. Keep PR draft and unmerged. No BASIC Android/main changes.

## Diagnosis

The old cell validator required **every text word >=70**, even for proper names. In the clean original PNG, row 11's primary read has word confidences 56.57 / 88.72; row 19 has 41.09 / 85.45. The whole text agrees across many crops but cannot satisfy the per-word minimum. The existing retry replacement also requires two reads passing that minimum. Review notes therefore contain the correct raw OCR but the accepted Port field remains blank. Confidence scores are engine heuristics, not probabilities. These are controlled Node/canvas diagnostics, not scores captured from the user's Android device.

## Generic, Port-only fallback

Preserve the original first-read and two-confident-retry path. After the existing bounded retry list, an otherwise rejected **Port** may be accepted only when:

- At least three distinct OCR variants of **that same geometric cell** agree exactly on the whole valid uppercase name. Each corroborating read has every word >=20 and character-length-weighted mean confidence >=60.
- At least two of those variants have every word >=40 and weighted mean >=70.
- At least two crop/pixel treatments support the result; repeated segmentation of identical pixels alone is insufficient. Duplicate treatment/segmentation keys do not count again.
- No other valid corroborating read meeting the >=20 / weighted >=60 evidence threshold disagrees, including earlier reads with repeated variant keys. No majority voting, fuzzy matching, name dictionary, corrections or copying from other rows.

This explicitly changes confidence acceptance for repeated Port names only. Zero/very-low-confidence agreement alone is not sufficient. Other text (Cargo) retains the original per-word >=70 threshold; dates/quantities retain >=85 and all existing strict parsing. Recovered Ports carry a review note, remain editable, and never cause automatic Calculate. Unresolved/conflicting cells stay blank.

Crop/preprocessing, all row/column detection, perspective correction, numeric Auto inference, PDF file, shared parsers, formulas and exports remain byte-identical to the parent except OCR treatment metadata and the Port-specific final acceptance flag. That flag survives final assignment rather than being rejected again by the old per-word check. No additional OCR calls, new source uploads, training or runtime source answers.

## Independent comparisons

Sources/oracle/models/diagnostics remain outside git and hosting. Node/native canvas with Tesseract.js/core 7 and the same browser English Project Naptha model (decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`). Compare all five fields against the private original 20x5 oracle; smoke asserts exact geometry and zero wrong accepted values.

| Source, initial Auto | Aligned rows | Fully correct rows | Correct fields | Blank | Wrong | Port correct | OCR calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Clean original PNG | 20/20 | 20/20 | 100/100 | 0 | 0 | 20/20 | 181 |
| Synthetic perspective PNG | 20/20 | 20/20 | 100/100 | 0 | 0 | 20/20 | 179 |
| Supplied screen photograph `01-71602.jpg` | 20/20 | 19/20 | 99/100 | 1 | 0 | 20/20 | 278 |
| Original digital PDF | 20/20 | 20/20 | 100/100 | 0 | 0 | 20/20 | 0 |

Screen photograph SHA-256: `b8986d2494c730d0dab299da1391cf8855103bed35683f3693e918758aab21ec`. Its remaining blank is **Date row 18**, already blank in the parent; this turn deliberately does not change Date acceptance. Ports 11 and 19 are now correct in both supplied image cases. Every non-Port value matches the parent result. Both photo sources automatically infer decimal dot; no manual selector/read step. These controlled results cannot guarantee identical Android canvas/OCR output; user real browser retest remains necessary.

**78 dependency-free tests pass**, including existing exact-rational mathematical/export checks and new generic unrelated-name, agreement, conflict, duplicate/equivalent variants, low-confidence, final assignment and other-column isolation cases. Photo/Camera and digital/scanned PDF DOM regressions pass. PDF real text extraction remains 100/100, zero OCR.

Changed files: `photo-import.js`, `index.html` (photo script cache hash only), `tests/photo-cells.test.cjs`, README, this report and a historical report pointer. `pdf-import.js` and `photo-geometry.js` are unchanged; inline calculation/export/UI script is byte-identical. No original image, oracle, model, Android or unrelated repository file is committed or deployed.

## Android retest

Owner-private preview: https://vef-full-pr2-preview.duskyowl8.chatgpt.site . Reload the page and choose the same original photo. Wait for the first automatic 20-row preview without changing convention or pressing Read selected source. Inspect Port/Terminal rows 11 and 19 and their review notes. Verify/edit before explicit import and Calculate. PR #2 remains draft, not merged.
