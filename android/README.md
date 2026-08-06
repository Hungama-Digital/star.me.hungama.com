# StarME (Android)

Native Android build of **StarME**, a feature of Fast TV: a subscriber uploads a
selfie, signs a consent note, picks a Micro Drama shell + package, and receives a
personalised drama with their name in the billing and downloadable episodes.

> **Repository import note (6 August 2026):** This source was recovered from the approved v1
> build pack and sanitized before import into `staging`. Generated builds, local configuration,
> APKs and episode MP4s are intentionally excluded from Git. The placeholder episode files remain
> in controlled local intake storage until the content/rights handoff is reconciled.

This is the Kotlin/Jetpack Compose implementation of the approved
`StarME_Demo.html`, built to the **StarME Android Build Spec v1.0**.

> **Two truths this codebase preserves**
> 1. Personalisation here is a **client-side illusion** (photo composited into
>    posters, title cards, and a playback overlay zone). Real in-video face
>    transfer is a future backend service — swapping it in touches exactly one
>    class: [`RenderRepository`](app/src/main/java/com/hungama/starme/render/RenderRepository.kt).
> 2. **Consent is a record, not a screen.** Every order carries a consent ref and
>    the app refuses to build an order without a valid, unrevoked one.

---

## Prerequisites

- **Android Studio** Koala/Ladybug (2024.1+) or newer
- **JDK 17** (bundled with recent Android Studio)
- **Android SDK Platform 35**, Build-Tools 35.0.0
- A device/emulator on **Android 8.0 (API 26)** or higher

Stack: Kotlin 2.0.20 · AGP 8.5.2 · Jetpack Compose (BOM 2024.09.02, Material 3,
dark only) · Compose Navigation · Room · Media3 ExoPlayer · CameraX · ML Kit Face
Detection · WorkManager · DataStore. Versions are pinned in
[`gradle/libs.versions.toml`](gradle/libs.versions.toml).

## Build & run

### Option A — Android Studio (recommended)
1. **Open** the project root (`star.me.hungama.com/`) in Android Studio.
2. Studio will sync the pinned Gradle wrapper and project dependencies.
3. Run the `app` configuration on a device/emulator.

### Option B — Command line
The repository includes the pinned Gradle wrapper. Build with:

```bash
cd android
./gradlew assembleDebug               # outputs app/build/outputs/apk/debug/app-debug.apk
```

---

## Handoff notes (three things to know)

### 1. Gradle wrapper
The sanitized repository includes the complete Gradle 8.9 wrapper, including the wrapper JAR.
Local Gradle caches and generated build output remain excluded.

### 2. Fonts — Anton & Inter
The recovered source includes Anton and Inter font resources and wires them through the Compose
type system. Their redistribution/licensing metadata must be confirmed before release packaging.

### 3. Episode downloads
The v1 code copies placeholder episode assets into internal storage and records a `DownloadedEpisode`
([`data/repo/DownloadRepository.kt`](app/src/main/java/com/hungama/starme/data/repo/DownloadRepository.kt)).
The MP4s are excluded from Git. Remote signed-URL delivery will replace this repository with a
Media3 `DownloadService`; the DAO, UI and record shape can be retained.

---

## Architecture

Single-activity Compose app, manual DI via
[`AppContainer`](app/src/main/java/com/hungama/starme/AppContainer.kt).

```
com.hungama.starme
├─ StarMeApp / MainActivity / AppContainer   app entry, DI, notification channel
├─ state/           StarViewModel (flow state machine) + StarUiState + events
├─ ui/
│  ├─ theme/        palette, type, shapes (exact demo tokens)
│  ├─ nav/          8-step Step enum + routes
│  ├─ components/   top bar, stepper, CTA dock, buttons, signature pad, camera, player
│  └─ screens/      Promo, Subscribe, Capture, Consent, Concept, Package,
│                   Production, Premiere, Settings
├─ data/
│  ├─ manifest/     typed model + loader for shells_manifest.json (single source of truth)
│  ├─ local/        Room entities, DAOs, database (spec §4 schema)
│  ├─ repo/         Wallet, Consent, Order, Download repositories
│  └─ SessionStore  DataStore session flags
├─ billing/         BillingRepository + FakeBillingRepository (Play Billing later)
├─ render/          RenderRepository + FakeRenderRepository (the §7 backend seam)
├─ face/            FaceChecker (ML Kit, "exactly one face")
├─ poster/          PosterRenderer (native 900×1350 Canvas → PNG)
├─ work/            PremiereNotificationWorker (WorkManager)
└─ util/            FileStore, MediaExport, Constants
```

### The 8-screen flow
Promo → Subscribe → Capture → Consent → Concept → Package → Production → Premiere,
plus an off-flow **Settings**. The persistent bottom CTA dock and 8-segment stepper
live in `MainActivity`; per-screen CTA label/enabled logic mirrors the demo's
`refreshCTA` state machine.

## Spec compliance

- ✅ Kotlin/Compose/Material 3 dark-only, minSdk 26 / targetSdk 35, single activity
- ✅ Manifest parsed, not hardcoded (`shells_manifest.json` is the source of truth)
- ✅ Room schema exactly per §4; **no order without valid, unrevoked consent** (repo guard + FK)
- ✅ Capture: CameraX front + Photo Picker; 4-row verification at 650 ms; **ML Kit exactly-one-face gate**
- ✅ Consent: verbatim note, two checkboxes, finger-signature Canvas, ref `STARME-{year}-{6 alphanum}`, ledger
- ✅ Package: Anton numerals, "Most chosen", insufficient balance → demo top-up (+250)
- ✅ Production: 12:00:00 countdown, 5 render stages @1.1s, WorkManager premiere notification (60 s)
- ✅ Premiere: native poster PNG + MediaStore save, share intent, per-package episode unlock, ExoPlayer + face overlay, downloads, provenance strip
- ✅ Settings: revocation stamps `revokedAtEpoch`, blocks new orders, deletes photo+signature, keeps row for audit
- ✅ Photo + signature never leave the device; backup/extraction rules exclude them

## Future backend (spec §7)

Implement `RenderRepository` for real face transfer against:

```
POST   /v1/orders      { consentRef, shellId, roleId, packageId, faceAssetId } -> { orderId, status }
GET    /v1/orders/{id} -> { status: QUEUED|RENDERING|QA|READY|FAILED, episodes:[{n,url,checksum}], posterUrl, trailerUrl }
POST   /v1/consents    { record + signature blob } -> { consentRef }
DELETE /v1/consents/{ref}   // revocation: stop renders, delete biometrics
```

Wire real payments behind `BillingRepository` (Google Play Billing).

## Known demo simplifications (flagged in code as TODO)

- **Age gate** is a stub that passes (spec §1/§8). The real service must fail
  closed; the verification row and `StarViewModel` note where it plugs in.
- **Face overlay** in playback is a circular avatar over the swap zone, not real
  in-video transfer — replaced via `RenderRepository`.
- **Font licensing metadata** must be confirmed before release packaging.
- **Comparable liveness** relies on ML Kit face presence + eyes-open as the demo
  stand-in for a true liveness check.
