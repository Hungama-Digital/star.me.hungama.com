import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy-load react-native-appsflyer to avoid "Cannot read property 'NativeModule' of undefined"
// at bundle load time on budget Android devices (Redmi/MediaTek) where the native module
// may not be registered yet when the JS bundle evaluates.
let _appsFlyer = null;
function getAppsFlyer() {
  if (_appsFlyer) return _appsFlyer;
  try {
    _appsFlyer = require('react-native-appsflyer').default;
  } catch (e) {
    return null;
  }
  return _appsFlyer;
}

const ATTRIBUTION_CAMPAIGN_KEY = 'appsflyer_attribution_campaign';

// AppsFlyer Configuration
const APPSFLYER_CONFIG = {
  devKey: 'za6ZAm5SkfE7T7C6PTFJo3',
  iosAppId: 'id6757302022',
  androidPackageName: 'com.app.hmini',
  isDebug: __DEV__, // Enable debug mode in development
};

// AppsFlyer Analytics Service
class AppsFlyerAnalyticsService {
  constructor() {
    this.isEnabled = Platform.OS !== 'web';
    this.isInitialized = false;
    this.userId = null;
    /** @type {string | null} Campaign/attribution from AppsFlyer (Organic or campaign name) for app_open */
    this._attributionCampaign = null;
    // Simple in-memory throttle to avoid event spam causing OOM
    this._lastEventSentAt = new Map();
  }

  /**
   * Get attribution campaign for app_open (Organic or campaign name). Uses in-memory value
   * or value persisted from previous app launch. Returns null if not yet known.
   */
  getCampaign() {
    return this._attributionCampaign;
  }

  /**
   * Resolve campaign from AppsFlyer conversion data and persist for app_open.
   * Must be called before initSdk (listener registered before init).
   */
  _registerConversionDataListener() {
    try {
      getAppsFlyer()?.onInstallConversionData((res) => {
        try {
          const data = res?.data || res;
          console.log('response--->try', data)
          if (!data) return;
          const afStatus = data.af_status;
          const campaign =
            afStatus === 'Organic'
              ? 'Organic'
              : (data.campaign || data.media_source || 'Non-organic');
          this._attributionCampaign = campaign || 'Organic';
          AsyncStorage.setItem(ATTRIBUTION_CAMPAIGN_KEY, this._attributionCampaign).catch(() => {});
        } catch (e) {
          console.log('response--->catch')
          this._attributionCampaign = 'Organic';
        }
      });
    } catch (e) {
      // ignore
    }
  }

  // Initialize AppsFlyer
  async initialize() {
    if (!this.isEnabled) {
      return;
    }

    try {
      // Load persisted attribution so getCampaign() is available before conversion data arrives
      const stored = await AsyncStorage.getItem(ATTRIBUTION_CAMPAIGN_KEY);
      if (stored) this._attributionCampaign = stored;

      // Listener must be registered before initSdk (per AppsFlyer docs)
      this._registerConversionDataListener();

      const initOptions = {
        devKey: APPSFLYER_CONFIG.devKey,
        isDebug: APPSFLYER_CONFIG.isDebug,
        onInstallConversionDataListener: true,
        onDeepLinkListener: true,
        manualStart: false,
      };

      if (Platform.OS === 'ios') {
        initOptions.appId = APPSFLYER_CONFIG.iosAppId;
      }

      await new Promise((resolve, reject) => {
        getAppsFlyer().initSdk(
          initOptions,
          (result) => {
            this.isInitialized = true;
            resolve(result);
          },
          (error) => {
            this.isInitialized = false;
            reject(error);
          }
        );
      });
      console.log('[AppsFlyer] initialize() done, isInitialized=', this.isInitialized);
    } catch (error) {
      this.isInitialized = false;
      console.error('[AppsFlyer] initialize() catch, isInitialized=', this.isInitialized, 'error=', error);
      throw error;
    }
  }

  // Check if AppsFlyer is available
  isAvailable() {
    return this.isEnabled && this.isInitialized;
  }

