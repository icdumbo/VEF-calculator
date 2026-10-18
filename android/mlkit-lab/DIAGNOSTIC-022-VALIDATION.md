# Validation - 18 October 2026

Existing Codespace effective space tribble. Starting commit ef789ae; clean initial tree.
Build: Gradle 9.7.1, Microsoft JDK 25.0.4.1, source/target 17, AGP 8.10.1, SDK 36.
Tests: 14 baseline 0.1 tests + 13 recovered diagnostic tests passed, no failures/errors/skips.
Android Lint: 0 errors, 10 SetTextI18n warnings for English-only diagnostic labels.
assembleDebug successful in 26 seconds. No emulator/device execution claimed.
Merged manifest verified: non-exported :ocr_diagnostic service, main-process MlKitInitProvider, Common/Text/VisionCommon discovery retained, no INTERNET permission.
All 40 other recovered classes are byte-identical; only OcrDiagnosticService changes. Recovery checks all 213 method instruction sequences.
Private Fold JSON replay: 267 elements, 183 lines, 20 rows, 100 associated cells; 66 coherent, 32 review, 2 invalid. Every value/status/reason unchanged. Codespace JVM parser 526.893 ms. Semantic categories, not verified OCR accuracy.
Classes extracted from compiled APK also passed the same 13 tests, including initialization order and unchanged parser results.
Final APK signed locally with the pre-existing diagnostic certificate; V2/V3 verified; certificate matches previous diagnostic 0.2.2. All 475 non-signature entries unchanged. Keystore never uploaded or committed.
Package org.vef.mlkitlab.diagnostic; versionCode 5; versionName 0.2.2-diagnostic-initfix1; 46539928 bytes.
APK SHA-256: 0ef8bb7f69eb22c26c2cb88b16dd5685ed82fdc6cfaca248058084e3d56582d4.
Final signed APK: build/delivery/VEF-ML-Kit-Lab-0.2.2-diagnostic-initfix1.apk (also copied to usual app/build/outputs/apk/debug/app-debug.apk). ZIP: build/delivery/VEF-ML-Kit-Lab-0.2.2-initfix1-delivery.zip.

## Pending Galaxy Fold test

Install as an update, select the same photograph, run diagnostic OCR, export persistent diagnostic ZIP. Verify PREPARE_IMAGE completes and inspect MLKIT_OCR/PARSER/DISPLAY_RESULTS timings. Test Cancel and repeat a run. Initialization success and the 15-second goal remain unconfirmed on the phone.

Original diagnostic Java sources were unavailable. Executable classes were recovered from our APK, with an auditable source recovery tool rather than a speculative parser rewrite. See DIAGNOSTIC-022-RECOVERY.md. BASIC, FULL, main, PR #2 and preview are untouched. Private reports/photos, build outputs, local.properties and keystores are excluded from Git.
