package com.app.fastme
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper
import com.moengage.pushbase.MoEPushHelper
import android.util.Log


class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
    
    Log.d("SHORTIFY", "MainActivity: onCreate called. Intent: ${intent}")
    intent?.extras?.let { extras ->
        val keys = extras.keySet()
        Log.d("SHORTIFY", "MainActivity: onCreate Intent Extras: $keys")
        if (MoEPushHelper.getInstance().isFromMoEngagePlatform(extras)) {
            Log.d("SHORTIFY", "MainActivity: onCreate - Handling MoEngage click")
            MoEPushHelper.getInstance().logNotificationClick(this, intent)
        }
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  
  override fun onResume() {
    super.onResume()
    AppState.setForeground(true)
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    Log.d("SHORTIFY", "onNewIntent: Intent received: $intent")
    
    // Update the intent so MoEngage and RN Linking see the new push notification payload
    // instead of the original launch intent when resuming from the background.
    setIntent(intent)

    // ✅ Pass the intent to MoEngage native SDK to trigger the pushClicked event in React Native.
    // Even if the Intent has no extras (e.g. forwarded by Expo's NotificationForwarderActivity),
    // MoEngage internally maps the click to the last shown notification and emits pushClicked.
    try {
        val extras = intent.extras
        if (extras != null) {
            val keys = extras.keySet()
            Log.d("SHORTIFY", "onNewIntent: Intent Extras: $keys")
        } else {
            Log.d("SHORTIFY", "onNewIntent: Intent has NO extras")
        }

        Log.d("SHORTIFY", "onNewIntent: Calling MoEngage logNotificationClick")
        MoEPushHelper.getInstance().logNotificationClick(this, intent)
    } catch (e: Exception) {
        Log.e("SHORTIFY", "onNewIntent: Error passing intent to MoEngage", e)
    }
  }

  override fun onPause() {
    super.onPause()
    AppState.setForeground(false)
  }

  /**
   * Avoid TransactionTooLargeException (Binder parcel ~1MB limit).
   * Saving full activity/fragment state (e.g. activity result keys, fragment state) can exceed
   * this and crash when the activity is stopped. React Native app state lives in JS; we do not
   * rely on Android instance state for recovery, so skip persisting it.
   */
  override fun onSaveInstanceState(outState: Bundle) {
    // Intentionally not calling super.onSaveInstanceState(outState) to avoid persisting
    // large state (KEY_COMPONENT_ACTIVITY_REGISTERED_KEYS, fragments, etc.).
  }

  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
