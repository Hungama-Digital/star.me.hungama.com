import { Platform } from 'react-native';
// Lazy-loaded inside initialize() to avoid "Cannot read property 'NativeModule' of undefined"
// at bundle load time on budget Android devices.

// Mixpanel Configuration
const MIXPANEL_CONFIG = {
 /// PROD

  // projectToken: 'a6be67695a5584b3d9e67609990d4fa9',
  // projectId: '3987259',
  // apiSecret: '1f474d80acc4a20501b0da3ae320b708',

  // DEV
    projectToken: 'df7df4bfd68a61480b681cdfee8e3bed',
  projectId: '3976933',
  apiSecret: 'c3ab964bfad168141d2584331d9a7ebb',
  trackAutomaticEvents: true,
  optOutTrackingDefault: false,
  useNative: true,
  serverURL: 'https://api.mixpanel.com',
};

// Mixpanel Analytics Service
class MixpanelAnalyticsService {
  constructor() {
    this.mixpanel = null;
    this.isEnabled = Platform.OS !== 'web';
    this.isInitialized = false;
    this.userId = null;
  }

  // Initialize Mixpanel
  async initialize() {
    if (!this.isEnabled) {
      console.log('Mixpanel not available on web platform');
      return;
    }

    try {
      const { Mixpanel } = require('mixpanel-react-native');
      // Create Mixpanel instance
      this.mixpanel = new Mixpanel(
        MIXPANEL_CONFIG.projectToken,
        MIXPANEL_CONFIG.trackAutomaticEvents,
        MIXPANEL_CONFIG.useNative,
        MIXPANEL_CONFIG.serverURL,
        MIXPANEL_CONFIG.optOutTrackingDefault,
        {
          data_source: 'FastTV-React',
          platform: Platform.OS,
        }
      );

      // Initialize the instance
      await this.mixpanel.init();

      this.isInitialized = true;
      console.log('✅ Mixpanel initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Mixpanel:', error);
      this.isInitialized = false;
    }
  }

  // Check if Mixpanel is available
  isAvailable() {
    return this.isEnabled && this.isInitialized && this.mixpanel !== null;
  }

  // Identify user
  async identify(userId) {
    if (!this.isAvailable()) {
      console.log('Mixpanel not available for identify');
      return;
    }

    try {
      this.userId = userId;
      // Before login (anonymous)
// const anonId =  this.mixpanel.getDistinctId();

// // Only do alias if this is the first time you're connecting anon -> user
//  this.mixpanel.alias(userId, anonId);

// Identify user going forward
await this.mixpanel.identify(userId);
      console.log('✅ Mixpanel user identified:', userId);
    } catch (error) {
      console.error('❌ Error identifying user in Mixpanel:', error);
    }
  }

  // Reset user (on logout)
  async reset() {
    if (!this.isAvailable()) {
      return;
    }

    try {
      this.mixpanel.reset();
      this.userId = null;
      console.log('✅ Mixpanel user reset');
    } catch (error) {
      console.error('❌ Error resetting Mixpanel user:', error);
    }
  }

  // Set user properties
  async setUserProperties(properties) {
    if (!this.isAvailable()) {
      return;
    }

    try {
      this.mixpanel.getPeople().set(properties);
      console.log('✅ Mixpanel user properties set:', properties);
    } catch (error) {
      console.error('❌ Error setting user properties in Mixpanel:', error);
    }
  }

  // Set super properties (properties sent with every event)
  async setSuperProperties(properties) {
    if (!this.isAvailable()) {
      return;
    }

    try {
      this.mixpanel.registerSuperProperties(properties);
      console.log('✅ Mixpanel super properties set:', properties);
    } catch (error) {
      console.error('❌ Error setting super properties in Mixpanel:', error);
    }
  }

  // Track event
  async track(eventName, properties = {}) {
    if (!this.isAvailable()) {
      console.log('Mixpanel not available for event:', eventName);
      return;
    }

    try {
      // Add common properties to all events
      const eventProperties = {
        ...properties,
        platform: Platform.OS,
        timestamp: new Date().toISOString(),
      };

      this.mixpanel.track(eventName, eventProperties);
       console.log('✅ Mixpanel event tracked:', eventName, eventProperties);
    } catch (error) {
      console.error('❌ Error tracking event in Mixpanel:', error);
    }
  }

