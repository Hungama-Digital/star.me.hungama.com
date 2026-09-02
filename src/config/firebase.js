import { Platform } from 'react-native';

// Silence "deprecated, use getApp() instead" until all Firebase packages use modular API
if (typeof globalThis !== 'undefined') {
  globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;
}

// Lazy-loaded refs to avoid touching native modules at bundle load (prevents
// "Cannot read property 'NativeModule' of undefined" on Hermes when bridge isn't ready)
let firebaseAppModule = null;
let messagingModule = null;

function getFirebaseAppModule() {
  if (Platform.OS === 'web') return null;
  if (firebaseAppModule) return firebaseAppModule;
  try {
    firebaseAppModule = require('@react-native-firebase/app');
    return firebaseAppModule;
  } catch (e) {
    return null;
  }
}

function getMessagingModule() {
  if (Platform.OS === 'web') return null;
  if (messagingModule) return messagingModule;
  try {
    messagingModule = require('@react-native-firebase/messaging').default;
    return messagingModule;
  } catch (e) {
    return null;
  }
}

let firebaseApp = null;
let firebaseInitFailureLogged = false;

export const initializeFirebase = () => {
  if (Platform.OS === 'web') return null;
  if (firebaseApp) return firebaseApp;

  try {
    const appMod = getFirebaseAppModule();
    if (!appMod) return null;
    const { getApps, getApp } = appMod;
    const apps = getApps();
    if (apps.length > 0) {
      firebaseApp = getApp();
      return firebaseApp;
    }
  } catch (error) {
    if (!firebaseInitFailureLogged) {
      firebaseInitFailureLogged = true;
      console.warn('Firebase: Init failed:', error?.message);
    }
    return null;
  }

  if (!firebaseInitFailureLogged) {
    firebaseInitFailureLogged = true;
    if (Platform.OS === 'android') {
      console.warn(
        'Firebase: No native app registered. Ensure Android applies the Google Services plugin.'
      );
    } else {
      console.warn(
        'Firebase: No native app registered. Ensure GoogleService-Info.plist is in the iOS project and the app was rebuilt.'
      );
    }
  }
  return null;
};

/**
 * Call once after app mount (e.g. from App.js useEffect) to register FCM background
 * handler. This registers the same handler as before—when the app is in background
 * or killed, FCM still invokes this handler for data messages. Deferring to after
 * mount only avoids loading Firebase native modules at bundle load time (fixes
 * NativeModule crash); it does not change background push behavior.
 */
export const registerFirebaseBackgroundHandler = () => {
  if (Platform.OS === 'web') return;
  try {
    const app = initializeFirebase();
    if (!app) return;
    const messaging = getMessagingModule();
    if (!messaging) return;
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      try {
        await showNotificationFromRemoteMessage(remoteMessage);
      } catch (e) {
        console.warn('[FCM] Background handler error:', e?.message);
      }
    });
  } catch (e) {
    console.warn('[FCM] setBackgroundMessageHandler registration failed:', e?.message);
  }
};

// Check if Firebase is ready/initialized
export const isFirebaseReady = () => {
  if (Platform.OS === 'web') return false;
  return firebaseApp !== null;
};

// Request permission for notifications (only for mobile)
export const requestUserPermission = async () => {
  if (Platform.OS === 'web') {
    console.log('Firebase messaging not available on web');
    return false;
  }

  try {
    const app = initializeFirebase();
    if (!app) {
      console.error('Firebase not initialized, cannot request messaging permission');
      return false;
    }
    const messaging = getMessagingModule();
    if (!messaging) return false;

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    console.log('Authorization status:', authStatus);
    console.log('Permission granted:', enabled);
    return enabled;
  } catch (error) {
    console.error('Error requesting permission:', error);
    return false;
  }
};

