# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ============================================
# React Native Core
# ============================================
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.yoga.** { *; }
-dontwarn com.facebook.react.**

# React Native TurboModules
-keep class com.facebook.react.turbomodule.** { *; }

# ============================================
# React Native Reanimated
# ============================================
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ============================================
# Expo Modules
# ============================================
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**
-keepclassmembers class * {
  @expo.modules.core.interfaces.DoNotStrip *;
}

# ============================================
# Firebase Core
# ============================================

# Keep Firebase core but allow shrinking unused internals
-keep class com.google.firebase.provider.FirebaseInitProvider { *; }

# Analytics
-keep class com.google.firebase.analytics.FirebaseAnalytics { *; }

# Crashlytics (important for reporting)
-keep class com.google.firebase.crashlytics.** { *; }

# Messaging (Push Notifications)
-keep class com.google.firebase.messaging.FirebaseMessagingService { *; }
-keep class com.google.firebase.messaging.** { *; }

# Auth
-keep class com.google.firebase.auth.** { *; }

# Prevent warnings
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ============================================
# MoEngage
# ============================================
-keep class com.moengage.** { *; }
-dontwarn com.moengage.**

# ============================================
# Stripe
# ============================================
-keep class com.stripe.android.** { *; }

# Keep Stripe models (critical for payment flow)
-keep class com.stripe.android.model.** { *; }

# Keep Stripe networking layer
-keep class com.stripe.android.networking.** { *; }

-dontwarn com.stripe.android.**

# ============================================
# React Navigation
# ============================================
-keep class com.reactnavigation.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# ============================================
# Google Sign In
# ============================================
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.api.** { *; }
-keep class com.google.android.gms.tasks.** { *; }

# Required for reflection inside Play Services
-keep class com.google.android.gms.common.internal.safeparcel.SafeParcelable { *; }

# ============================================
# AppsFlyer
# ============================================
-keep class com.appsflyer.** { *; }
-dontwarn com.appsflyer.**

# ============================================
# Mixpanel
# ============================================
-keep class com.mixpanel.** { *; }
-dontwarn com.mixpanel.**

# ============================================
# React Native IAP
# ============================================
-keep class com.dooboolab.** { *; }
-dontwarn com.dooboolab.**

# ============================================
# React Native Vector Icons
# ============================================
-keep class com.oblador.vectoricons.** { *; }

# ============================================
# React Native WebView
# ============================================
-keep class com.reactnativecommunity.webview.** { *; }

# ============================================
# Native Methods
# ============================================
-keepclasseswithmembernames class * {
    native <methods>;
}

# ============================================
# JavaScript Interface
# ============================================
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ============================================
# Serializable Classes
# ============================================
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ============================================
# Parcelable Classes
# ============================================
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

# ============================================
# Keep React Native View Managers
# ============================================
-keep class * extends com.facebook.react.uimanager.ViewManager {
    <init>(...);
}

# ============================================
# Keep React Native Modules
# ============================================
-keep class * implements com.facebook.react.bridge.NativeModule {
    <init>(...);
}

# ============================================
# Keep React Native Package
# ============================================
-keep class * implements com.facebook.react.ReactPackage {
    <init>(...);
}

# ============================================
# Keep Application Class
# ============================================
-keep class com.app.hmini.MainApplication { *; }
-keep class com.app.hmini.MainActivity { *; }