  /**
   * Get the AppsFlyer-generated device/install ID (UID).
   * Returns a Promise that resolves with the UID or null if unavailable.
   * Note: react-native-appsflyer callback is (error, uid), not (uid).
   */
  getAppsFlyerUID() {
    return new Promise((resolve) => {
      if (!this.isAvailable()) {
        resolve(null);
        return;
      }
      try {
        getAppsFlyer()?.getAppsFlyerUID((err, uid) => {
          if (err) {
            resolve(null);
            return;
          }
          const id = uid && String(uid).trim() ? String(uid).trim() : null;
          resolve(id);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Set user ID
  async setUserId(userId) {
    if (!this.isAvailable()) {
      return;
    }

    try {
      this.userId = userId;
      getAppsFlyer()?.setCustomerUserId(userId);
    } catch (error) {
    }
  }

  // Set user attributes
  async setUserAttributes(attributes) {
    if (!this.isAvailable()) {
      return;
    }

    try {
      // AppsFlyer uses setAdditionalData for user attributes
      Object.keys(attributes).forEach(key => {
        getAppsFlyer()?.setAdditionalData({ [key]: attributes[key] });
      });
    } catch (error) {
    }
  }

  _shouldSendEvent(eventName, properties) {
    // Throttle keys that are known to be high-frequency
    // Prefer a stable key (content_id / video_id / page_name / bucket_name)
    const id =
      properties?.content_id ??
      properties?.video_id ??
      properties?.page_name ??
      properties?.bucket_name ??
      '';
    const key = `${eventName}:${String(id)}`;
    const now = Date.now();
    const last = this._lastEventSentAt.get(key) ?? 0;

    // Default throttle: 1 event / 1500ms per key
    if (now - last < 1500) return false;
    this._lastEventSentAt.set(key, now);
    return true;
  }

  // Track event
  async trackEvent(eventName, properties = {}) {
    if (!this.isAvailable()) {
      return;
    }

    try {
      // Prevent event spam (this was causing OOM in production scenarios)
      if (!this._shouldSendEvent(eventName, properties)) return;

      // AppsFlyer uses logEvent with callbacks
      getAppsFlyer()?.logEvent(
        eventName,
        properties,
        (result) => {
          // Intentionally no verbose logging here.
          // Logging large objects at high frequency can OOM the JS/bridge threads.
        },
        (error) => {
          // Swallow errors in production paths; we don't want analytics to crash the app.
        }
      );
    } catch (error) {
      // Swallow errors; analytics must never crash the app.
    }
  }


 // Track start stream
  async trackStartStream(contentId, contentTitle, properties = {}) {
    await this.trackEvent('stream_started', {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }
  // Track end stream
  async trackEndStream(contentId, contentTitle, properties = {}) {
    await this.trackEvent('stream_finished', {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }
   // Track failed stream
  async trackFailedStream(contentId, contentTitle, properties = {}) {
    await this.trackEvent('stream_failed', {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }

   // Page_scrolled
  async trackPageScrolled(page_name, properties = {}) {
    await this.trackEvent('page_scrolled', {
      page_name: page_name,
      ...properties,
    });
  }
   // bucket_scrolled
  async trackBucketScrolled(bucket_name, properties = {}) {
    await this.trackEvent('bucket_scrolled', {
      bucket_name: bucket_name,
      ...properties,
    });
  }
   // search_query_submitted
  async trackSearchQuerySubmitted(search_query, properties = {}) {
    await this.trackEvent('search_query_submitted', {
      search_query: search_query,
      ...properties,
    });
  }
   // search_filter_applied
  async trackSearchFilterApplied(filter_name, properties = {}) {
    await this.trackEvent('search_filter_applied', {
      filter_name: filter_name,
      ...properties,
    });
  }
   // login_method_selected
  async trackLoginMethodSelected(login_method, properties = {}) {
    await this.trackEvent('login_method_selected', {
      login_method: login_method,
      ...properties,
    });
  }
     // login_successful
  async trackLoginSuccessful(auth_method, properties = {}) {
    await this.trackEvent('login_successful', {
      auth_method: auth_method,
      ...properties,
    });
  }
     // login_failed
  async trackLoginFailed(auth_method, properties = {}) {
    await this.trackEvent('login_failed', {
      auth_method: auth_method,
      ...properties,
    });
  }
     // subscription_button_clicked
  async trackSubscriptionButtonClicked(content_id, properties = {}) {
    await this.trackEvent('subscription_button_clicked', {
      content_id: content_id,
      ...properties,
    });
  }
     // watch_action_clicked
  async trackWatchActionClicked(content_id, properties = {}) {
    await this.trackEvent('watch_action_clicked', {
      content_id: content_id ,
      ...properties,
    });
  }
     // trailer_watched
  async trackTrailerWatched(content_id, properties = {}) {
    await this.trackEvent('trailer_watched', {
      content_id: content_id,
      ...properties,
    });
  }
     // artwork_clicked
  async trackArtworkClicked(content_id, properties = {}) {
    await this.trackEvent('artwork_clicked', {
      content_id: content_id,
      ...properties,
    });
  }

     // hero_banner_clicked
  async trackHeroBannerClicked(page_name, properties = {}) {
    await this.trackEvent('hero_banner_clicked', {
      page_name: page_name,
      ...properties,
    });
  }
     // hero_banner_viewed
  async trackHeroBannerViewed(page_name, properties = {}) {
    await this.trackEvent('hero_banner_viewed', {
      page_name: page_name,
      ...properties,
    });
  }
     // page_view
  async trackPageView(page_name, properties = {}) {
    await this.trackEvent('page_view', {
      page_name: page_name,
      ...properties,
    });
  }
     // app_open
  async trackAppOpen(properties) {
    await this.trackEvent('app_open', {
      ...properties,
    });
  }

  // Get AppsFlyer instance
  getAppsFlyer() {
    return getAppsFlyer();
  }

  // Start SDK (if using manual start)
  async start() {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await getAppsFlyer()?.start();
    } catch (error) {
    }
  }
}

// Create and export a singleton instance
const appsflyerAnalyticsService = new AppsFlyerAnalyticsService();

export default appsflyerAnalyticsService;
