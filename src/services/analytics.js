import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firebaseAnalyticsService from './firebaseAnalytics';
import moengageAnalyticsService from './moengageAnalytics';

// Defer loading these until first use (e.g. in initialize()) so native bridge is ready.
// Prevents "Cannot read property 'NativeModule' of undefined" on Hermes at bundle load.
let _mixpanelAnalyticsService = null;
let _appsflyerAnalyticsService = null;
let _notificationService = null;

function getMixpanelService() {
  if (!_mixpanelAnalyticsService) _mixpanelAnalyticsService = require('./mixpanelAnalytics').default;
  return _mixpanelAnalyticsService;
}
function getAppsflyerService() {
  if (!_appsflyerAnalyticsService) _appsflyerAnalyticsService = require('./appsflyerAnalytics').default;
  return _appsflyerAnalyticsService;
}
function getNotificationService() {
  if (!_notificationService) _notificationService = require('./notificationService').default;
  return _notificationService;
}

function getCrashlyticsService() {
  try {
    return require('./crashlytics').default;
  } catch (_) {
    return null;
  }
}

// Analytics service for Google Analytics with Firebase
class AnalyticsService {
  constructor() {
    this.isEnabled = Platform.OS !== 'web';
    this.userId = null;
    this.sessionId = this.generateSessionId();
    this.events = [];
    this.batchSize = 10; // Send events in batches
    this.apiEndpoint = 'https://your-analytics-api.com/events'; // Replace with your API endpoint
  }

  // Generate a unique session ID
  generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Initialize analytics
  async initialize() {
    if (!this.isEnabled) {
      console.log('Analytics not available on web platform');
      return;
    }

    try {
      // Initialize Firebase Analytics
      await firebaseAnalyticsService.initialize();

      // Initialize Mixpanel Analytics
      await getMixpanelService().initialize();

      // Initialize MoEngage Analytics
      await moengageAnalyticsService.initialize();

      // Pass FCM token to MoEngage so push icon is green (token may have been obtained before MoEngage init)
      try {
        const storedToken = await getNotificationService().getStoredToken();
        if (storedToken) {
          await moengageAnalyticsService.passPushToken(storedToken);
          console.log('[MoEngage] FCM token passed on analytics init (from stored)');
        } else {
          await getNotificationService().getFCMToken();
        }
      } catch (e) {
        console.warn('[MoEngage] Failed to pass FCM token on init:', e?.message);
      }

      // Initialize AppsFlyer Analytics
      await getAppsflyerService().initialize();

      // Load stored events from AsyncStorage
      await this.loadStoredEvents();
      

      
      // Log app open event
      await this.logAppOpen();
      
      console.log('Analytics initialized successfully');
    } catch (error) {
      console.error('Error initializing analytics:', error);
    }
  }

  // Load stored events from AsyncStorage
  async loadStoredEvents() {
    try {
      const storedEvents = await AsyncStorage.getItem('analytics_events');
      if (storedEvents) {
        this.events = JSON.parse(storedEvents);
      }
    } catch (error) {
      console.error('Error loading stored events:', error);
    }
  }

  // Save events to AsyncStorage
  async saveEvents() {
    try {
      await AsyncStorage.setItem('analytics_events', JSON.stringify(this.events));
    } catch (error) {
      console.error('Error saving events:', error);
    }
  }

  // Send events to server
  async sendEventsToServer(events) {
    try {
      // For now, we'll just log to console
      // In production, you would send to your analytics API
      console.log('Sending events to server:', events);
      
      // Example API call (uncomment when you have an API endpoint):
      /*
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: events,
          user_id: this.userId,
          session_id: this.sessionId,
          platform: Platform.OS,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send events');
      }
      */
      
    } catch (error) {
      console.error('Error sending events to server:', error);
    }
  }

