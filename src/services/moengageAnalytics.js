import { Platform } from "react-native";

/**
 * IMPORTANT (MoEngage):
 * Data Center is NOT reliably set from JS in the newer RN MoEngage SDK.
 * You must set Data Center natively:
 *  - Android: MainApplication (MoEngage Builder with DataCenter)
 *  - iOS: AppDelegate (MoEngageSDKConfig dataCenter)
 *
 * This JS file should only initialize + track events.
 */

// Cached module refs
let ReactMoE = null;
let MoEProperties = null;

// Load MoEngage only on native
const getMoEngageModule = () => {
  if (Platform.OS === "web") return { ReactMoE: null, MoEProperties: null };

  if (ReactMoE) return { ReactMoE, MoEProperties };

  try {
    const m = require("react-native-moengage");
    ReactMoE = m.default ?? m;
    MoEProperties = m.MoEProperties ?? null; // don't fallback to full module
    return { ReactMoE, MoEProperties };
  } catch (e) {
    console.warn("MoEngage module not available:", e);
    return { ReactMoE: null, MoEProperties: null };
  }
};

// MoEngage Configuration (ONLY workspaceId is needed in RN SDK init)
const MOENGAGE_CONFIG = {
  workspaceId: "N1HHQFTNK11YN4GSI4XC904M",
  // dataKey is NOT used for mobile SDK init; keep only if you use it elsewhere server-side
  dataKey: "pVZ1QwRmcJt61nNfDbEy7nnE",
};
// Same workspace ID as iOS (Info.plist) – used for Android so both platforms match
const MOENGAGE_WORKSPACE_ID_ANDROID = 'N1HHQFTNK11YN4GSI4XC904M';

class MoEngageAnalyticsService {
  constructor() {
    this.isEnabled = Platform.OS !== "web";
    this.isInitialized = false;
    this.userId = null;
  }

  /**
   * Initialize MoEngage (call once, e.g. app start)
   */
  async initialize() {
    if (!this.isEnabled) {
      console.log("MoEngage disabled on web");
      return;
    }

    const { ReactMoE: moe } = getMoEngageModule();
    if (!moe) {
      console.log("MoEngage module not available");
      return;
    }

    try {
      /**
       * RN SDK (newer versions) supports initialize(workspaceId, initConfig?)
       * If init config classes aren't present in your installed version,
       * we fall back to initialize(workspaceId).
       */
      const initWithConfig =
        moe?.initialize && typeof moe.initialize === "function";

      if (!initWithConfig) {
        console.warn("MoEngage initialize() not found on module");
        return;
      }

      // Determine workspace ID
      const workspaceId =
        Platform.OS === 'android' ? MOENGAGE_WORKSPACE_ID_ANDROID : MOENGAGE_CONFIG.workspaceId;

      // Try to build init config if SDK exports exist
      let initConfig = undefined;
      try {
        const m = require("react-native-moengage");
        const { MoEInitConfig, MoEPushConfig, MoEngageLogConfig, MoEngageLogLevel } = m;

        if (MoEInitConfig && MoEPushConfig && MoEngageLogConfig && MoEngageLogLevel) {
          const pushConfig = new MoEPushConfig(true); // ✅ Show in foreground
          const logLevel = __DEV__ ? MoEngageLogLevel.DEBUG : MoEngageLogLevel.ERROR;
          const logConfig = new MoEngageLogConfig(logLevel, false);
          initConfig = new MoEInitConfig(pushConfig, logConfig);
        }
      } catch (_) {
        // ignore fallback below
      }

      if (initConfig) {
        moe.initialize(workspaceId, initConfig);
      } else {
        moe.initialize(workspaceId);
      }

      this.isInitialized = true;
      console.log('✅ MoEngage initialized successfully');
      console.log('📋 MoEngage Config:', {
        workspaceId,
        platform: Platform.OS,
      });
    } catch (error) {
      console.error("❌ Error initializing MoEngage:", error);
      this.isInitialized = false;
    }
  }

  isAvailable() {
    return this.isEnabled && this.isInitialized;
  }

  /**
   * Identify user
   */
  async identify(userId) {
    if (!this.isAvailable()) {
      console.log("⚠️ MoEngage not available for identify");
      return;
    }

    const { ReactMoE: moe } = getMoEngageModule();
    if (!moe) return;

    try {
      this.userId = userId;

      // support both newer + older method names
      if (typeof moe.identifyUser === "function") {
        moe.identifyUser(userId);
      } else if (typeof moe.setUserUniqueID === "function") {
        moe.setUserUniqueID(userId);
      } else {
        console.warn("⚠️ MoEngage identify method not found");
      }
    } catch (e) {
      console.error("❌ Error setting user ID in MoEngage:", e);
    }
  }

