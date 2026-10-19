# Inspector correction persistence (editfix1)

Base: 3206c31; branch codex/vef-mlkit-lab-diagnostic-022 only.
Initial audit: HEAD and origin both 3206c31, clean working tree, no unfinished
changes or AGENTS.md in the repository. The confirmfix1 result loader is retained.

Root cause: Step 3 populated EditText from cell.value and never listened for or
saved inspector edits. Resume and activity recreation read the original report,
so edits existed only in the old view tree.

MappingReviewStore keeps a versioned, private inspector-review JSON sidecar in
files/diagnostics. Identity includes session, confirmed geometry and column
choices. Reconfirming the same mapping can reuse edits across result job names;
changes to geometry/fields or session retain the old sidecar without applying it
to a different table. Review files do not depend on the APK version.

The sidecar records original OCR rows, reread candidates, source result filename,
and inspector edits with originalOcrValue, inspectorValue, row/field, timestamp
and confirmed=false. valuesConfirmed remains false. The original result, raw OCR,
reread reports, profiles and worker are never rewritten. Existing JSON/JSONL
export includes the new review sidecars. Blank corrections are intentional text.

Each text change is saved with AtomicFile and a synced file descriptor before
reporting success. Restoration sets text before registering the watcher; it never
writes a displayed OCR candidate into the inspector edits. Storage errors are
visible on the field and status. Unreadable review files are retained and fail
visibly instead of silently overwriting inspector evidence. No OCR or automatic
approval occurs on resume.

Existing v11 sessions without sidecars open unchanged. Text edits lost before
this fix were never written by v11 and cannot be reconstructed retrospectively.
The inspector must enter those corrections once in editfix1.

Regression coverage on API 28 and 35: 100-cell review and invalid OCR retention;
manual 6362.5776 -> 6362.576; repeated resume; bounds navigation; activity
recreation; original/reread immutability; blank and multiple-field edits;
reconfirming the same mapping with a new result filename; different session,
geometry and field isolation; interrupted atomic writes; damaged-file retention.
Native package update and Galaxy Fold testing are separate from these JVM tests.

Version: 0.2.2-diagnostic-editfix1 / versionCode 12.
Validation: Gradle testBaseline01, testMappingUi (including testDebugUnitTest),
lintDebug and assembleDebug completed successfully. 94 tests, 0 failures/errors/
skips, including 24 Android UI cases across API 28 and 35. Lint: 0 errors,
19 existing warnings. APK package/version verified, signature cryptographically
valid and new persistence classes/fields present in DEX; no Internet permission.

DELIVERY BLOCKED: the Codespace debug key certificate is
715d49c691ed5622028cc295bf4dcdf620da74d0dc09e2886c46e76fd62ee03e,
while the installed v11 lab uses
d162e292fd285b8ab19b3af48e08f8fffd663065550893678ef5a28f3ed4b3cf.
The original lab-repair.keystore was in the previous Work host, not this
Codespace. The current debug build MUST NOT be used as an in-place update.
Obtain the original key and re-sign the verified payload, then verify the final
APK certificate and install with adb install -r on the connected test device.
No Android device is connected to this Codespace, so real installation, process
restart and APK-upgrade preservation have not been tested on Galaxy Fold.
Do not uninstall or clear application data. No incompatible APK was published
as a Galaxy Fold update. Existing v11 delivery artifacts are retained.
