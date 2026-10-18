# ML Kit diagnostic 0.2.2 initialization recovery

This branch restores the existing 0.2.2 diagnostic implementation from our own
previously delivered APK. The Codespace started at ef789ae (lab 0.1), not at the
diagnostic implementation. The previous diagnostic Java sources were unavailable.
The old 0.1 Java sources remain untouched for historical inspection and baseline
tests. They are explicitly excluded from this diagnostic build.

## Confirmed device failure

The exported Galaxy Fold journal records LOAD_PHOTO=12 ms, DECODE=160 ms, then
IllegalStateException from InputImage.fromBitmap in PREPARE_IMAGE at 192 ms.
ML Kit OCR never started. The separate process had not initialized MlKitContext.
The automatic MlKitInitProvider belongs to the main process; it does not initialize
the Java static context of :ocr_diagnostic.

## Narrow fix

recovery/RecoverDiagnostic.java relocates the one existing public
MlKit.initialize(getApplicationContext()) invocation to immediately before
InputImage.fromBitmap in the same process and worker. It remains inside the
existing timed PREPARE_IMAGE stage and watchdog coverage. No duplicate initializer,
new Application/provider, dependency upgrade or parser rewrite is introduced.

The build regenerates the app classes using the auditable Java recovery tool.
The original executable classes, provenance and non-compilable decompiler
reference are retained under recovery/. Only OcrDiagnosticService.class changes
after JVM metadata normalization. All other 40 classes, including the recovered
parser, journal, activity, cancellation and watchdog, are byte-identical.
The recovery verifies the instruction sequence of every method.

## Preserved behavior

- Persistent fsynced JSONL stage logs, raw text/counts and diagnostics export.
- 15-second total deadline; separate per-stage limits.
- Secondary :ocr_diagnostic process, non-exported service and independent watchdog.
- Process termination on timeout/cancel; no claim that ML Kit Task is cancellable.
- Existing parser, original OCR evidence, invalid text and Review Required policy.
- Offline bundled Latin ML Kit 16.0.1; no INTERNET permission or paid service.
- Distinct package org.vef.mlkitlab.diagnostic, versionCode 5.

## Tests and device follow-up

Validated build environment: Codespace Gradle 9.7.1, Microsoft JDK 25.0.4.1, Java source/target 17, Android SDK 36 / build-tools 35.0.0.

    MLKIT_REPORT=/private/device-report.json gradle -p android/mlkit-lab \
      :app:testBaseline01 :app:testDebugUnitTest :app:lintDebug
    gradle -p android/mlkit-lab :app:assembleDebug

The private JSON is supplied externally and must not be committed. The replay
asserts 267 words, 183 lines, 20 rows and 100 associated cells, and compares every
value/status/reason with the unmodified prior diagnostic parser. These are parser
associations and semantic flags, not independently verified OCR accuracy scores.
The real-device initialization and processing time remain unverified until the
new APK is tested on Galaxy Fold. Export persistent diagnostics after that test.

No BASIC, FULL, main, PR #2, preview or other branch is modified.
Never commit keystores, local.properties, photos or private diagnostic reports.