  /**
   * Set user attributes
   */
  async setUserAttributes(attributes) {
    if (!this.isAvailable()) return;

    const { ReactMoE: moe } = getMoEngageModule();
    if (!moe) return;

    try {
      if (typeof moe.setUserAttribute !== "function") return;

      Object.keys(attributes || {}).forEach((key) => {
        moe.setUserAttribute(key, attributes[key]);
      });
      console.log('✅ MoEngage user properties set:', attributes);
      // email
      if (typeof moe.setUserEmailID === "function") moe.setUserEmailID(attributes['email']);
      else if (typeof moe.setUserEmail === "function") moe.setUserEmail(attributes['email']);

      // mobile / phone
      if (typeof moe.setUserContactNumber === "function") moe.setUserContactNumber(attributes['mobile']);
      else if (typeof moe.setUserMobileNumber === "function") moe.setUserMobileNumber(attributes['mobile']);

      // name
      if (typeof moe.setUserName === "function") moe.setUserName(attributes['name']);
    } catch (e) {
      console.error("❌ Error setting user attributes in MoEngage:", e);
    }
  }

  /**
   * Track event
   */
  async track(eventName, properties = {}) {
    if (!this.isAvailable()) return;

    const { ReactMoE: moe, MoEProperties: PropsCtor } = getMoEngageModule();
    if (!moe) return;

    try {
      if (typeof moe.trackEvent !== "function") {
        console.warn("⚠️ MoEngage trackEvent not found");
        return;
      }

      const hasProps = properties && Object.keys(properties).length > 0;

      // If SDK supports MoEProperties, use it; otherwise send plain object
      if (hasProps && PropsCtor) {
        const p = new PropsCtor();
        Object.keys(properties).forEach((k) => {
          const v = properties[k];

          // Many SDKs accept addAttribute(key, value)
          if (typeof p.addAttribute === "function") {
            if (
              typeof v === "string" ||
              typeof v === "number" ||
              typeof v === "boolean"
            ) {
              p.addAttribute(k, v);
            } else if (v === null || v === undefined) {
              // skip null/undefined
            } else {
              p.addAttribute(k, JSON.stringify(v));
            }
          }
        });

        moe.trackEvent(eventName, p);
      } else if (hasProps) {
        moe.trackEvent(eventName, properties);
      } else {
        moe.trackEvent(eventName);
      }
    } catch (e) {
      console.error("❌ Error tracking event in MoEngage:", e);
      console.error("Event:", eventName, "Props:", properties);
    }
  }

