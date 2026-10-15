# VEF ML Kit Lab 0.1

Isolated Android experiment in `icdumbo/VEF-calculator`, branch `codex/vef-mlkit-lab`.
Base: `basic-android16-validated-no-ads`, commit `74fcbf620957506ddd796b2e19d76534fea9a631`.
Existing BASIC, FULL, photo-import, old OCR Lab and preview are not modified.
Package ID: `org.vef.mlkitlab`; minimum Android 8 / API 26, target/compile API 36.

## Scope

Camera uses the system camera with a full-resolution private FileProvider output.
Gallery uses Android's document picker; no broad storage permission is required.
The Latin ML Kit model (`com.google.mlkit:text-recognition:16.0.1`) is bundled in
the APK, with no model download needed. There is no server, API key, paid API,
INTERNET permission or VEF calculation. No document is uploaded by this app.
Reference: https://developers.google.com/ml-kit/vision/text-recognition/v2/android

## Recognition and conservative table reconstruction

Decode, EXIF orientation, ML Kit and table parsing execute off the UI thread.
One ML Kit recognition call per Run. Decode is bounded to 16 million pixels and
8192 pixels per side using power-of-two sampling; source/OCR sizes are exported.
This memory limit can affect tiny text on unusually large photos and is reported,
not claimed accuracy-neutral. Original input is not overwritten and can be opened
in an installed image viewer. Preview is a scaled copy of the oriented original,
with no grid removal, thresholding or other destructive preprocessing.

Five observed semantic headers identify column positions; physical column order
may vary. Exactly 20 complete DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY date anchors
with consistent vertical spacing are required. Missing/extra/irregular anchors
leave the whole 20x5 table blank rather than shift rows or interpolate boundaries.
Column boundaries are estimated between observed header centers. This is a
limited geometry heuristic, not a general table detector. Strong skew,
perspective distortion, multiple tables and ambiguous headers need further work.
All mapped values remain unconfirmed. Word confidence below 0.80, boundary
crossings, multiline ambiguity and nonnumeric quantities leave the cell blank.
Numeric text is never repaired or converted based on assumed decimal separators.
Raw OCR text, confidence and bounds are exported for diagnosis.

90-second watchdog and Cancel invalidate results immediately. ML Kit's native
Task cannot be forcibly interrupted using its public API. Another run is blocked
until the current task releases resources; late results are discarded. There are
no concurrent OCR retries, busy-wait loops or fake percentage progress.

## Inspector report

The table always contains 20 rows and five columns. The immutable OCR reading is
shown separately from the editable inspector reference. Reference starts with the
OCR suggestion to reduce typing, but each row must be explicitly checked against
the original. Editing a reference invalidates its row confirmation.

Scores cover 100 cells: correct nonempty OCR, wrong nonempty OCR, blank OCR and
unreviewed. Only confirmed rows are scored; blanks always count as blank, even
when an inspector confirms an empty reference. Comparison is exact text after
trimming outside whitespace, so formatting differences count as mismatches.
This measures transcription agreement, not numeric equivalence or an independent
blind OCR benchmark. Never call an incomplete review a verified accuracy score.
JSON export includes frozen predictions, edited reference, review flags, scores,
raw OCR word coordinates, timings, dimensions and model version. It is saved only
to the local destination chosen by the inspector. It may contain confidential
document text; exporting does not upload it. Nothing is saved to app history.
Activity recreation retains image selection but discards unsaved review edits;
the UI reports this. Export the report before leaving the test.

## Build and tests

JDK 17, Gradle 8.13, Android SDK 36 / build tools selected by AGP 8.10.1.
Create a local **test-only** debug key (never reuse production BASIC signing):

```
keytool -genkeypair -keystore .local-signing/debug.jks -alias androiddebugkey -storepass android -keypass android -dname "CN=VEF ML Kit Lab Debug" -keyalg RSA -keysize 2048 -validity 3650
gradle --no-daemon testDebugUnitTest lintDebug assembleDebug
```

Create `.local-signing` first. Configure `ANDROID_HOME` or untracked
`local.properties` for the SDK. The repository intentionally contains no signing
key, private photograph, generated APK, machine path or binary build cache.
Parser tests use synthetic positioned text; they do not exercise OCR accuracy.

## Real Android test (not yet performed)

1. Install beside BASIC and old OCR Lab; do not uninstall either existing app.
2. Enable airplane mode, including Wi-Fi off, before the first OCR run.
3. Select a VEF photo from Gallery, then test a new Camera capture.
4. Run OCR; inspect elapsed timings, the original and all 100 predicted cells.
5. Correct each reference value and confirm each row against the original.
6. Export the JSON report. Test Cancel, another run and screen rotation separately.
7. Report correct/wrong/blank counts, unreviewed count, timings and device model.

No measured OCR precision, phone latency or installed-device compatibility is
claimed before the inspector's real-photo test. APK structural/signature checks
and unit tests cannot substitute for that test.
