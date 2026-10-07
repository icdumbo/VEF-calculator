# Vessel VEF Calculator BASIC — Android

Offline Android wrapper for the tested BASIC calculator. Android 8.0 or later, with an up-to-date Android System WebView. Application ID: `app.vessel.vef.basic`. Compile/target SDK: API 36. Release: versionCode `3`, versionName `1.0`; debug versionName `1.0-test3`. The delivered test2 APK remains unchanged.

The calculation file is copied unchanged from the inspected BASIC archive. Maximum 20 voyage cards. VEF is calculated with any positive number of qualified voyages, including fewer than five, as requested. Qualification uses the unrounded ratio and average ± 0.003. No persistence, accounts, network permission, analytics, exports, or real vessel fixtures are included.

The launcher displays `VEF BASIC`. The complete name appears in the calculator. The icon is derived from the approved logo. Android Back closes an open form confirmation first; otherwise it asks before discarding entered data. Rotation retains the running page. Process termination and closing the app discard inputs.

## Build

Requires JDK 17, Gradle 8.11.1, stable Android Gradle Plugin 8.10.1, SDK platform 36 and build tools 35.0.0, with the SDK licence accepted. Set `JAVA_HOME` and `ANDROID_HOME` to your installations. Set `VEF_TEST_KEYSTORE` to the existing test key; preserve it for test APK updates, then run:

```powershell
gradle --no-daemon :app:assembleDebug :app:lintDebug
```

Alternatively open this project in Android Studio and select Build APK. The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. This build is for direct testing, not Google Play publication. Keep the test signing key locally if distributing updated test builds; never use that key for a production release.

## Phone checks

1. Open in airplane mode and enter a voyage with Ship 1002 and B/L 1000: VEF 1.0020, one qualified voyage.
2. Add cards up to 20: Add voyage is disabled. Remove one: adding is available again.
3. Test New / Clear / Remove: cancellation preserves data, confirmation clears only the intended data.
4. Verify manual DD.MM.YYYY dates, invalid-date rejection, numeric keyboard, uppercase Port/Cargo, keyboard Next, screen rotation and scrolling while the keyboard is open. On Android 16, check status/navigation bars and keyboard insets.
5. Press Android Back with data entered: Keep editing preserves the session; Close exits.
6. Independently enter the three user-held reference datasets: expected VEF/qualified counts are 1.0002/20, 0.9987/7, and 0.9956/19.

The original PDFs and their data are intentionally not part of this project or APK. Numeric regression tests are distinct from device testing; installation and interaction on physical hardware remain necessary.

## Google Play release preparation

Read [PLAY-RELEASE.md](PLAY-RELEASE.md) before creating a production key or enrolling in Play App Signing. No production key has been created and no publication has occurred.

Release signing reads four environment variables only: `VEF_UPLOAD_KEYSTORE` (absolute path outside the project and Git worktree), `VEF_UPLOAD_STORE_PASSWORD`, `VEF_UPLOAD_KEY_ALIAS`, and `VEF_UPLOAD_KEY_PASSWORD`. Supply them privately in the current local process and clear them afterward. Never place real values in project files, GitHub, chat, committed scripts or command-line arguments. Do not use `--debug`, `--info` or `--scan` with signing credentials. Configuration caching is disabled to avoid caching those values.

The build stops if release credentials are missing. It rejects debug/test certificates and keystores inside the project/Git worktree; it never falls back to `VEF_TEST_KEYSTORE`. After the owner authorizes and creates the separate upload key:

```powershell
gradle --no-daemon --no-configuration-cache :app:bundleRelease :app:lintRelease
```

The signed output is `app/build/outputs/bundle/release/app-release.aab`. Verify its signature and manifest before uploading. Increment versionCode for each future upload and retain the package ID and production signing identity. Publication requires separate authorization.

Before key creation, packaging can be checked with no `VEF_UPLOAD_*` variables:

```powershell
gradle --no-daemon :app:assembleDebug :app:lintDebug :app:lintRelease :app:testDebugUnitTest :app:testReleaseUnitTest :app:bundleRelease -PvefUnsignedVerification=true
```

This explicit mode generates an UNSIGNED verification bundle, not a production deliverable and not uploadable to Play. Remove the flag for an actual signed release. The native unit-test tasks have no existing test cases; calculator/form regression suites are separate. Calculator assets, native activity, resources and manifest are retained from test2; no VEF functionality was changed.