  // Convenience wrappers (keeping your existing API)
  async trackStartStream(contentId, contentTitle, properties = {}) {
    return this.track("stream_started", {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }

  async trackEndStream(contentId, contentTitle, properties = {}) {
    return this.track("stream_finished", {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }

  async trackFailedStream(contentId, contentTitle, properties = {}) {
    return this.track("stream_failed", {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }

  async trackPageScrolled(page_name, properties = {}) {
    return this.track("page_scrolled", { page_name, ...properties });
  }

  async trackBucketScrolled(bucket_name, properties = {}) {
    return this.track("bucket_scrolled", { bucket_name, ...properties });
  }

  async trackSearchQuerySubmitted(search_query, properties = {}) {
    return this.track("search_query_submitted", { search_query, ...properties });
  }

  async trackSearchFilterApplied(filter_name, properties = {}) {
    return this.track("search_filter_applied", { filter_name, ...properties });
  }

  async trackLoginMethodSelected(login_method, properties = {}) {
    return this.track("login_method_selected", { login_method, ...properties });
  }

  async trackLoginSuccessful(auth_method, properties = {}) {
    return this.track("login_successful", { auth_method, ...properties });
  }

  async trackLoginFailed(auth_method, properties = {}) {
    return this.track("login_failed", { auth_method, ...properties });
  }

  async trackSubscriptionButtonClicked(content_id, properties = {}) {
    return this.track("subscription_button_clicked", { content_id, ...properties });
  }

  async trackWatchActionClicked(content_id, properties = {}) {
    return this.track("watch_action_clicked", { content_id, ...properties });
  }

  async trackTrailerWatched(content_id, properties = {}) {
    return this.track("trailer_watched", { content_id, ...properties });
  }

  async trackArtworkClicked(content_id, properties = {}) {
    return this.track("artwork_clicked", { content_id, ...properties });
  }

  async trackHeroBannerClicked(page_name, properties = {}) {
    return this.track("hero_banner_clicked", { page_name, banner_id: properties.banner_id, ...properties });
  }

  async trackHeroBannerViewed(banner_id, properties = {}) {
    return this.track("hero_banner_viewed", { banner_id, ...properties });
  }

  async trackPageView(page_name, properties = {}) {
    return this.track("page_view", { page_name, ...properties });
  }

  async trackAppOpen(properties = {}) {
    return this.track("app_open", { ...properties });
  }

  /**
   * Notify MoEngage that app entered background. Session end is handled by native SDK
   * (inactivity timeout, typically 30 min). Tracking this event helps with session boundaries.
   */
  async trackAppBackground() {
    return this.track("app_background", {});
  }

  /**
   * Notify MoEngage that app came to foreground (new or resumed session).
   */
  async trackAppForeground() {
    return this.track("app_foreground", {});
  }

  /**
   * Pass FCM push token to MoEngage so push notifications work (dashboard shows green icon).
   * - Android: passFcmPushToken(token) must be called with the FCM token from Firebase.
   * - iOS: registerForPush() registers with APNs; MoEngage gets token natively.
   * Call this whenever the FCM token is obtained or refreshed.
   */
  async passPushToken(fcmToken) {
    if (!this.isEnabled) return;

    const { ReactMoE: moe } = getMoEngageModule();
    if (!moe) {
      console.warn("[MoEngage] passPushToken skipped: module not available");
      return;
    }

    try {
      if (Platform.OS === "android") {
        if (!fcmToken || typeof fcmToken !== "string") {
          console.warn("[MoEngage] passPushToken skipped: no valid FCM token (Android)");
          return;
        }
        if (typeof moe.passFcmPushToken === "function") {
          moe.passFcmPushToken(fcmToken);
          console.log("[MoEngage] passFcmPushToken() called successfully (token length:", fcmToken.length, ")");
        } else {
          console.warn("[MoEngage] passFcmPushToken not found on SDK");
        }
      } else if (Platform.OS === "ios") {
        if (typeof moe.registerForPush === "function") {
          moe.registerForPush();
          console.log("[MoEngage] registerForPush() called successfully (iOS)");
        } else {
          console.warn("[MoEngage] registerForPush not found on SDK");
        }
      }
    } catch (e) {
      console.error("[MoEngage] passPushToken error:", e);
    }
  }

  /**
   * Pass FCM push payload to MoEngage so they can track delivery and validation succeeds.
   * Call this when you receive/display an FCM message (foreground or background).
   * @param {object} pushPayload - FCM message data (e.g. remoteMessage.data)
   */
  passFcmPushPayload(pushPayload) {
    if (!this.isEnabled || Platform.OS !== "android") return;
    const { ReactMoE: moe } = getMoEngageModule();
    if (!moe || typeof moe.passFcmPushPayload !== "function") return;
    try {
      moe.passFcmPushPayload(pushPayload || {});
    } catch (e) {
      console.warn("[MoEngage] passFcmPushPayload error:", e?.message);
    }
  }

  getMoEngage() {
    const { ReactMoE: moe } = getMoEngageModule();
    return moe || null;
  }

  /**
   * Reset / logout
   */
  async reset() {
    if (!this.isAvailable()) return;

    const { ReactMoE: moe } = getMoEngageModule();
    if (!moe) return;

    try {
      if (typeof moe.logout === "function") {
        moe.logout();
      }
      this.userId = null;
    } catch (e) {
      console.error("❌ Error resetting MoEngage:", e);
    }
  }

  /**
   * Set push token for MoEngage (FCM handoff)
   * - Android: passes FCM token via passFcmPushToken (setPushToken is not in the RN SDK).
   * - iOS: APNs token is passed natively in AppDelegate to MoEngageSDKMessaging; no JS API.
   * @param {string} token - FCM token (Android) or unused on iOS
   */
  async setPushToken(token) {
    if (!token) return;

    // iOS: token is handed off natively in AppDelegate (didRegisterForRemoteNotificationsWithDeviceToken).
    if (Platform.OS === "ios") {
      return;
    }

    // Android: React Native MoEngage SDK uses passFcmPushToken, not setPushToken.
    await this.passPushToken(token);
  }

  /**
   * Pass push payload to MoEngage (FCM payload handoff)
   * @param {object} payload - FCM payload data
   */
  async passPushPayload(payload) {
    if (!payload) return;

    const { ReactMoE: moe } = getMoEngageModule();
    if (!moe) return;

    try {
      if (typeof moe.passPushPayload === "function") {
        moe.passPushPayload(payload);
        console.log("✅ MoEngage push payload passed successfully");
      } else {
        console.warn("⚠️ MoEngage passPushPayload method not found");
      }
    } catch (e) {
      console.error("❌ Error passing MoEngage push payload:", e);
    }
  }

  /**
   * Alias for passPushPayload to match common implementations
   * @param {object} payload - FCM payload data
   */
  async passFcmPushPayload(payload) {
    return this.passPushPayload(payload);
  }
}

const moengageAnalyticsService = new MoEngageAnalyticsService();
export default moengageAnalyticsService;
