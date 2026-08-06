# StarME — Android Build Handoff

**Deliverable:** Native Android app (Kotlin + Jetpack Compose) implementing the approved `StarME_Demo.html` per the **StarME Android Build Spec v1.0**.
**Prepared:** 30 July 2026
**Source location:** `star.me.hungama.com/` (Git repo: `https://github.com/Hungama-Digital/star.me.hungama.com.git`, branch `main`)
**Status:** Feature-complete across all 7 milestones · 45 Kotlin files · static compile-review passed (no blocking errors) · **not yet built on device — see "What we need from you".**

---

## 1. What StarME is

A Fast TV feature: the subscriber uploads a selfie, signs a consent note, picks a Micro Drama shell + package, and receives a personalised drama with their name in the billing and downloadable episodes.

**Two truths the code preserves**
1. Personalisation is a **client-side illusion** in this build — the photo is composited into posters, title cards, and a playback overlay zone. Real in-video face transfer is a future backend service; swapping it in touches **exactly one class** (`RenderRepository`).
2. **Consent is a record, not a screen.** Every order carries a consent reference, and the app refuses to build an order without a valid, unrevoked one (enforced in code *and* by a DB foreign key).

---

## 2. Stack

Kotlin 2.0.20 · AGP 8.5.2 · Jetpack Compose (BOM 2024.09.02, Material 3, **dark only**) · Compose Navigation 2.8.0 · Room 2.6.1 · Media3 ExoPlayer 1.4.1 · CameraX 1.3.4 · ML Kit Face Detection 16.1.7 · WorkManager 2.9.1 · DataStore · Coil 2.7 · Accompanist Permissions 0.36.
**minSdk 26 · targetSdk 35 · compileSdk 35 · single activity.** All versions pinned in `gradle/libs.versions.toml`.

---

## 3. What we need from you (dev team)

The app was authored as a complete, review-clean source tree but has **not been compiled/run on a device** (no Android toolchain on the authoring machine). To build and publish:

1. **Open the project root (`star.me.hungama.com/`) in Android Studio** (Koala/Ladybug 2024.1+ with JDK 17 and SDK Platform 35). Studio syncs Gradle and regenerates the wrapper JAR automatically.
2. Run the `app` config on a device/emulator (Android 8.0+).

