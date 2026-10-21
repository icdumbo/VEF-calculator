# Date-format recovery checkpoint — 2026-10-21

Paused at user request. This is a source checkpoint, not a released Android update.

Implemented before pause:
- Observed English month dates (case insensitive), two/four digit years, existing numeric dates and ISO dates.
- Calendar validation without rewriting observed text or inferring the century; ambiguous dates require review.
- Observed per-column row tracks for extended-date layouts; insufficient evidence remains missing, without inventing rows.
- Existing numeric-layout path and saved manual-edit persistence retained.

Previously executed validation (not rerun during checkpoint saving):
- 106/106 tests: 14 baseline, 68 diagnostic, 24 Android UI cases; no failures or skips.
- Pink real JSON replay: 20 observed rows, 7 physical columns, 100 associated standard cells; independent image comparison: 98 correct and 2 invalid OCR readings retained, 0 missing. No automatic approval or numeric repair.
- First clear document and manual-edit persistence regression tests passed.
- Android Lint: 0 errors, 19 warnings.
- The previously launched Gradle validation/build completed successfully in 1m 57s. No new tests/build were started after the pause request.

Pending, not completed:
- Final APK payload inspection and signing with the installed lab certificate.
- In-place update compatibility verification and delivery.
- Real Galaxy Fold validation of this datefix version, including timing and retained manual edits.
- Version metadata is prepared as 0.2.2-diagnostic-datefix1 / versionCode 13; it does not imply delivery.

The rejected global-perspective experiment remains separate in ignored build/ObservedRowPerspective-experiment.java, outside application sources. Private fixtures, photographs, logs, APKs, credentials and signing keys are not committed. Existing private replay files and build logs remain under build/.
