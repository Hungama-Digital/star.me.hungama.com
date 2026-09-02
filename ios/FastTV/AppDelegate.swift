import Expo
import React
import ReactAppDependencyProvider
import MoEngageSDK
import MoEngageMessaging
import AVFoundation
import FirebaseCore
import UserNotifications

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Ensure the default Firebase app exists on iOS.
    // (Android auto-inits from google-services.json; iOS requires FirebaseApp.configure().)
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }

    // Use .playback so video/audio plays when device is muted (silent switch on).
    // Without this, carousel, feed, reels, and tile details video have no sound in silent mode.
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      print("AVAudioSession setCategory playback failed: \(error.localizedDescription)")
    }

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()
    // Use .live so SDK environment matches dashboard when doing Integration Validation with live environment
    MoEngage.sharedInstance.initializeDefaultInstance(environement: .live)
    
    // ✅ Register for Push Notifications
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    registerForPushNotifications(application)

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // ✅ MoEngage Push Registration helper
  func registerForPushNotifications(_ application: UIApplication) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound, .badge]) { [weak application] granted, error in
      if let err = error {
        print("❌ [MoEngage] Push permission error: \(err.localizedDescription)")
      }
      if granted {
        DispatchQueue.main.async {
          application?.registerForRemoteNotifications()
          print("✅ [MoEngage] Push permission granted, registered for remote notifications")
        }
      } else {
        print("⚠️ [MoEngage] Push permission denied")
      }
    }
  }

  // ✅ Hand off APNS token to MoEngage (use MoEngageSDKMessaging, not MoEngage)
  public override func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
    let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    print("✅ [MoEngage] APNs token received (\(deviceToken.count) bytes), passing to MoEngage")
    #if DEBUG
    print("   [MoEngage] Token (first 32 chars): \(String(tokenString.prefix(32)))... (use Sandbox in MoEngage dashboard for debug builds)")
    #endif
    MoEngageSDKMessaging.sharedInstance.setPushToken(deviceToken)
  }

  public override func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
    print("❌ Failed to register for remote notifications: \(error.localizedDescription)")
  }

  public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    MoEngageSDKMessaging.sharedInstance.userNotificationCenter(center, willPresent: notification)
    completionHandler([.banner, .sound, .badge])
  }

  // ✅ Handle notification clicks
  public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    MoEngageSDKMessaging.sharedInstance.userNotificationCenter(center, didReceive: response)
    completionHandler()
  }

  public override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    // Re-request APNs token when app becomes active if permission already granted (helps after reinstall or if first request was missed)
    UNUserNotificationCenter.current().getNotificationSettings { [weak application] settings in
      guard settings.authorizationStatus == .authorized else { return }
      DispatchQueue.main.async {
        application?.registerForRemoteNotifications()
      }
    }
    // Re-apply playback category when app becomes active (e.g. returning from background)
    // so video/audio still plays in silent mode after user switches back to the app.
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      // Ignore; session may already be correct
    }
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
