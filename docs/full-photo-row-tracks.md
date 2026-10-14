# FULL automatic row verification

Scope: PR #2, `codex/full-photo-import`. No BASIC, calculation, Manual Exclude, export, PDF extraction, global crop or perspective changes.

The existing row detector and its crop coordinates remain the first choice. When it cannot verify a grid, a photo-only fallback observes short rule segments in nine separated strips within the semantically mapped table. Local contrast allows pale rules on gray backgrounds. Seven supporting strips, including both outer strips, must agree on each fitted separator. Residual slope is bounded. First and last OCR quantity centers must be enclosed by actual separators; missing separators, irregular spacing and unsafe cell height reject the fallback. The number of rows comes from these separators, with no fixed expected count or guessed row splitting.

Fallback cell crops use the upper/lower separator at each column's horizontal bounds. The conservative crop remains entirely within its geometric row. Header aliases and column order continue to be determined semantically. A partially recognized table now also attempts OCR on geometrically observed header cells, so an unread optional Port/Cargo heading does not suppress its own retry. This affects header identification only, not data values or their confidence rules.

Local validation on 2026-10-13:

- Attached photograph: 20 geometric rows; original clear-image row bounds exactly match the prior detector. A reduced-contrast copy rejected by the prior detector is accepted as 20 rows by the fitted-rule fallback.
- First VEF PNG on Desktop: 20 rows, 100/100 fields agree with the corresponding digital PDF, zero blanks or mismatches after header recovery. 238 OCR calls.
- Digital PDF: 20 rows and the same 100 fields; zero OCR calls. The PDF implementation is unchanged.
- Unit coverage includes every header-column permutation and common Ship/B/L aliases, faint and sloped rules at different sizes, variable row counts, missing/closing separators, partial header recovery, and cell bounds that cannot cross into another row.
- Actual Android verification is pending. The exact Android grid failure was not reproduced on the local original photograph; the local tests demonstrate the corrected failure mode with paler rules and residual skew. The historical 75/24/0 cell OCR score is not a new measurement from this change.

Real photographs, PDF, OCR model, expected values and private test results remain outside GitHub and hosting.
