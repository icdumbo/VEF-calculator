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
   configuration. First-stage budget: 4 word reads + 24 glyph reads; the
   follow-up context stage below adds at most 48 reads for unresolved positions.
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

## Follow-up: unresolved glyph context (2026-10-14)

Reference: `6c3c19c`. The single-character stage remains the first check. Its
verified positions are retained independently; a conflict blocks further retries.
Only positions with insufficient evidence are reread with up to one adjacent
alphanumeric character on each side. Existing separators stop expansion. The
same validated word boxes, cell pixels and pixel/configuration cache are reused.
PSM 7 and 13 must not provide contradictory valid strings for identical pixels.
Three distinct span images, two filtering families, a sufficiently informative
span read and consistency with every confirmed glyph are required. The result
must still select one originally observed, semantically valid whole-cell value.
No mixed letter/digit-class fallback, character substitution, invented separator
or token reordering is enabled.

The additional stage is bounded at 48 span reads per rejected cell (three ranges,
four prepared images, two paddings, two modes). It does not retry confirmed glyph
positions and never changes an already populated field. The first-stage budget
remains four word reads plus up to 24 isolated-character reads.

| Column | Before: correct / blank / wrong | After |
| --- | --- | --- |
| Port / Terminal | 14 / 6 / 0 | 14 / 6 / 0 |
| B/L Date | 18 / 2 / 0 | 18 / 2 / 0 |
| Cargo | 12 / 7 / 0 | 12 / 7 / 0 |
| Ship's Figures | 17 / 3 / 0 | 17 / 3 / 0 |
| B/L Figures | 18 / 2 / 0 | 19 / 1 / 0 |
| Total (99 scored fields) | 79 / 20 / 0 | 80 / 19 / 0 |

Correct values without warnings remain 67. Correct values with warnings increase
from 12 to 13; one previously empty quantity becomes a correct review suggestion.
The former ambiguity warning is preserved. No warning is added to already
accepted fields. The new suggestion is not an automatic calculation or import.

All 154 existing tests plus eight context tests pass: 162/162. The first photo
was rechecked without OCR caching at 100/100, 20 rows and 239 requests. The digital
PDF remains 100/100, 20 rows and zero OCR. Photo/Camera and digital/scanned PDF DOM
smokes pass. Table geometry, perspective, cell bounds and column mapping are
unchanged. Real Android performance/accuracy has not been tested.

The difficult-photo full pipeline uses 5,641 OCR requests, versus 5,577 at the
reference. Its measured run took 122.554 seconds with 5,577 exact-image/configuration
cache hits and 64 fresh engine calls. No cold-run speedup is claimed.

Separate local probes kept outside GitHub investigated short character groups
(147 fresh requests, 14.330 s) and a deliberately relaxed letter/digit-class
experiment (215 fresh requests, 18.075 s). Dates still had conflicting results
between segmentation modes. Mixed-class text produced incomplete or unsupported
strings, so that relaxation was not incorporated. An isolated normalization
study of 1,340 recorded readings in the 20 empty scored cells changed neither
raw strings nor canonical values. Normalization alone cannot resolve this photo.
The individual cell audit contains private document values and remains outside
the repository. Nineteen scored cells still require manual inspection.
