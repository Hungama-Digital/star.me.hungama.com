# Crash reduction guidelines

This doc summarizes patterns applied in the app to reduce Android and Hermes crashes. Use it when implementing new features or refactoring so we don’t reintroduce these issues.

---

## 1. Hermes: "Cannot read property 'NativeModule' of undefined"

**Cause:** JS touches a native module during the **initial bundle load** (e.g. when `App.js` or its imports are evaluated) before the React Native bridge is ready.

**Mitigation:** Avoid loading native/Expo modules at top level on the startup path.

### What we did

| Location | Change |
|----------|--------|
| **App.js** | No top-level `expo-splash-screen`; `preventAutoHideAsync()` and `hideAsync()` run via `require('expo-splash-screen')` inside `useEffect`. |
| **AuthContext** | No top-level `appleAuth` / `facebookAuth`; use `getAppleAuth()` / `getFacebookAuth()` that `require` the service when first used. |
| **phoneAuth.js** | No top-level `@react-native-firebase/auth` or `react-native-otp-verify`; use `getAuth()` and `getOtpVerifyGetHash()`. |
| **iapService.js** | No top-level `react-native-iap`; use `getRNIap()` on first use. |
| **ManageSubscriptionScreen** | No top-level `react-native-iap`; require inside the button handler that opens subscription management. |
| **deepLinkingService** | No top-level `expo-linking`; use `getLinking()` and lazy `getLinkingPrefix()`. |
| **AuthGate** | No top-level `expo-linking`; use `getLinking().getInitialURL()`. |
| **i18n** | Not used; import and usage commented out so `expo-localization` is never loaded. |

### When adding new code

- If a **new screen, context, or service** is imported from `App.js` (or from something App.js imports), **do not** top-level-import any of: Expo modules, React Native native modules, Firebase, IAP, auth SDKs, linking.
- Prefer **lazy getters** (`function getX() { return require('...'); }`) or **require inside `useEffect` / event handlers** for such dependencies.

---

## 2. expo-video: MediaSession NPE, "shared object already released", foreground service

**Causes:** Too many MediaSessions; using a player after it was released; playback service started but not calling `startForeground()` in time.

**Mitigation:**

- **ReelItem / list items:** `useVideoPlayer(isCurrentVideo ? source : null, ...)` so only the current item has a source; others get `null` and the previous session is released.
- **Timers/intervals** that read `player.currentTime`, `player.duration`, `player.playing`: wrap in **try/catch** so a callback after the player was released doesn’t crash.
- **Native patch:** `patches/expo-video+2.2.3.patch` adds (1) try/catch in `registerPlayer` to avoid MediaSession NPE, and (2) `startForeground()` in `ExpoVideoPlaybackService.onCreate()` so the service always complies with foreground service rules.

When adding new video list UIs or new expo-video usage, reuse the same pattern (one active player per “current” item, `null` when not current, try/catch around any delayed player access). When upgrading expo-video, re-apply or re-check this patch.

---

## 3. Android: TransactionTooLargeException

**Cause:** Saved instance state (activity + fragments + activity result keys) exceeded the Binder transaction limit (~1 MB).

**Mitigation:** In **MainActivity.kt**, `onSaveInstanceState` is overridden and **does not** call `super.onSaveInstanceState(outState)`, so we don’t persist that state. App state is in JS; on process kill the app restarts from scratch.

Do not reintroduce saving large state in MainActivity or new activities without considering this limit.

---

## 4. Android: startForegroundService() did not call startForeground()

**Cause:** A service started as a foreground service did not call `startForeground()` quickly enough.

**Mitigation:** Handled in the expo-video patch: `ExpoVideoPlaybackService` calls `startForeground()` in `onCreate()` with a placeholder notification. Any **new** foreground service must also call `startForeground()` shortly after start.

---

## 5. libreactnative.so not found

**Cause:** Often on **rooted/Xposed devices** or due to build/ABI issues. Not fixable in app code for Xposed.

**Mitigation:** For normal devices, do a clean build and ensure the built APK contains the expected native libs. If the crash is only on modified devices, treat as environment-specific.

---

## Quick checklist for new changes

- [ ] No new top-level imports of native/Expo modules on the App.js load path.
- [ ] New expo-video usage: only one “current” player per list, `null` when not current, try/catch around timer/async access to player.
- [ ] New Android foreground services: call `startForeground()` in `onCreate()` (or equivalent).
- [ ] No new large state saved in Android `onSaveInstanceState` without considering TransactionTooLargeException.
