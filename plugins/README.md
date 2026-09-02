# Expo config plugins

## withAndroidNativeMods.js

Applies Android native changes that must survive `expo prebuild` (and prebuild --clean): FCM killed-state notifications, MoEngage init, and the deep-link intent-filter.

**What it does:**

- **Android – FCM killed state**
  - `AppState.kt` – tracks foreground/background so we only show the notification when the app is not in foreground.
  - `FcmKilledNotificationReceiver.kt` – `BroadcastReceiver` for FCM that builds and shows the notification (title/body, app icon).
  - Patches `MainActivity.kt` to call `AppState.setForeground(true/false)` in `onResume`/`onPause`.
  - Adds the FCM receiver to `AndroidManifest.xml` with priority `999`.

- **Android – MoEngage**
  - **`res/values/moengage.xml`** – workspace ID and data center (same as iOS). Used as fallback by the SDK when file-based config is enabled.
  - **`MainApplication.kt`** – in `onCreate()`, initializes MoEngage with `MoEngage.Builder` (workspace ID + `DataCenter.DATA_CENTER_1`) and `MoEInitializer.initializeDefaultInstance()`. Required so push and analytics work; JS init alone is not enough for data center on Android.

- **Android – Deep link / App Links intent-filters**
  - **Custom schemes:** intent-filter with `VIEW`, `DEFAULT`, `BROWSABLE`, and data schemes **hmini** and **exp+hungama** (deep links and Expo dev client).
  - **App Links (verified):** intent-filter with `android:autoVerify="true"`, `VIEW`, `DEFAULT`, `BROWSABLE`, and `<data android:scheme="https" android:host="fasttv.app" android:pathPrefix="/"/>` so `https://fasttv.app/` links open the app when verified.

**Why a plugin:** Custom native files under `android/` are overwritten when someone runs `expo prebuild` or EAS Build. This plugin reapplies FCM killed-state logic and MoEngage init on every prebuild.

**Usage:** Reference in `app.json` as `"./plugins/withAndroidNativeMods.js"`. After changing the plugin, run `npx expo prebuild --clean` (or a normal prebuild) to reapply.
