# Disputed photo glyph verification

This FULL-only change adds a bounded, optional check after the existing cell OCR
and numeric convention inference. It operates on rejected cells only. Accepted
cells, table geometry, row/column identity, digital PDF extraction, calculation,
qualification, Manual Exclude, exports and BASIC remain unchanged.

## Why cells stay blank

The difficult local photograph at reference commit `6bd7f0a` produces valid but
contradictory candidates in every target column. A confidence score measures the
recognizer's certainty, not whether the observed document contains that value.

- Port / Terminal: proper names have weak words and competing letter shapes;
  both readings can pass text validation. Of eight blank scored cells, four have
  a valid candidate with a confidence score of at least 85.
- B/L Date: both blank cells contain competing, calendar-valid dates. Calendar
  validation cannot determine which printed day or month is correct.
- Cargo: merged letters and letter/digit confusions create valid-looking names.
  Free text has no authoritative dictionary. These ambiguities remain unresolved.
- Ship's Figures: four blank cells have alternative valid quantities, including
  different leading digits. Two have a candidate with confidence at least 85.
- B/L Figures: three blank cells have alternative quantities with high confidence,
  often differing in one digit. Valid syntax alone cannot resolve these conflicts.

The original whole-cell confidence filters can suppress a weak correct reading;
relaxing those filters indiscriminately previously introduced incorrect accepted
values. This change does not relax the original acceptance policy.

## Secondary check

1. Retain the rejected cell's existing OCR families until numeric convention
   inference finishes. Require at least two repeated, valid candidate values.
2. Compare compatible strings with identical length and separator positions.
   Identify all disputed positions, at most three. Refuse letter/digit class
   conflicts; do not insert characters or separators. The optional glyph check
   currently supports ASCII candidate strings; it does not change text validation.
3. Read four native crops of that same cell: Gaussian and median treatments,
   each at two strengths. Request Tesseract word text and character boxes.
4. Require the new word to match an existing candidate. Validate every symbol
   box against the processed cell image and require box text to match the word.
5. Read only disputed characters using single-character segmentation (PSM 10),
   two bounded paddings and two sizes. Text remains unrestricted; numeric/date
   glyphs use a digit whitelist. Deduplicate by actual pixel content and OCR
   configuration. Maximum additional budget: 4 word reads + 24 glyph reads.
6. Require three distinct glyph images across two filter families, at least one
   moderately confident glyph observation, and no credible contradictory glyph.
   Every disputed position must select exactly one already observed valid value.
   Otherwise leave the cell blank.
7. Preserve its earlier warning and add an explicit inspector-review warning.
   These are correlated reads of Tesseract, not independent ground truth.

No document-specific values, names, dates, row counts or cell positions are used
by this decision. Both filtering families operate inside the original cell bounds.

## Executed local acceptance checks (2026-10-14)

The reference source was verified byte-for-byte against commit `6bd7f0a`.
Real documents and their expected values remain outside the repository.

| Source | Before: correct / blank / wrong | After: correct / blank / wrong | Rows |
| --- | --- | --- | --- |
| First photograph | 100 / 0 / 0 | 100 / 0 / 0 | 20 / 20 |
| Difficult photograph | 75 / 24 / 0 | 79 / 20 / 0 | 20 / 20 |
| Existing digital PDF | 100 / 0 / 0 | 100 / 0 / 0 | 20 / 20 |

The difficult photograph has 99 scored fields; one Cargo lacks an oracle and is
excluded. Counts above measure value accuracy, including correct values carrying
review warnings. Nonblank scored values with warnings increase from 8 to 12.
The strict unflagged-correct / blank-or-flagged / unflagged-incorrect split remains
67 / 32 / 0: four previously empty values become correct reviewable suggestions.

| Column | Before | After |
| --- | --- | --- |
| Port / Terminal | 12 / 8 / 0 | 14 / 6 / 0 |
| B/L Date | 18 / 2 / 0 | 18 / 2 / 0 |
| Cargo | 12 / 7 / 0 | 12 / 7 / 0 |
| Ship's Figures | 16 / 4 / 0 | 17 / 3 / 0 |
| B/L Figures | 17 / 3 / 0 | 18 / 2 / 0 |

OCR requests: first photograph 239 before and after; difficult photograph 5,447
before and 5,577 after; digital PDF zero. No speed improvement is claimed.
Measured difficult-photo runs were 122.326 s before (5,447 exact-image/parameter
cache hits) and 118.171 s after (5,447 cache hits and 130 fresh engine calls).
Concurrency/cache differences prevent interpreting this as a cold-run speedup.
The private harness was corrected to retain requested character-box output; its
initial TSV-only run was not used as the final acceptance result.

The first photograph was also rerun with the repository's uncached real
Tesseract source harness: 100/100 fields, 20 rows and 239 fresh OCR calls.

All 146 reference unit tests pass. Eight new tests exercise positive recovery,
complete candidate comparison, conflicting evidence, identical pixel echoes,
class/convention/date ambiguity and rejection of missing/out-of-cell boxes:
154/154 pass. Photo/Camera and digital/scanned PDF DOM smokes pass.

These are local tests, not real Android verification. Twenty scored cells remain
blank. Dates and Cargo did not improve. Additional real photographs, unreadable
characters and memory/runtime on Android still need validation. This is a narrow
recovery improvement, not a completed solution to photo OCR.
