/**
 * Push notifications: Foreground = handled here (handleForegroundMessage).
 * Background = handled in firebase.js setBackgroundMessageHandler (shows local notification).
 * Killed = setBackgroundMessageHandler may run on Android when app is woken by FCM; for reliable
 * display when app is killed, configure MoEngage to send a "notification" payload (title + body)
 * so FCM shows it natively without starting the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, Linking } from 'react-native';
import { requestUserPermission, getFCMToken, onMessageReceived, onNotificationOpenedApp, getInitialNotification } from '../config/firebase';
import deepLinkingService from './deepLinkingService';

// Lazy-load expo-notifications to avoid "Cannot read property 'NativeModule' of undefined" when
// the native bridge isn't ready yet at bundle load time (Hermes).
let NotificationsModule = null;
let notificationHandlerSet = false;

function getNotifications() {
  if (NotificationsModule) return NotificationsModule;
  if (Platform.OS === 'web') return null;
  try {
    NotificationsModule = require('expo-notifications');
    if (!notificationHandlerSet) {
      notificationHandlerSet = true;
      NotificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldAnimate: true,
        }),
      });
    }
    return NotificationsModule;
  } catch (e) {
    return null;
  }
}

// Lazy-load MoEngage so notificationService doesn't pull native modules at top level
function getMoEngageService() {
  try {
    return require('./moengageAnalytics').default;
  } catch (_) {
    return null;
  }
}

class NotificationService {
  constructor() {
    this.token = null;
    this.permissionGranted = false;
    this.messageListener = null;
    this.notificationOpenedListener = null;
    this.expoResponseSubscription = null;
    this.isInitialized = false;

    if (Platform.OS === 'web') {
      console.log('NotificationService: Running on web platform - Firebase messaging disabled');
    }
  }

  async checkPermissionStatus() {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return { granted: false, status: null, statusText: 'Unknown' };
      }
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('📱 Current expo notification permission status:', existingStatus);

      this.permissionGranted = existingStatus === 'granted';

      return {
        granted: this.permissionGranted,
        status: existingStatus,
        statusText: this.getPermissionStatusText(existingStatus)
      };
    } catch (error) {
      console.error('❌ Error checking permission status:', error);
      return {
        granted: false,
        status: null,
        statusText: 'Unknown'
      };
    }
  }

  getPermissionStatusText(status) {
    switch (status) {
      case 'granted':
        return 'Granted';
      case 'denied':
        return 'Denied';
      case 'undetermined':
        return 'Not Determined';
      default:
        return 'Unknown';
    }
  }

  async requestPermissionWithPopup() {
    try {
      console.log('📱 Requesting notification permission with expo-notifications...');
      console.log('📱 Platform:', Platform.OS);

      // Handle web platform
      if (Platform.OS === 'web') {
        console.log('NotificationService: Web platform detected - notifications not available');
        return { success: false, granted: false, message: 'Notifications not available on web platform' };
      }

      // iOS-specific: Set notification handler before requesting permission
      if (Platform.OS === 'ios') {
        const Notifications = getNotifications();
        if (Notifications) {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
            }),
          });
        }
      }

      const Notifications = getNotifications();
      if (!Notifications) {
        return { success: false, granted: false, message: 'Notifications not available' };
      }
      // Use expo-notifications to request permission - this will show the native popup
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
      });
      console.log('📱 Permission request result:', status);

      const granted = status === 'granted';
      console.log('📱 Permission granted:', granted);
      this.permissionGranted = granted;

      if (granted) {
        console.log('✅ Permission granted successfully');
        // Get FCM token after permission is granted
        await this.getFCMToken();
        return { success: true, granted: true, message: 'Permission granted successfully' };
      } else {
        console.log('❌ Permission denied');
        this.showPermissionDeniedAlert();
        return { success: false, granted: false, message: 'Permission denied' };
      }
    } catch (error) {
      console.error('❌ Error requesting permission:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      return { success: false, granted: false, message: error.message };
    }
  }

  showPermissionDeniedAlert() {
    Alert.alert(
      'Notification Permission Required',
      'To receive important updates and notifications, please enable notifications in your device settings.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Open Settings',
          onPress: () => this.openAppSettings()
        }
      ]
    );
  }

  async openAppSettings() {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('❌ Error opening settings:', error);
    }
  }

  async getFCMToken() {
    try {
      console.log('[FCM] getToken() requesting...');
      this.token = await getFCMToken();
      if (this.token) {
        console.log('[FCM] getToken() success, length:', this.token.length);
        await AsyncStorage.setItem('fcmToken', this.token);

        const moe = getMoEngageService();
        if (moe && moe.passPushToken) {
          await moe.passPushToken(this.token);
        }
        return this.token;
      } else {
        console.log('[FCM] getToken() returned null/empty');
        return null;
      }
    } catch (error) {
      console.error('[FCM] getToken() error:', error?.message || error);
      return null;
    }
  }

  async getPermissionStatus() {
    return await this.checkPermissionStatus();
  }

  async initialize(retryCount = 0) {
    try {
      console.log('Initializing notification service... (attempt:', retryCount + 1, ')');

      // Handle web platform
      if (Platform.OS === 'web') {
        console.log('NotificationService: Web platform detected - skipping Firebase initialization');
        this.isInitialized = true;
        return {
          permissionGranted: false,
          token: null,
          permissionStatus: { granted: false, status: 'web_platform', statusText: 'Not Available on Web' }
        };
      }

      // Android: Create default notification channel (required for Android 8+ to show FCM notifications)
      if (Platform.OS === 'android') {
        const Notifications = getNotifications();
        if (Notifications) {
          try {
            await Notifications.setNotificationChannelAsync('default', {
              name: 'Default',
              importance: Notifications.AndroidImportance.HIGH,
              enableVibrate: true,
            });
          } catch (channelError) {
            console.warn('Could not create default notification channel:', channelError);
          }
        }
      }

      // Check permission status first using expo-notifications
      const permissionStatus = await this.checkPermissionStatus();
      console.log('📱 Permission status:', permissionStatus);

      if (permissionStatus.granted) {
        // Get FCM token (stores in AsyncStorage and passes to MoEngage)
        this.token = await this.getFCMToken();
        if (!this.token) {
          console.log('[FCM] Token not available after permission granted');
        }

        // Setup message listeners
        this.setupMessageListener();
        this.setupNotificationOpenedListener();
        this.setupExpoNotificationResponseListener();
        // Note: MoEngage push-click/in-app listeners are managed by moengageNotificationHandler

        // Check for initial notification
        await this.checkInitialNotification();
      } else if (
        permissionStatus.status === 'undetermined' ||
        (Platform.OS === 'android' && permissionStatus.status === 'denied')
      ) {
        // Show native permission prompt:
        // - undetermined: user was never asked (iOS + Android).
        // - Android denied: on Android 13+ we may get "denied" before ever requesting; still try so the system dialog can show.
        console.log(
          '📱 Permission not granted - will request notification permission after short delay (status:',
          permissionStatus.status,
          ')'
        );
        setTimeout(async () => {
          try {
            const requestResult = await this.requestPermissionWithPopup();
            if (requestResult.granted) {
              this.setupMessageListener();
              this.setupNotificationOpenedListener();
              this.setupExpoNotificationResponseListener();
              await this.checkInitialNotification();
            }
          } catch (err) {
            console.warn('Notification permission request failed:', err);
          }
        }, 1500);
      } else {
        console.log('❌ Notification permission not granted (denied or other)');
      }

      this.isInitialized = true;
      console.log('Notification service initialized successfully');
      return {
        permissionGranted: permissionStatus.granted,
        token: this.token,
        permissionStatus: permissionStatus
      };
    } catch (error) {
      console.error('❌ Error initializing notification service:', error);
      console.log('📋 Error details:', {
        message: error.message,
        code: error.code,
        platform: Platform.OS
      });

      this.isInitialized = false;
      if (retryCount < 3) {
        console.log('🔄 Retrying notification service initialization...');
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return this.initialize(retryCount + 1);
      }

      throw error;
    }
  }

  setupMessageListener() {
    try {
      this.messageListener = onMessageReceived((remoteMessage) => {
        console.log('📱 Received foreground message:', JSON.stringify(remoteMessage, null, 2));
        this.handleForegroundMessage(remoteMessage).catch((err) => {
          console.error('[FCM Foreground] handleForegroundMessage rejected:', err?.message ?? err);
        });
      });
      console.log('✅ Message listener setup complete');
    } catch (error) {
      console.error('❌ Error setting up message listener:', error);
    }
  }

  setupNotificationOpenedListener() {
    try {
      this.notificationOpenedListener = onNotificationOpenedApp((remoteMessage) => {
        console.log('📱 Notification opened app:', JSON.stringify(remoteMessage, null, 2));
        this.handleNotificationTap(remoteMessage);
      });
      console.log('✅ Notification opened listener setup complete');
    } catch (error) {
      console.error('❌ Error setting up notification opened listener:', error);
    }
  }

  /**
   * When user taps the Expo-shown notification (foreground MoEngage push), the intent has no
   * extras so MoEngage pushClicked never fires. Handle tap here using the notification's
   * content.data (we stored remoteMessage.data there) and route via deepLinkingService.
   */
  setupExpoNotificationResponseListener() {
    if (Platform.OS === 'web') return;
    const Notifications = getNotifications();
    if (!Notifications) return;
    try {
      this.expoResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response?.notification?.request?.content?.data;
        if (!data || typeof data !== 'object') return;
        const url = data.gcm_webUrl || data.url || (data.payload && data.payload.gcm_webUrl) || (data.payload && data.payload.url);
        const isMoEngage = data.push_from === 'moengage' || data.gcm_webUrl;
        if (isMoEngage && url && typeof url === 'string' && url.trim()) {
          const urlWithSource = url.trim().includes('?') ? `${url.trim()}&playback_source=notification` : `${url.trim()}?playback_source=notification`;
          console.log('SHORTIFY [Expo notif tap] MoEngage foreground notification tapped, routing:', urlWithSource);
          deepLinkingService.handleDeepLink({ url: urlWithSource });
        }
      });
    } catch (error) {
      console.error('SHORTIFY [Expo notif tap] Failed to add notification response listener:', error);
    }
  }

  // MoEngage push-click and in-app CTA listeners are managed by moengageNotificationHandler.
  // Keeping this method as a no-op so existing call sites don't break during refactoring.
  setupMoEngageListeners() { }

  async checkInitialNotification() {
    try {
      const initialNotification = await getInitialNotification();
      if (initialNotification) {
        console.log('📱 Initial notification found:', JSON.stringify(initialNotification, null, 2));
        this.handleNotificationTap(initialNotification);
      }
    } catch (error) {
      console.error('❌ Error checking initial notification:', error);
    }
  }

  async handleForegroundMessage(remoteMessage) {
    console.log('SHORTIFY [FCM Foreground] Message received');
    console.log('SHORTIFY [FCM Foreground] notification:', remoteMessage.notification ? JSON.stringify(remoteMessage.notification) : 'undefined');
    console.log('SHORTIFY [FCM Foreground] data keys:', remoteMessage.data ? Object.keys(remoteMessage.data) : []);

    if (Platform.OS === 'web') {
      console.log('SHORTIFY [FCM Foreground] Skipped (web)');
      return;
    }

    const data = remoteMessage.data || {};
    const title = remoteMessage.notification?.title ?? data.gcm_title ?? data.title ?? 'Notification';
    const body = remoteMessage.notification?.body ?? remoteMessage.notification?.android?.body ?? data.gcm_alert ?? data.body ?? data.gcm_subtext ?? 'New message';

    console.log('SHORTIFY [FCM Foreground] Resolved title:', title, 'body length:', String(body).length);

    try {
      if (Platform.OS === 'android') {
        const Notifications = getNotifications();
        if (Notifications) {
          try {
            await Notifications.setNotificationChannelAsync('foreground_push', {
              name: 'Push Notifications',
              importance: Notifications.AndroidImportance?.HIGH ?? 4,
              sound: 'default',
              enableVibrate: true,
            });
            console.log('SHORTIFY [FCM Foreground] Android channel foreground_push ensured');
          } catch (channelErr) {
            console.warn('SHORTIFY [FCM Foreground] Channel setup warning:', channelErr?.message);
          }
        }
      }

      const Notifications = getNotifications();
      if (!Notifications) {
        console.warn('SHORTIFY [FCM Foreground] expo-notifications not available');
        return;
      }
      const trigger = Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false, channelId: 'foreground_push' }
        : null;

      console.log('SHORTIFY [FCM Foreground] Calling scheduleNotificationAsync, trigger:', trigger ? 'TIME_INTERVAL 1s' : 'null');
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: String(title),
          body: String(body),
          data: data,
          ...(Platform.OS === 'android' && { channelId: 'foreground_push' }),
        },
        trigger,
      });
      console.log('SHORTIFY [FCM Foreground] scheduleNotificationAsync success, id:', id);
    } catch (e) {
      console.error('SHORTIFY [FCM Foreground] scheduleNotificationAsync failed:', e?.message ?? e);
      console.error('SHORTIFY [FCM Foreground] full error:', e);
    }
  }

  handleNotificationTap(remoteMessage) {
    console.log('📱 === NOTIFICATION TAP HANDLED ===');
    console.log('📱 Notification Title:', remoteMessage.notification?.title);
    console.log('📱 Notification Body:', remoteMessage.notification?.body);
    console.log('📱 Notification Data:', remoteMessage.data);

    const data = remoteMessage?.data || remoteMessage?.payload || {};
    const url = data.gcm_webUrl || data.url || (data.payload && (data.payload.gcm_webUrl || data.payload.url));
    if (url && typeof url === 'string' && url.trim()) {
      const urlWithSource = url.trim().includes('?') ? `${url.trim()}&playback_source=notification` : `${url.trim()}?playback_source=notification`;
      console.log('📱 Initial/cold-start notification deep link:', urlWithSource);
      deepLinkingService.handleDeepLink({ url: urlWithSource });
    }
    console.log('📱 === NOTIFICATION TAP END ===');
  }

  async getStoredToken() {
    try {
      return await AsyncStorage.getItem('fcmToken');
    } catch (error) {
      console.error('❌ Error getting stored token:', error);
      return null;
    }
  }

  async refreshToken() {
    try {
      console.log('[FCM] Refreshing token and passing to MoEngage...');
      this.token = await this.getFCMToken();
      return this.token;
    } catch (error) {
      console.error('[FCM] Error refreshing token:', error);
      return null;
    }
  }

  isPermissionGranted() {
    return this.permissionGranted;
  }

  cleanup() {
    try {
      if (this.messageListener) {
        this.messageListener();
        console.log('✅ Message listener cleaned up');
      }
      if (this.notificationOpenedListener) {
        this.notificationOpenedListener();
        console.log('✅ Notification opened listener cleaned up');
      }
      if (this.expoResponseSubscription && typeof this.expoResponseSubscription.remove === 'function') {
        this.expoResponseSubscription.remove();
        this.expoResponseSubscription = null;
        console.log('✅ Expo notification response listener cleaned up');
      }

      const moe = getMoEngageService();
      if (moe && moe.getMoEngage) {
        const moeInstance = moe.getMoEngage();
        if (moeInstance && typeof moeInstance.removeEventListener === 'function') {
          moeInstance.removeEventListener("pushClicked");
          moeInstance.removeEventListener("pushTokenGenerated");
          moeInstance.removeEventListener("inAppCampaignShown");
          moeInstance.removeEventListener("inAppCampaignClicked");
        }
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }


}

export default new NotificationService(); 