Command-line alternative:
```bash
cd star.me.hungama.com
gradle wrapper --gradle-version 8.9   # one-time: creates gradle-wrapper.jar (not committed)
./gradlew assembleDebug               # -> app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Three handoff caveats (deliberate, documented)

| # | Item | Why | Action for you |
|---|------|-----|----------------|
| 1 | `gradle/wrapper/gradle-wrapper.jar` is **not committed** | It's a binary; the authoring environment couldn't emit binaries | Android Studio regenerates on open, or run `gradle wrapper --gradle-version 8.9` once |
| 2 | Fonts ship as **system stand-ins** (not Anton/Inter TTFs) | Keeps the repo binary-free so it compiles immediately; font certs were **not** fabricated | For pixel-exact demo look: drop `Anton-Regular.ttf` + `Inter-*.ttf` into `app/src/main/res/font/`, then swap the two families in `ui/theme/Type.kt` and the two typefaces in `poster/PosterRenderer.kt`. (Downloadable Google Fonts is the alternative — dependency already declared.) |
| 3 | Episode **downloads** copy bundled assets into internal storage | Placeholder episodes are local assets, not remote URLs | When real remote episodes arrive, swap `data/repo/DownloadRepository.kt` to Media3 `DownloadService`; the DAO, UI, and record shape are unchanged |

---

## 5. Spec compliance checklist

- [x] Kotlin/Compose/Material 3 dark-only, minSdk 26 / targetSdk 35, single activity
- [x] Manifest parsed, **not hardcoded** (`shells_manifest.json` is the single source of truth)
- [x] Room schema exactly per §4; **no order without valid, unrevoked consent** (repo guard + FK)
- [x] Capture: CameraX front + Photo Picker; 4-row verification @650 ms; **ML Kit "exactly one face" gate** with retake guidance
- [x] Consent: verbatim note, two checkboxes, finger-signature Canvas, ref `STARME-{year}-{6 alphanum}`, ledger confirmation
- [x] Concept: 2 live + 4 "Soon" shells, role picker after shell select
- [x] Package: Anton numerals, "Most chosen" flag, insufficient balance → demo top-up (+250)
- [x] Production: 12:00:00 countdown, 5 render stages @1.1 s, WorkManager premiere notification (60 s stands in for 12 h)
- [x] Premiere: native 900×1350 poster PNG + MediaStore save, share intent, per-package episode unlock, ExoPlayer + face-zone overlay, downloads, provenance strip
- [x] Settings: revocation stamps `revokedAtEpoch`, blocks new orders, deletes photo + signature, keeps record row for audit
- [x] Photo + signature **never leave the device**; backup/extraction rules exclude them

---

## 6. Architecture map

```
com.hungama.starme
├─ StarMeApp / MainActivity / AppContainer   app entry, manual DI, notification channel
├─ state/           StarViewModel (flow state machine) + StarUiState + events
├─ ui/theme         palette, type, shapes (exact demo tokens)
├─ ui/nav           8-step Step enum + routes
├─ ui/components     top bar, stepper, CTA dock, buttons, signature pad, camera, player
├─ ui/screens       Promo, Subscribe, Capture, Consent, Concept, Package, Production, Premiere, Settings
├─ data/manifest    typed model + loader for shells_manifest.json
├─ data/local       Room entities, DAOs, database (spec §4)
├─ data/repo        Wallet, Consent, Order, Download repositories
├─ data/SessionStore  DataStore session flags
├─ billing/         BillingRepository + FakeBillingRepository  (Play Billing seam)
├─ render/          RenderRepository + FakeRenderRepository   (the §7 backend seam)
├─ face/            FaceChecker (ML Kit)
├─ poster/          PosterRenderer (native Canvas → PNG)
├─ work/            PremiereNotificationWorker (WorkManager)
└─ util/            FileStore, MediaExport, Constants
```

**Flow:** Promo → Subscribe → Capture → Consent → Concept → Package → Production → Premiere (+ off-flow Settings). The persistent CTA dock and 8-segment stepper live in `MainActivity`; per-screen CTA label/enabled logic mirrors the demo's `refreshCTA`.

---

## 7. Future backend (spec §7)

Implement `RenderRepository` for real face transfer, and wire real payments behind `BillingRepository` (Google Play Billing).

```
POST   /v1/orders      { consentRef, shellId, roleId, packageId, faceAssetId } -> { orderId, status }
GET    /v1/orders/{id} -> { status: QUEUED|RENDERING|QA|READY|FAILED, episodes:[{n,url,checksum}], posterUrl, trailerUrl }
POST   /v1/consents    { record + signature blob } -> { consentRef }
DELETE /v1/consents/{ref}   // revocation: stop renders, delete biometrics
```

---

## 8. Known demo simplifications (flagged as TODO in code)

- **Age gate** is a stub that passes (spec §1/§8). The real service must **fail closed** — resolve before store submission. Plug-in point noted in the verification row and `StarViewModel`.
- **Face overlay** in playback is a circular avatar over the swap zone, not real in-video transfer (replaced via `RenderRepository`).
- **Poster fonts** use condensed/sans stand-ins until Anton/Inter are bundled.
- **Liveness** uses ML Kit face presence + eyes-open as the demo stand-in for a true liveness check.

---

## 9. Assets included

`app/src/main/assets/shells/` — `shells_manifest.json` (source of truth) + 6 placeholder MP4s (3 per live shell, 1080×1920, 8 s, with the marked orange face-integration zone). Episodes 4–10 are `file: null` and stay locked until real content lands.

---

*Full technical README with build steps and font-swap snippets: `star.me.hungama.com/README.md`.*
