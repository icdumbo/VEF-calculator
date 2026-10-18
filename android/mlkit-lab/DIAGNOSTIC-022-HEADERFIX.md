# ML Kit Diagnostic 0.2.2 headerfix1

Base: parserfix1, commit 58b9ce26f47de6745232bd977b71d4a713078183.
Scope: codex/vef-mlkit-lab-diagnostic-022 only. No BASIC, FULL, main, PR #2,
preview, calculation, OCR model, dependency or image preprocessing change.

## Real-device evidence

The supplied parserfix1 Galaxy Fold run completed in 3592 ms, without timeout.
OCR: 861 ms, one call, 156 blocks / 181 lines / 324 elements. Parser: 2187 ms;
text grouping accounted for 1758 ms, internal validation about 2.75 ms.
The result had 20 rows but only 60 associated cells: both numeric headers missing.

The raw OCR contains SHIP'S and B/L on the upper header line, and two distinct
FIGURES tokens below. The vertical gap is 48 OCR pixels; the old adjacency rule
allows only 45 pixels (3 times the larger 15-pixel glyph height). Thus correctly
recognized numeric text was excluded by missing header geometry, not by ML Kit.

## Generic header repair

HeaderRuntime adds observed candidates to the existing candidate list. It uses
the same original date-column anchors and header band, with positive median row
pitch as an additional scale for two-line header separation. Candidates require
horizontal overlap and center alignment. Multiple possible lower fragments or
competing upper fragments are rejected. Prefixes, suffixes, coordinates, IDs,
text and confidences come from OCR; no vessel values or absolute positions enter
selection. Canonical candidates already supplied by the old discovery are kept.

The explicit OCR header alias BIL FIGURES (joined or fragmented) is supported.
Its original BIL text and fragment confidence remain in diagnostics. Every cell
associated through that alias is marked HEADER_OCR_ALIAS_REQUIRES_REVIEW, even
when its quantity syntax is valid. Invalid quantities are retained as invalid,
never repaired. Numeric glyphs and separators are not changed.

The auditable recovery tool adds narrow bridges to the original private date
anchor/candidate/Head implementations and redirects only header discovery plus
review annotation. Only the recovered TableParser class changes relative to
parserfix1. Its row/cell association logic and typed validation are preserved.
The 40 other recovered classes, including the initialized isolated OCR service,
remain byte-identical. ParserRuntime, its caches, persistent phase logs,
5000-ms parser budget and 15000-ms global deadline remain unchanged.

## Independent cell-by-cell evaluation

The original supplied image was visually transcribed into a private 20 x 5
oracle. The extractor receives only raw OCR tokens. Tests load the oracle after
extraction, then compare every field in its actual row/column and check original
evidence membership, duplicate token assignment and absence of value repairs.
The oracle and raw report are external test inputs under ignored build/ paths;
they are neither application inputs nor committed files nor APK assets.

On the clear photo's saved 324-element JSON:

| Column | Before correct / wrong / missing | After correct / wrong / missing | After candidate / review |
| --- | --- | --- | --- |
| Port/Terminal | 20 / 0 / 0 | 20 / 0 / 0 | 5 / 15 |
| B/L Date | 20 / 0 / 0 | 20 / 0 / 0 | 19 / 1 |
| Cargo | 20 / 0 / 0 | 20 / 0 / 0 | 3 / 17 |
| Ship's Figures | 0 / 0 / 20 | 20 / 0 / 0 | 19 / 1 |
| B/L Figures | 0 / 0 / 20 | 20 / 0 / 0 | 20 / 0 |
| Total | 60 / 0 / 40 | 100 / 0 / 0 | 66 / 34 |

All 60 previous values are preserved; 40 numeric cells are recovered. All 100
extracted values match the independently read photograph. All remain inspector
candidates, with 34 retaining review warnings; no field is automatically approved.
This result is automatic parsing of real saved OCR, not a new native Android run.

## Executed checks

- Codespace Gradle/JDK build: 41 tests, 0 failures, 0 skipped.
- 9 new tests: two-line gap, BIL alias review, inline alias, conflicting fragments,
  column misalignment, footer rejection, scaling/translation with 7 rows,
  original header confidence, and all 100 real-photo values/evidence.
- Existing 120 randomized grouping-equivalence cases and 100 unique synthetic
  row/column values still pass; impossible dates and invalid numbers stay flagged.
- Old 267-element fixture remains 20 rows / 100 associated, with identical values,
  flags and reasons: 66 candidates, 32 review, 2 invalid (not an accuracy score).
- Old 275-element input improves from 80 to 100 associated through BIL recovery;
  41 candidates, 58 review, 1 invalid. All previous 80 values/flags/evidence stay
  identical. The newly exposed invalid numeric reading is not repaired/approved.
- Android Lint: 0 errors, 10 existing English-label SetTextI18n warnings.
- Clear-photo Codespace JVM parse: 353.012 ms (single replay, not phone timing).

## Delivery and remaining verification

Package org.vef.mlkitlab.diagnostic; versionCode 7;
versionName 0.2.2-diagnostic-headerfix1. The bundled offline ML Kit is unchanged.
The new APK requires a Galaxy Fold test on the same photo before claiming new
on-device 100/100 extraction or a new processing time. Install over parserfix1,
run the diagnostic and export the ZIP. Check all 20 rows and the original cells,
including the values marked Review Required. No paid service is used.

APK artifact verification: all 27 diagnostic tests also pass against classes extracted from the compiled APK. Signing v2/v3 verified with the existing lab certificate (same as parserfix1). APK SHA-256: 884cbc961e704b05418459e888b1e91a49353e43f05e5be6318403d37e5a0ced.