 // Track start stream
  async trackStartStream(contentId, contentTitle, properties = {}) {
    await this.track('stream_started', {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }
  // Track end stream
  async trackEndStream(contentId, contentTitle, properties = {}) {
    await this.track('stream_finished', {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }
   // Track failed stream
  async trackFailedStream(contentId, contentTitle, properties = {}) {
    await this.track('stream_failed', {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
  }

   // Page_scrolled
  async trackPageScrolled(page_name, properties = {}) {
    await this.track('Page_scrolled', {
      page_name: page_name,
      ...properties,
    });
  }
   // bucket_scrolled
  async trackBucketScrolled(bucket_name, properties = {}) {
    await this.track('bucket_scrolled', {
      bucket_name: bucket_name,
      ...properties,
    });
  }
   // search_query_submitted
  async trackSearchQuerySubmitted(search_query, properties = {}) {
    // Mixpanel requires property values to be string, number, boolean, date, or list; ensure search_query is always a string
    const safeSearchQuery =
      search_query != null && typeof search_query !== 'object'
        ? String(search_query)
        : '';
    await this.track('search_query_submitted', {
      ...properties,
      search_query: safeSearchQuery,
    });
  }
   // search_filter_applied
  async trackSearchFilterApplied(filter_name, properties = {}) {
    await this.track('search_filter_applied', {
      filter_name: filter_name,
      ...properties,
    });
  }
   // login_method_selected
  async trackLoginMethodSelected(login_method, properties = {}) {
    await this.track('login_method_selected', {
      login_method: login_method,
      ...properties,
    });
  }
     // login_successful
  async trackLoginSuccessful(auth_method, properties = {}) {
    await this.track('login_successful', {
      auth_method: auth_method,
      ...properties,
    });
  }
     // login_failed
  async trackLoginFailed(auth_method, properties = {}) {
    await this.track('login_failed', {
      auth_method: auth_method,
      ...properties,
    });
  }
     // subscription_button_clicked
  async trackSubscriptionButtonClicked(content_id, properties = {}) {
    await this.track('subscription_button_clicked', {
      content_id: content_id,
      ...properties,
    });
  }

  /** Cancellation reason before POST /hungama/subscription/cancel (Mixpanel spec). */
  async trackSubscriptionCancelFeedback(properties = {}) {
    await this.track('subscription_cancel_feedback', {
      ...properties,
    });
  }
     // watch_action_clicked
  async trackWatchActionClicked(content_id, properties = {}) {
    await this.track('watch_action_clicked', {
      content_id: content_id ,
      ...properties,
    });
  }
     // trailer_watched
  async trackTrailerWatched(content_id, properties = {}) {
    await this.track('trailer_watched', {
      content_id: content_id,
      ...properties,
    });
  }
     // artwork_clicked
  async trackArtworkClicked(content_id, properties = {}) {
    await this.track('artwork_clicked', {
      content_id: content_id != null ? String(content_id) : '',
      ...properties,
    });
  }

     // hero_banner_clicked
  async trackHeroBannerClicked(page_name, properties = {}) {
    await this.track('hero_banner_clicked', {
      page_name: page_name,
      banner_id: properties.banner_id,
      ...properties,
      is_logged_in: properties.is_logged_in === true,
    });
  }
     // hero_banner_viewed
  async trackHeroBannerViewed(page_name, properties = {}) {
    const contentGenre = properties?.content_genre;
    const safeContentGenre = (contentGenre != null && String(contentGenre).trim() !== '')
      ? String(contentGenre).trim()
      : 'Uncategorized';
    await this.track('hero_banner_viewed', {
      page_name: page_name ?? null,
      auto_swiped_enabled: properties?.auto_swiped_enabled ?? (properties?.hero_card_swiped === 'auto'),
      ...properties,
      content_genre: safeContentGenre,
      is_logged_in: properties.is_logged_in === true,
    });
  }
     // page_view
  async trackPageView(page_name, properties = {}) {
    await this.track('page_view', {
      page_name: page_name,
      ...properties,
    });
  }
     // app_open
  async trackAppOpen(properties) {
    await this.track('app_open', {
      ...properties,
    });
  }
  // Get Mixpanel instance
  getMixpanel() {
    return this.mixpanel;
  }
}

// Create and export a singleton instance
const mixpanelAnalyticsService = new MixpanelAnalyticsService();

export default mixpanelAnalyticsService;
