# Patches

Applied automatically after `npm install` via `patch-package` (see `postinstall` in package.json).

## expo-notifications+0.31.4.patch

**Purpose:** Prevents crash when user taps a notification that was shown via expo-notifications (e.g. FCM foreground) on Android when the system delivers the tap Intent with null or missing `notification`/`action` extras.

**Crash fixed:**  
`java.lang.RuntimeException: Unable to start activity ComponentInfo{.../expo.modules.notifications.service.NotificationForwarderActivity}: java.lang.IllegalArgumentException: notification and action should not be null`

**Change:** Makes `NotificationForwarderActivity` defensive: if `intent.extras` is null or if creating the broadcast intent throws (e.g. missing parcelables), the activity opens the main app and finishes instead of crashing. Normal notification taps are unchanged.

**References:** Known expo-notifications issue on some Android versions (e.g. GitHub #24451, #29878). This patch is a safe workaround until an upstream fix is available in our version.
