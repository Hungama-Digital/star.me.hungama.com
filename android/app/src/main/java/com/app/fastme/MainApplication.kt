package com.app.fastme

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
import com.moengage.core.DataCenter
import com.moengage.core.MoEngage
import com.moengage.core.config.NotificationConfig
import com.moengage.react.MoEInitializer

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages
            // Packages that cannot be autolinked yet can be added manually here, for example:
            // packages.add(MyReactNativePackage())
            return packages
          }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()

    // smallIcon = white silhouette only (notification_icon.xml). largeIcon must be a plain bitmap;
    // adaptive ic_launcher often fails → SDK falls back to smallIcon, so expanded notif shows the play glyph.
    val notificationConfig = NotificationConfig(
        smallIcon = R.drawable.notification_icon,
        largeIcon = R.mipmap.ic_launcher_foreground,
        notificationColor = R.color.notification_icon_color,
        isMultipleNotificationInDrawerEnabled = true,
        isBuildingBackStackEnabled = true,
        isLargeIconDisplayEnabled = true
    )
    val moEngageBuilder = MoEngage.Builder(this, "N1HHQFTNK11YN4GSI4XC904M", DataCenter.DATA_CENTER_1)
        .configureNotificationMetaData(notificationConfig)
        
    MoEInitializer.initializeDefaultInstance(this, moEngageBuilder)
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