  // Set user ID
  async setUserId(userId) {
    if (!this.isEnabled) return;

    try {
      this.userId = userId;
      await AsyncStorage.setItem('analytics_user_id', userId);
      
      // Set Firebase Analytics user ID
      await firebaseAnalyticsService.setUserId(userId);
      
      // Set Mixpanel user ID
      await getMixpanelService().identify(userId);
      
      // Set MoEngage user ID
      await moengageAnalyticsService.identify(userId);
      
      // Set AppsFlyer user ID
      await getAppsflyerService().setUserId(userId);

      // Crashlytics: attach user id to crash / non-fatal reports (Firebase console)
      getCrashlyticsService()?.setUserId(userId);
      
      console.log('User ID set:', userId);
    } catch (error) {
      console.error('Error setting user ID:', error);
    }
  }

  // Set user properties
  async setUserProperties(properties) {
    if (!this.isEnabled) return;

    try {
      await AsyncStorage.setItem('analytics_user_properties', JSON.stringify(properties));
      
      // Set Firebase Analytics user properties
     // await firebaseAnalyticsService.setUserProperties(properties);
      
      // Set Mixpanel user properties
      await getMixpanelService().setUserProperties(properties);
      
      // Set MoEngage user properties
      await moengageAnalyticsService.setUserAttributes(properties);
      
      // Set AppsFlyer user properties
      await getAppsflyerService().setUserAttributes(properties);
      
      console.log('User properties set:', properties);
    } catch (error) {
      console.error('Error setting user properties:', error);
    }
  }

  // Log custom events
  async logEvent(eventName, parameters = {}) {
    if (!this.isEnabled) return;

    try {
      const eventData = {
        event_name: eventName,
        parameters: parameters,
        user_id: this.userId,
        session_id: this.sessionId,
        timestamp: new Date().toISOString(),
        platform: Platform.OS,
        app_version: '1.0.0',
      };

      // Add to events array
      this.events.push(eventData);

      // Save to AsyncStorage
      await this.saveEvents();

      // Send to Firebase Analytics
      await firebaseAnalyticsService.logEvent(eventName, parameters);

      // Send to server if batch size is reached
      if (this.events.length >= this.batchSize) {
        await this.sendEventsToServer([...this.events]);
        this.events = [];
        await this.saveEvents();
      }

      console.log('Event logged:', eventName, parameters);
    } catch (error) {
      console.error('Error logging event:', error);
    }
  }

  // Log screen views
  async logScreenView(screenName, previous_page, page_category) {
    // Ensure page_category is never empty (Mixpanel shows empty string as page_Category)
    const resolvedCategory =
      page_category != null && String(page_category).trim() !== ''
        ? page_category
        : (screenName && String(screenName).trim() !== '' ? screenName : 'app');
    
    // Provide fallback for previous_page if empty
    const resolvedPreviousPage = 
      previous_page != null && String(previous_page).trim() !== ''
        ? previous_page
        : 'App Open Splash';

    const properties = {
      page_name: screenName,
      previous_page: resolvedPreviousPage,
      page_category: resolvedCategory,
    };

    // Send to Firebase Analytics
    await firebaseAnalyticsService.logScreenView(screenName, properties);
    
    // Send to Mixpanel Analytics
    await getMixpanelService().trackPageView(screenName, properties);
    
    // Send to MoEngage Analytics
    await moengageAnalyticsService.trackPageView(screenName, {
      previous_page: resolvedPreviousPage,
      page_category : resolvedCategory
    });
    
    // Send to AppsFlyer Analytics
    await getAppsflyerService().trackPageView(screenName, {
      previous_page: resolvedPreviousPage,
      page_category : resolvedCategory
    });
    
    // Also log as custom event for local storage
    await this.logEvent('page_view', {
      screen_name: screenName,
      previous_page: resolvedPreviousPage,
      page_category: resolvedCategory
    });
  }

