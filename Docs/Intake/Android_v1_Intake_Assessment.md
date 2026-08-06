# Android v1 Intake Assessment

**Date:** 6 August 2026

**Source:** `tmp/android-v1/StarMe.zip` (ignored local intake)
**Imported source:** `android/`

## Outcome

The ZIP contains a genuine Kotlin/Jetpack Compose Android v1 project rather than only an APK. The
source is suitable for adaptation and avoids a clean-room rebuild. It implements the simulated
eight-screen journey and establishes seams for billing and rendering.

## Verified intake facts

- Archive: 223 MB, 3,802 entries; no unsafe traversal paths.
- Android source: 45 Kotlin files, approximately 4,645 lines.
- Stack: Kotlin 2.0.20, AGP 8.5.2, Compose, Room, CameraX, ML Kit, Media3 and WorkManager.
- Application ID: `com.hungama.starme`; minimum API 26; target/compile API 35.
- The pack contains two duplicate debug APKs with matching SHA-256:
  `ab3fa3959e072ced302822b0581394c40a9d44647d17ff4358df32c50f5e6d69`.
- No high-risk credential patterns were found in source/configuration.
- The imported tree excludes local properties, caches, generated builds, APK/AAB files, macOS
  metadata and all episode MP4s.

## Existing product coverage

- Promo and simulated subscription/wallet.
- Camera/gallery capture and exactly-one-face ML Kit check.
- Typed name, signature pad, local consent ledger and revocation.
- Two live synthetic catalogue entries and package selection.
- Local Room models for wallet, consent, orders and downloads.
- Fake render progress, premiere notification, poster rendering, playback and downloads.
- `RenderRepository` and `BillingRepository` seams.

## Required v2.1 adaptation

- Add operator-issued single-use tester/device access.
- Replace local-only catalogue/order state with authenticated backend APIs.
- Upload capture and signature only to approved protected endpoints after consent wording is final.
- Add server-side consent version/reference, audit events, revocation and queued-job cancellation.
- Replace fake render stages with job creation and status polling.
- Add first-look approval/retake before full rendering.
- Replace bundled assets with 15-minute stream and 30-minute download signed URLs.
- Restrict the app/backend route to approved office/VPN TLS access.
- Remove production-roadmap claims that are waived or unavailable in the prototype.
- Add unit/UI/instrumentation coverage and device verification.

## Build verification status

JDK 17, Gradle 8.9, Android Build Tools 35 and Platform 35 are available. After the sanitized import
and authenticated API adaptation, `testDebugUnitTest`, `lintDebug` and `assembleDebug` complete
successfully. Two Android API serialization/response contract tests run. AGP 8.5.2 emits a warning
that it was tested through compile SDK 34 while the project compiles SDK 35; this should be resolved
through a separately verified dependency upgrade rather than suppressing the warning.

## Protected/local-only intake

The ZIP also contains six placeholder episode MP4s and extensive generated build output. These
remain under ignored `tmp/` storage and are not repository assets. Real shell packages still require
the approved protected handoff, rights record and Personal Dignity approval.
