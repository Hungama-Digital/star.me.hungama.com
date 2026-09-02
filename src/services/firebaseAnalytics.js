import { Platform } from 'react-native';

// Firebase Analytics Service
class FirebaseAnalyticsService {
  constructor() {
    this.isEnabled = Platform.OS !== 'web';
    this.analytics = null;
    this.isInitialized = false;
    this.app = null;
  }

  // Initialize Firebase Analytics
  async initialize() {
    if (!this.isEnabled) {
      console.log('Firebase Analytics not available on web platform');
      return;
    }

    try {
      // Import Firebase app and analytics modules
      const { getApp } = await import('@react-native-firebase/app');
      const { getAnalytics, setAnalyticsCollectionEnabled } = await import('@react-native-firebase/analytics');
      
      // Get the Firebase app instance
      this.app = getApp();
      
      // Get analytics instance using modular API
      this.analytics = getAnalytics(this.app);
      
      // Enable analytics collection
      await setAnalyticsCollectionEnabled(this.analytics, true);
      this.isInitialized = true;
      
      console.log('Firebase Analytics initialized successfully');
      return true;
    } catch (error) {
      console.log('Firebase Analytics not available:', error.message);
      return false;
    }
  }

  // Log event to Firebase Analytics
  async logEvent(eventName, parameters = {}) {
    if (!this.isEnabled || !this.isInitialized || !this.analytics) {
      console.log('Firebase Analytics not available for event:', eventName);
      return false;
    }

    try {
      const { logEvent } = await import('@react-native-firebase/analytics');
      await logEvent(this.analytics, eventName, parameters);
      console.log('✅ Event sent to Firebase Analytics:', eventName, parameters);
      return true;
    } catch (error) {
      console.error('❌ Error sending event to Firebase Analytics:', error);
      return false;
    }
  }

  // Log screen view to Firebase Analytics
  async logScreenView(screenName, screenClass) {
    if (!this.isEnabled || !this.isInitialized || !this.analytics) {
      console.log('Firebase Analytics not available for screen view:', screenName);
      return false;
    }

    try {
      const { logEvent } = await import('@react-native-firebase/analytics');
      await logEvent(this.analytics, 'page_view', {
        screen_name: screenName,
        screen_class: screenClass,
      });
      console.log('✅ Screen view sent to Firebase Analytics:', screenName);
      return true;
    } catch (error) {
      console.error('❌ Error sending screen view to Firebase Analytics:', error);
      return false;
    }
  }

  // Set user ID in Firebase Analytics
  async setUserId(userId) {
    if (!this.isEnabled || !this.isInitialized || !this.analytics) {
      console.log('Firebase Analytics not available for setting user ID');
      return false;
    }

    try {
      const { setUserId } = await import('@react-native-firebase/analytics');
      await setUserId(this.analytics, userId);
      console.log('✅ User ID set in Firebase Analytics:', userId);
      return true;
    } catch (error) {
      console.error('❌ Error setting user ID in Firebase Analytics:', error);
      return false;
    }
  }

  // Set user property in Firebase Analytics
  async setUserProperty(name, value) {
    if (!this.isEnabled || !this.isInitialized || !this.analytics) {
      console.log('Firebase Analytics not available for setting user property');
      return false;
    }

    try {
      const { setUserProperty } = await import('@react-native-firebase/analytics');
      await setUserProperty(this.analytics, name, value);
      console.log('✅ User property set in Firebase Analytics:', name, value);
      return true;
    } catch (error) {
      console.error('❌ Error setting user property in Firebase Analytics:', error);
      return false;
    }
  }

  // Set multiple user properties
  async setUserProperties(properties) {
    if (!this.isEnabled || !this.isInitialized || !this.analytics) {
      console.log('Firebase Analytics not available for setting user properties');
      return false;
    }

    try {
      const { setUserProperty } = await import('@react-native-firebase/analytics');
      for (const [name, value] of Object.entries(properties)) {
        await setUserProperty(this.analytics, name, value);
      }
      console.log('✅ User properties set in Firebase Analytics:', properties);
      return true;
    } catch (error) {
      console.error('❌ Error setting user properties in Firebase Analytics:', error);
      return false;
    }
  }

  // Check if Firebase Analytics is available
  isAvailable() {
    return this.isEnabled && this.isInitialized && this.analytics !== null;
  }

  // Get analytics instance
  getAnalytics() {
    return this.analytics;
  }
}

// Create and export singleton instance
const firebaseAnalyticsService = new FirebaseAnalyticsService();

export default firebaseAnalyticsService; 