Current per-cell OCR follow-up: [Cell OCR report](full-photo-semantic-cell-ocr.md). Results below describe the preceding crop/header commit.

# FULL complete table crop and header-grid fallback — draft PR #2

Only `icdumbo/VEF-calculator`, branch `codex/full-photo-import`, parent `4fc681cf58019d11575c878f64af66d7f57b0ef6`. Keep draft unmerged; no BASIC/main changes. This phase fixes table width and header discovery, not individual value OCR.

## Confirmed failure and generic correction

Real Android screenshots still show failed automatic columns and a corrected copy starting at Cargo. The supplied second photograph's outer-left vertical rule is too faint/broken for the prior continuous-rule threshold. The perspective finder therefore selects an inner Cargo rule as the frame edge and crops away Voyage and Port. Losing those pixels makes semantic mapping impossible. Local success with only four columns did not prove an Android fix.

The photographed ruled-table path now checks the longest supported horizontal voyage-rule spans. Repeated endpoints can recover a faint outer edge on **either left or right**. A bounded consensus line fit requires at least five supports, meaningful vertical spread, consistent slope/residuals and evidence substantially outside the prior edge. Isolated text/noise cannot expand the crop. The existing homography/rectification/interpolation and 12-pixel safety padding remain; upright/blank/clean-page behavior and horizontal row algorithm remain. No form coordinates, source values or fixed row count.

After rectification, semantic headers still determine fields and order. If page/header-band OCR misses labels, use the actual header grid: a larger header gap followed by repeated voyage-row gaps identifies the band; its vertical rules identify individual header cells. OCR each of at most 16 header cells with the existing grayscale/contrast/rule removal pipeline, then reverse scaling/padding into the same source coordinates. This adds no label guesses or data-cell OCR policy changes. Missing/unreliable semantic evidence still requires fallback.

## Mobile coordinates and cache

The source canvas uses decoded `image.naturalWidth/naturalHeight`, scaled explicitly to the same bounded intrinsic pixel size. Rectified canvases use returned integer bitmap dimensions. CSS display width, client width and devicePixelRatio do not multiply OCR coordinates. Preprocessed header OCR uses explicit scale and padding when mapping TSV boxes back. Canvas `drawImage`/raster interpolation can differ between browsers and native canvas; the tests do not simulate Android rasterization.

Photo/Camera DOM regression repeats automatic selection at devicePixelRatio **1, 2, 2.625 and 3** and a narrow CSS photo width: the same mapping/row count results. Both **photo-geometry.js and photo-import.js URLs have content-hash versions**, so reloading requests the new geometry engine instead of an older cached URL. No service worker is registered in the preview HTML. Existing interface and import/review/Calculate flow remain unchanged.

## Validation

- **123 dependency-free tests pass**, including synthetic faint outer rules on both sides, support/noise guards, geometric header cells, semantic permutations/aliases and existing mathematics/export/confidence/exclusion checks.
- First original PNG: **20/20 rows, 100/100 correct fields**, no blanks/wrong, 181 OCR calls, initial Auto resolves decimal dot.
- Digital PDF: **20/20 rows, 100/100 fields, zero OCR**. PDF script byte-identical.
- Second real photograph `71629.jpg`: source canvas 3000x2439; corrected copy **2542x1444**, retains Voyage/Port and rightmost columns. Semantic mapping finds **Port, Cargo, Date, Ship, B/L** and **20 geometric rows** without manual limits. No numerical/qualification/exclusion information from the source is used to choose columns.
- Extra real-photo header regression deliberately removes all header text from page-wide/header-band OCR, mimicking missing-label recognition. Individual header-grid OCR recovers all five fields and 20 rows (eight header cells, ten total discovery OCR calls). Reproducible optional script: `tests/photo-header-source-smoke.cjs`, taking a private source path and expected row count; model path via `VEF_OCR_LANG_PATH`. No real image/model/oracle committed.
- Photo/Camera DOM and digital/scanned PDF DOM regressions pass. Inline FULL calculation/export/UI code, PDF and the complete recognizePhotoCells implementation are byte-identical to the parent; only external photo script URLs change in index.html.

Controlled image tests use Node/native canvas, Tesseract.js/core 7 and the same browser English model (decompressed SHA-256 `daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047`). **These are not a new Android browser run.** They verify frame/column recovery and first-format/PDF regression. The user's next real Android test remains the acceptance check.

An exploratory run of the unchanged individual-value OCR on the wider second canvas still fails its zero-wrong acceptance check: 44 correct, 52 blank and three wrong among 99 legible scored reference fields (one tiny Cargo cell remains unscored). It takes 1984 OCR calls. This is explicitly outside this phase's optimization scope; do not claim the second report's values are accurate or production-ready. Inspector review remains mandatory. The requested crop/header fix does not imply value OCR correctness.

## Files and Android handoff

Changed: photo-geometry.js, photo-import.js (header fallback only), index.html (two photo cache versions), tests/photo-auto.test.cjs, tests/photo-geometry.test.cjs, tests/photo-ui-smoke.cjs, optional tests/photo-header-source-smoke.cjs, README and reports. No PDF/BASIC/main/calculation/qualification/exclusion/export changes. Private source photographs, diagnostics/reference data and models stay outside git and hosting.

Owner-private preview: https://vef-full-pr2-preview.duskyowl8.chatgpt.site . Reload, select the same second original photo, first verify the corrected copy includes the full left/right edges and PORT / TERMINAL, then wait for automatic five-column assignments and 20-row preview. Do not enter Left/Right manually for this test. Individual OCR values are not yet the acceptance target. PR #2 remains draft and unmerged.