  // Predefined events for your app
  async logUserLogin(method) {
    await this.logEvent('user_login', {
      method: method, // 'google', 'phone', 'guest'
    });
    try {
      if (typeof getMixpanelService().trackUserLogin === 'function') {
        await getMixpanelService().trackUserLogin(method);
      }
      if (typeof moengageAnalyticsService.trackUserLogin === 'function') {
        await moengageAnalyticsService.trackUserLogin(method);
      }
      if (typeof getAppsflyerService().trackUserLogin === 'function') {
        await getAppsflyerService().trackUserLogin(method);
      }
    } catch (e) {
      console.warn('Analytics logUserLogin downstream:', e?.message || e);
    }
  }

  async logUserSignUp(method) {
    await this.logEvent('user_sign_up', {
      method: method,
    });
    try {
      if (typeof getMixpanelService().trackUserSignUp === 'function') {
        await getMixpanelService().trackUserSignUp(method);
      }
      if (typeof moengageAnalyticsService.trackUserSignUp === 'function') {
        await moengageAnalyticsService.trackUserSignUp(method);
      }
      if (typeof getAppsflyerService().trackUserSignUp === 'function') {
        await getAppsflyerService().trackUserSignUp(method);
      }
    } catch (e) {
      console.warn('Analytics logUserSignUp downstream:', e?.message || e);
    }
  }