export const getFCMToken = async () => {
  if (Platform.OS === 'web') {
    console.log('[FCM] Not available on web');
    return null;
  }

  try {
    const app = initializeFirebase();
    if (!app) {
      console.error('[FCM] Firebase not initialized, cannot get token');
      return null;
    }
    const messaging = getMessagingModule();
    if (!messaging) return null;

    console.log('[FCM] messaging().getToken() calling...');
    const fcmToken = await messaging().getToken();
    if (fcmToken) {
      console.log('[FCM] getToken() success, length:', fcmToken.length);
      return fcmToken;
    }
    console.log('[FCM] getToken() returned empty');
    return null;
  } catch (error) {
    console.error('[FCM] getToken() error:', error?.message || error);
    return null;
  }
};

export const onMessageReceived = (callback) => {
  if (Platform.OS === 'web') {
    console.log('FCM messaging not available on web');
    return () => { };
  }

  try {
    const app = initializeFirebase();
    if (!app) {
      console.error('Firebase not initialized, cannot set up message listener');
      return () => { };
    }
    const messaging = getMessagingModule();
    if (!messaging) return () => { };

    return messaging().onMessage(async (remoteMessage) => {
      console.log('A new FCM message arrived!', JSON.stringify(remoteMessage));
      callback(remoteMessage);
    });
  } catch (error) {
    console.error('Error setting up message listener:', error);
    return () => { };
  }
};

export const onNotificationOpenedApp = (callback) => {
  if (Platform.OS === 'web') {
    console.log('FCM messaging not available on web');
    return () => { };
  }

  try {
    const app = initializeFirebase();
    if (!app) {
      console.error('Firebase not initialized, cannot set up notification listener');
      return () => { };
    }
    const messaging = getMessagingModule();
    if (!messaging) return () => { };

    return messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('Notification caused app to open from background state:', remoteMessage);
      callback(remoteMessage);
    });
  } catch (error) {
    console.error('Error setting up notification listener:', error);
    return () => { };
  }
};

export const getInitialNotification = async () => {
  if (Platform.OS === 'web') {
    console.log('FCM messaging not available on web');
    return null;
  }

  try {
    const app = initializeFirebase();
    if (!app) {
      console.error('Firebase not initialized, cannot get initial notification');
      return null;
    }
    const messaging = getMessagingModule();
    if (!messaging) return null;

    const remoteMessage = await messaging().getInitialNotification();
    if (remoteMessage) {
      console.log('Notification caused app to open from quit state:', remoteMessage);
      return remoteMessage;
    }
    return null;
  } catch (error) {
    console.error('Error getting initial notification:', error);
    return null;
  }
};

/** For callers that need the messaging instance (e.g. after init). */
export const getMessagingInstance = () => {
  if (Platform.OS === 'web') return null;
  const messaging = getMessagingModule();
  if (!messaging) return null;
  try {
    return messaging();
  } catch (_) {
    return null;
  }
};

/**
 * Background & killed state: when app is in background (or on Android sometimes when killed),
 * FCM delivers data-only messages here. We show a local notification so the user sees it.
 * Must be registered after app mount via registerFirebaseBackgroundHandler().
 */
async function showNotificationFromRemoteMessage(remoteMessage) {
  const data = remoteMessage.data || {};
  const isMoEngagePush = data && data.push_from === 'moengage';

  if (isMoEngagePush) {
    console.log('[FCM Background] Ignoring MoEngage push to prevent duplicate local notification');
    return null;
  }

  const title = remoteMessage.notification?.title ?? data.gcm_title ?? data.title ?? 'Notification';
  const body = remoteMessage.notification?.body ?? data.gcm_alert ?? data.body ?? data.gcm_subtext ?? 'New message';

  let Notifications;
  try {
    Notifications = require('expo-notifications');
  } catch (_) {
    return null;
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('foreground_push', {
        name: 'Push Notifications',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        sound: 'default',
        enableVibrate: true,
      });
    } catch (_) { }
  }

  const trigger =
    Platform.OS === 'android'
      ? {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: 'foreground_push',
      }
      : null;

  const scheduled = await Notifications.scheduleNotificationAsync({
    content: {
      title: String(title),
      body: String(body),
      data,
      ...(Platform.OS === 'android' && { channelId: 'foreground_push' }),
    },
    trigger,
  });

  return scheduled;
}