  async logVideoPlay(videoId, videoTitle, category) {
    await this.logEvent('video_play', {
      video_id: videoId,
      video_title: videoTitle,
      category: category,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackVideoPlay(videoId, videoTitle, category);
    // Also track in AppsFlyer
    await getAppsflyerService().trackVideoPlay(videoId, videoTitle, category);
  }

  async logVideoComplete(videoId, videoTitle, duration) {
    await this.logEvent('video_complete', {
      video_id: videoId,
      video_title: videoTitle,
      duration: duration,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackVideoComplete(videoId, videoTitle, duration);
    // Also track in AppsFlyer
    await getAppsflyerService().trackVideoComplete(videoId, videoTitle, duration);
  }

  async logEpisodeWatch(seriesId, episodeId, episodeTitle) {
    await this.logEvent('episode_watch', {
      series_id: seriesId,
      episode_id: episodeId,
      episode_title: episodeTitle,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackEpisodeWatch(seriesId, episodeId, episodeTitle);
    // Also track in AppsFlyer
    await getAppsflyerService().trackEpisodeWatch(seriesId, episodeId, episodeTitle);
  }

  async logSearch(searchTerm, resultsCount) {
    await this.logEvent('search', {
      search_term: searchTerm,
      results_count: resultsCount,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSearch(searchTerm, resultsCount);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSearch(searchTerm, resultsCount);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSearch(searchTerm, resultsCount);
  }

  async logAddToMyList(contentId, contentType) {
    await this.logEvent('add_to_my_list', {
      content_id: contentId,
      content_type: contentType, // 'series', 'episode'
    });
    // Also track in Mixpanel
    await getMixpanelService().trackAddToMyList(contentId, contentType);
    // Also track in MoEngage
    await moengageAnalyticsService.trackAddToMyList(contentId, contentType);
    // Also track in AppsFlyer
    await getAppsflyerService().trackAddToMyList(contentId, contentType);
  }

  async logRemoveFromMyList(contentId, contentType) {
    await this.logEvent('remove_from_my_list', {
      content_id: contentId,
      content_type: contentType,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackRemoveFromMyList(contentId, contentType);
    // Also track in MoEngage
    await moengageAnalyticsService.trackRemoveFromMyList(contentId, contentType);
    // Also track in AppsFlyer
    await getAppsflyerService().trackRemoveFromMyList(contentId, contentType);
  }

  async logShare(contentId, contentType, shareMethod) {
    await this.logEvent('share', {
      content_id: contentId,
      content_type: contentType,
      share_method: shareMethod, // 'native', 'social'
    });
    // Also track in Mixpanel
    await getMixpanelService().trackShare(contentId, contentType, shareMethod);
    // Also track in MoEngage
    await moengageAnalyticsService.trackShare(contentId, contentType, shareMethod);
    // Also track in AppsFlyer
    await getAppsflyerService().trackShare(contentId, contentType, shareMethod);
  }

  async logSubscriptionOffer(offerType, price) {
    await this.logEvent('subscription_offer', {
      offer_type: offerType,
      price: price,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSubscriptionOffer(offerType, price);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSubscriptionOffer(offerType, price);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSubscriptionOffer(offerType, price);
  }

  async logSubscriptionPurchase(planType, price, currency) {
    await this.logEvent('subscription_purchase', {
      plan_type: planType,
      price: price,
      currency: currency,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSubscriptionPurchase(planType, price, currency);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSubscriptionPurchase(planType, price, currency);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSubscriptionPurchase(planType, price, currency);
  }

  /** Fired when user submits cancellation reason (before cancel API). Per product spec: Mixpanel subscription_cancel_feedback. */
  async logSubscriptionCancelFeedback(properties = {}) {
    await this.logEvent('subscription_cancel_feedback', properties);
    await getMixpanelService().trackSubscriptionCancelFeedback(properties);
  }

  async logError(errorType, errorMessage, screenName) {
    await this.logEvent('app_error', {
      error_type: errorType,
      error_message: errorMessage,
      screen_name: screenName,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackError(errorType, errorMessage, screenName);
    // Also track in MoEngage
    await moengageAnalyticsService.trackError(errorType, errorMessage, screenName);
    // Also track in AppsFlyer
    await getAppsflyerService().trackError(errorType, errorMessage, screenName);
  }

  // Performance monitoring
  async logPerformanceMetric(metricName, value) {
    await this.logEvent('performance_metric', {
      metric_name: metricName,
      value: value,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackPerformanceMetric(metricName, value);
    // Also track in MoEngage
    await moengageAnalyticsService.trackPerformanceMetric(metricName, value);
    // Also track in AppsFlyer
    await getAppsflyerService().trackPerformanceMetric(metricName, value);
  }

  // App lifecycle events
  async logAppOpen() {
    try {
      const now = Date.now();
      const LAST_OPEN_KEY = 'analytics_last_app_open';
      const FIRST_OPEN_KEY = 'analytics_first_open_recorded';

      // Get last open time (if any)
      const lastOpenRaw = await AsyncStorage.getItem(LAST_OPEN_KEY);
      const firstOpenFlagRaw = await AsyncStorage.getItem(FIRST_OPEN_KEY);

      let time_since_last_open = 0; // seconds; 0 for first open or when unknown
      let is_first_open = false;

      if (lastOpenRaw) {
        const lastOpenTs = parseInt(lastOpenRaw, 10);
        if (!Number.isNaN(lastOpenTs) && lastOpenTs > 0) {
          time_since_last_open = Math.max(0, Math.round((now - lastOpenTs) / 1000)); // seconds
        }
      } else {
        // No last open stored means this is the first open on this device
        is_first_open = true;
      }

      // If we have an explicit first-open flag, respect it
      if (firstOpenFlagRaw === 'true') {
        is_first_open = false;
      }

      // App locale: device language/locale (e.g. en-US, hi-IN)
      let app_locale = 'en';
      try {
        const Localization = require('expo-localization');
        const locales = Localization.getLocales?.();
        if (locales?.[0]) {
          const l = locales[0];
          app_locale = [l.languageCode, l.regionCode].filter(Boolean).join('-') || app_locale;
        }
      } catch (_) {
        app_locale =
          (typeof navigator !== 'undefined' && navigator.language) ||
          (typeof Intl !== 'undefined' && Intl.DateTimeFormat?.().resolvedOptions?.().locale) ||
          'en';
      }

      // Campaign from AppsFlyer (Organic or campaign name)
      const campaign = getAppsflyerService().getCampaign?.() ?? 'Organic';
      console.log('campaign', campaign)
      const properties = {
        time_since_last_open,
        is_first_open,
        app_locale,
        campaign,
      };
      await this.logEvent('app_open', properties);
      await getMixpanelService().trackAppOpen(properties);
      await moengageAnalyticsService.trackAppOpen(properties);
      await getAppsflyerService().trackAppOpen(properties);

      await AsyncStorage.setItem(LAST_OPEN_KEY, String(now));
      if (!firstOpenFlagRaw) {
        await AsyncStorage.setItem(FIRST_OPEN_KEY, 'true');
      }
    } catch (error) {
      console.error('Error logging app open:', error);
    }
  }

  async logAppBackground() {
    // await this.logEvent('app_background');
    // Also track in Mixpanel
    await getMixpanelService().trackAppBackground();
    // Also track in MoEngage
    await moengageAnalyticsService.trackAppBackground();
    // Also track in AppsFlyer
    await getAppsflyerService().trackAppBackground();
  }

  async logAppForeground() {
    // await this.logEvent('app_foreground');
    // Also track in Mixpanel
    await getMixpanelService().trackAppForeground();
    // Also track in MoEngage
    await moengageAnalyticsService.trackAppForeground();
    // Also track in AppsFlyer
    await getAppsflyerService().trackAppForeground();
  }

  // Content engagement
  async logContentImpression(contentId, contentType, position) {
    await this.logEvent('content_impression', {
      content_id: contentId,
      content_type: contentType,
      position: position,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackContentImpression(contentId, contentType, position);
    // Also track in MoEngage
    await moengageAnalyticsService.trackContentImpression(contentId, contentType, position);
    // Also track in AppsFlyer
    await getAppsflyerService().trackContentImpression(contentId, contentType, position);
  }

  async logContentClick(contentId, contentType, position) {
    await this.logEvent('content_click', {
      content_id: contentId,
      content_type: contentType,
      position: position,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackContentClick(contentId, contentType, position);
    // Also track in MoEngage
    await moengageAnalyticsService.trackContentClick(contentId, contentType, position);
    // Also track in AppsFlyer
    await getAppsflyerService().trackContentClick(contentId, contentType, position);
  }

  // Navigation events
  async logNavigation(fromScreen, toScreen) {
    await this.logEvent('navigation', {
      from_screen: fromScreen,
      to_screen: toScreen,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackNavigation(fromScreen, toScreen);
    // Also track in MoEngage
    await moengageAnalyticsService.trackNavigation(fromScreen, toScreen);
    // Also track in AppsFlyer
    await getAppsflyerService().trackNavigation(fromScreen, toScreen);
  }

  // Settings events
  async logSettingChange(settingName, oldValue, newValue) {
    await this.logEvent('setting_change', {
      setting_name: settingName,
      old_value: oldValue,
      new_value: newValue,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSettingChange(settingName, oldValue, newValue);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSettingChange(settingName, oldValue, newValue);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSettingChange(settingName, oldValue, newValue);
  }

  // Like/Unlike events
  async logLikeVideo(videoId, videoTitle, properties = {}) {
    await this.logEvent('like_video', {
      video_id: videoId,
      video_title: videoTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackLikeVideo(videoId, videoTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackLikeVideo(videoId, videoTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackLikeVideo(videoId, videoTitle, properties);
  }
 
  async logUnlikeVideo(videoId, videoTitle, properties = {}) {
    await this.logEvent('unlike_video', {
      video_id: videoId,
      video_title: videoTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackUnlikeVideo(videoId, videoTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackUnlikeVideo(videoId, videoTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackUnlikeVideo(videoId, videoTitle, properties);
  }

  // Video control events
  async logVideoPause(videoId, videoTitle, properties = {}) {
    await this.logEvent('video_pause', {
      video_id: videoId,
      video_title: videoTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackVideoPause(videoId, videoTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackVideoPause(videoId, videoTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackVideoPause(videoId, videoTitle, properties);
  }

  async logVideoSeek(videoId, fromPosition, toPosition, properties = {}) {
    await this.logEvent('video_seek', {
      video_id: videoId,
      from_position: fromPosition,
      to_position: toPosition,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackVideoSeek(videoId, fromPosition, toPosition, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackVideoSeek(videoId, fromPosition, toPosition, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackVideoSeek(videoId, fromPosition, toPosition, properties);
  }

  // Carousel events
  async logCarouselItemClick(itemId, itemTitle, position, properties = {}) {
    await this.logEvent('carousel_item_click', {
      item_id: itemId,
      item_title: itemTitle,
      position: position,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackCarouselItemClick(itemId, itemTitle, position, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackCarouselItemClick(itemId, itemTitle, position, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackCarouselItemClick(itemId, itemTitle, position, properties);
  }

  // Series/Episode events
  async logSeriesDetailView(seriesId, seriesTitle, properties = {}) {
    await this.logEvent('series_detail_view', {
      series_id: seriesId,
      series_title: seriesTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSeriesDetailView(seriesId, seriesTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSeriesDetailView(seriesId, seriesTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSeriesDetailView(seriesId, seriesTitle, properties);
  }

  async logEpisodeListView(seriesId, seriesTitle, properties = {}) {
    await this.logEvent('episode_list_view', {
      series_id: seriesId,
      series_title: seriesTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackEpisodeListView(seriesId, seriesTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackEpisodeListView(seriesId, seriesTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackEpisodeListView(seriesId, seriesTitle, properties);
  }

  // Get stored events (for debugging)
  getStoredEvents() {
    return this.events;
  }

  // Clear stored events
  async clearStoredEvents() {
    this.events = [];
    await AsyncStorage.removeItem('analytics_events');
  }

  // Force send all pending events
  async flushEvents() {
    if (this.events.length > 0) {
      await this.sendEventsToServer([...this.events]);
      this.events = [];
      await this.saveEvents();
    }
  }

  // Get Firebase Analytics instance
  getFirebaseAnalytics() {
    return firebaseAnalyticsService.getAnalytics();
  }

  // Get Mixpanel instance
  getMixpanel() {
    return getMixpanelService().getMixpanel();
  }

  // Reset Mixpanel (on logout)
  async resetMixpanel() {
    await getMixpanelService().reset();
  }

  // Get MoEngage instance
  getMoEngage() {
    return moengageAnalyticsService.getMoEngage();
  }

  // Reset MoEngage (on logout)
  async resetMoEngage() {
    await moengageAnalyticsService.reset();
  }

  // Get AppsFlyer instance
  getAppsFlyer() {
    return getAppsflyerService().getAppsFlyer();
  }

  // Reset all analytics (on logout)
  async resetAll() {
    await this.resetMixpanel();
    await this.resetMoEngage();
    // AppsFlyer doesn't have a reset method, but we can clear user ID
    this.userId = null;
    // Clear Crashlytics user identifier so the next session isn’t attributed to the old user
    getCrashlyticsService()?.setUserId('');
  }
   // Start Stream events
  async logStartStream(contentId, contentTitle, properties) {
    await this.logEvent('stream_started',  {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackStartStream(contentId, contentTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackStartStream(contentId, contentTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackStartStream(contentId, contentTitle, properties);
  }

     // End Stream events
  async logEndStream(contentId, contentTitle, properties) {
    await this.logEvent('stream_finished',  {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackEndStream(contentId, contentTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackEndStream(contentId, contentTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackEndStream(contentId, contentTitle, properties);
  }
       // End Stream events
  async logFailedStream(contentId, contentTitle, properties) {
    await this.logEvent('stream_failed',  {
      content_id: contentId,
      content_title: contentTitle,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackFailedStream(contentId, contentTitle, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackFailedStream(contentId, contentTitle, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackFailedStream(contentId, contentTitle, properties);
  }
  async logLoginMethodSelected(login_method, properties) {
    await this.logEvent('login_method_selected',  {
     login_method: login_method,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackLoginMethodSelected(login_method, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackLoginMethodSelected(login_method, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackLoginMethodSelected(login_method, properties);
  }
  async logLoginSuccessful(auth_method, properties) {
    await this.logEvent('login_successful',  {
     auth_method: auth_method,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackLoginSuccessful(auth_method, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackLoginSuccessful(auth_method, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackLoginSuccessful(auth_method, properties);
  }
 async logLoginFailed(auth_method, properties) {
    await this.logEvent('login_failed',  {
     auth_method: auth_method,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackLoginFailed(auth_method, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackLoginFailed(auth_method, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackLoginFailed(auth_method, properties);
  }
   async logSubscriptionButtonClicked(content_id, properties) {
    await this.logEvent('subscription_button_clicked',  {
     content_id: content_id,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSubscriptionButtonClicked(content_id, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSubscriptionButtonClicked(content_id, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSubscriptionButtonClicked(content_id, properties);
  }
   async logWatchActionClicked(content_id, properties) {
    await this.logEvent('watch_action_clicked',  {
     content_id: content_id,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackWatchActionClicked(content_id, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackWatchActionClicked(content_id, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackWatchActionClicked(content_id, properties);
  }
   async logSearchQuerySubmitted(search_query, properties) {
    await this.logEvent('search_query_submitted',  {
     search_query: search_query,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSearchQuerySubmitted(search_query, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSearchQuerySubmitted(search_query, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSearchQuerySubmitted(search_query, properties);
  }
  async logSearchFilterApplied(filter_name, properties) {
    await this.logEvent('search_filter_applied',  {
     filter_name: filter_name,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackSearchFilterApplied(filter_name, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackSearchFilterApplied(filter_name, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackSearchFilterApplied(filter_name, properties);
  }
  async logBucketScrolled(bucket_name, properties) {
    await this.logEvent('bucket_scrolled',  {
     bucket_name: bucket_name,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackBucketScrolled(bucket_name, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackBucketScrolled(bucket_name, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackBucketScrolled(bucket_name, properties);
  }
    async logPageScrolled(page_name, properties) {
    const props = properties && typeof properties === 'object' ? properties : {};
    await this.logEvent('Page_scrolled',  {
     page_name: page_name,
      ...props,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackPageScrolled(page_name, props);
    // Also track in MoEngage
    await moengageAnalyticsService.trackPageScrolled(page_name, props);
    // Also track in AppsFlyer
    await getAppsflyerService().trackPageScrolled(page_name, props);
  }
   async logHeroBannerClicked(page_name, properties) {
    await this.logEvent('hero_banner_clicked',  {
     page_name: page_name,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackHeroBannerClicked(page_name, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackHeroBannerClicked(page_name, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackHeroBannerClicked(page_name, properties);
  }
   async logHeroBannerViewed(page_name, properties) {
    await this.logEvent('hero_banner_viewed',  {
     page_name: page_name,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackHeroBannerViewed(page_name, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackHeroBannerViewed(page_name, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackHeroBannerViewed(page_name, properties);
  }
  async logArtworkClicked(content_id, properties) {
    await this.logEvent('artwork_clicked',  {
     content_id: content_id,
      ...properties,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackArtworkClicked(content_id, properties);
    // Also track in MoEngage
    await moengageAnalyticsService.trackArtworkClicked(content_id, properties);
    // Also track in AppsFlyer
    await getAppsflyerService().trackArtworkClicked(content_id, properties);
  }
  async logTrailerWatched(content_id, properties) {
    const props = properties && typeof properties === 'object' ? properties : {};
    await this.logEvent('trailer_watched',  {
     content_id: content_id,
      ...props,
    });
    // Also track in Mixpanel
    await getMixpanelService().trackTrailerWatched(content_id, props);
    // Also track in MoEngage
    await moengageAnalyticsService.trackTrailerWatched(content_id, props);
    // Also track in AppsFlyer
    await getAppsflyerService().trackTrailerWatched(content_id, props);
  }
}


// Create and export a singleton instance
const analyticsService = new AnalyticsService();

export default analyticsService; 