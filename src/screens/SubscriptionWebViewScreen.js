import React from 'react';
import {
  StyleSheet,
  SafeAreaView,
  BackHandler,
  Linking,
  Platform,
  View,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import LottieLoader from '../components/LottieLoader';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { usePaymentFeedback } from '../context/PaymentFeedbackContext';
import { generateAuthKey } from '../utils/encryptionUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openIapSubscription } from '../services/iapService';
// Lazy-load to avoid pulling react-native-appsflyer into the startup module chain.
function getAppsflyerService() {
  return require('../services/appsflyerAnalytics').default;
}

// Known UPI apps and their test URI schemes to detect installation (Android only)
const UPI_APPS = [
  { key: 'gpay', testUrl: 'tez://upi/pay' },       // Google Pay (Tez)
  { key: 'phonepe', testUrl: 'phonepe://upi/pay' },// PhonePe
  { key: 'paytm', testUrl: 'paytmmp://pay' },      // Paytm
  { key: 'bhim', testUrl: 'bhim://upi/pay' },      // BHIM
];

const detectInstalledUpiApps = async () => {
  if (Platform.OS !== 'android') {
    return [];
  }

  const available = [];

  await Promise.all(
    UPI_APPS.map(async (app) => {
      try {
        const canOpen = await Linking.canOpenURL(app.testUrl);
        if (canOpen) {
          available.push(app.key);
        }
      } catch (e) {
        // Ignore errors and treat as not installed
      }
    })
  );

  return available;
};

// ========== URLs that trigger Google IAP when user selects "Other Payment Method (Google)" ==========
// Per team: when user clicks Google option, web page hits chpac.hungama.com/billing/pay.php → we intercept and open IAP intent.
// Also support: fasttv://open-google-iap, postMessage {action: 'open_google_iap'}
const GOOGLE_IAP_TRIGGER_URL = 'fasttv://open-google-iap';
const GOOGLE_IAP_BILLING_URL = 'https://chpac.hungama.com/billing/pay.php';

const SubscriptionWebViewScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user, isAuthenticated } = useAuth();
  const { checkSubscriptionStatus, isEligibleForSubscription } = useSubscription();
  const { showPaymentFailed } = usePaymentFeedback();
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(false);
  const webViewRef = React.useRef(null);
  const hasHandledCloseRef = React.useRef(false);
  // Track last time we opened the Google IAP sheet; used to debounce multiple rapid triggers
  const lastIapOpenAtRef = React.useRef(0);
  const hasHandledGwalletResultRef = React.useRef(false);
  // Store plan page URL when user triggers IAP, so after API response we append gwallet & order_id to this URL
  const planPageUrlStoredRef = React.useRef(null);
  // Track if IAP was opened and whether we've handled the result (success/cancel)
  const iapOpenedRef = React.useRef(false);
  const hasHandledIapCancelRef = React.useRef(false);

  // Get userId from user object or AsyncStorage
  const [subscriptionUrl, setSubscriptionUrl] = React.useState('');
  const [currentWebViewUrl, setCurrentWebViewUrl] = React.useState('');
  // After API response (success/fail), load this URL in WebView so the result page UI shows (gwallet & order_id)
  const [gwalletResultUrl, setGwalletResultUrl] = React.useState(null);
  // When true, WebView loads about:blank to release subscription page memory before unmount (reduces OOM on repeated open/close)
  const [clearWebViewForUnmount, setClearWebViewForUnmount] = React.useState(false);

  React.useEffect(() => {
    const buildSubscriptionUrl = async () => {
      try {
        // Get userId from various sources
        let userId = null;

        // Try from user object first
        if (user?.userId) {
          userId = user.userId;
        } else if (user?.uid) {
          userId = user.uid;
        } else if (user?.id) {
          userId = user.id;
        } else {
          // Try from AsyncStorage
          const storedUser = await AsyncStorage.getItem('user');
          if (storedUser) {
            const userData = JSON.parse(storedUser);
            userId = userData?.userId || userData?.uid || userData?.id;
          }
        }

        // If still no userId, try to get from auth token
        if (!userId) {
          const authToken = await AsyncStorage.getItem('authToken');
          if (authToken) {
            const { decodeJwtToken } = require('../services/api');
            const decodedToken = decodeJwtToken(authToken);
            if (decodedToken) {
              userId = decodedToken?.data?.userId ||
                decodedToken?.userId ||
                decodedToken?.id ||
                decodedToken?.sub ||
                decodedToken?.user_id;
            }
          }
        }

        // Use resolved user ID
        const finalUserId = userId;

        if (finalUserId == null || finalUserId === '') {
          setSubscriptionUrl('');
          return;
        }

        // Detect installed UPI apps and build dynamic upilist (Android only)
        const installedUpiApps = await detectInstalledUpiApps();

        // Get AppsFlyer ID for attribution (if available)
        let appsflyerId = null;
        try {
          appsflyerId = await getAppsflyerService().getAppsFlyerUID();
        } catch (e) {
          console.warn('[SubscriptionWebView] getAppsFlyerUID error:', e);
          // Ignore; subscription URL will omit appsflyer_id
        }

        const authKey = generateAuthKey(finalUserId.toString())

        // Build the subscription URL
        const baseUrl = 'https://payments.hungama.com/';
        const page = isEligibleForSubscription ? 'miniplan' : 'miniplannew';
        const paramsObject = {
          auth: authKey,
          utm_source: 'android',
          utm_medium: '',
          identity: finalUserId.toString(),
          product_id: '84',
          country: 'IN',
          platform_id: '1',
          plan_type: 'subscription',
          aff_code: '',
          extra_data: '',
          callback_url: 'aHR0cHM6Ly91bi5odW5nYW1hLmNvbS8=',
          upgradable: '0',
        };
        if (appsflyerId) {
          paramsObject.appsflyer_id = appsflyerId;
        }

        // Only include upilist if we detected any UPI apps
        if (installedUpiApps.length > 0) {
          paramsObject.upilist = installedUpiApps.join(',');
        }

        const params = new URLSearchParams(paramsObject);

        const url = `${baseUrl}${page}?${params.toString()}#inner-mid-area`;
        setSubscriptionUrl(url);
      } catch (error) {
        console.error('Error building subscription URL:', error);
        // Fallback URL
        // const fallbackUrl = 'https://payments.hungama.com/plan?auth=0d6f109b825999552bc62b69a2c5332f&utm_source=web_home&utm_medium=&identity=1031334008&product_id=1&country=IN&platform_id=1&plan_type=subscription&aff_code=&extra_data=&callback_url=aHR0cHM6Ly91bi5odW5nYW1hLmNvbS8=&upgradable=0#inner-mid-area';
        // setSubscriptionUrl(fallbackUrl);
      }
    };

    buildSubscriptionUrl();
  }, [user]);

  // Cleanup WebView on unmount to release memory (avoids OOM when repeatedly opening/closing subscription screen)
  React.useEffect(() => {
    return () => {
      try {
        if (webViewRef.current) {
          webViewRef.current.stopLoading?.();
          if (Platform.OS === 'android') {
            webViewRef.current.clearCache?.(true);
            webViewRef.current.clearHistory?.();
          }
        }
      } catch (e) {
        // Ignore if WebView already torn down
      }
    };
  }, []);

  // Handle hardware back button
  React.useEffect(() => {
    const backAction = () => {
      handleClose(true);
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  // When user selects "Other Payment Method (Google)" (option B) in WebView Pay 1 bottom sheet → open Google IAP.
  // Triggered by: (1) URL navigation to fasttv://open-google-iap, or (2) postMessage from web page.
  const handleGoogleIapTrigger = React.useCallback(() => {
    const now = Date.now();
    const recentlyOpened =
      lastIapOpenAtRef.current && now - lastIapOpenAtRef.current < 2000;
    console.log(
      '[Gwallet] Step 0: WebView - handleGoogleIapTrigger lastOpenedAt=',
      lastIapOpenAtRef.current,
      'recentlyOpened=',
      recentlyOpened,
    );
    // Only Android + from Home trial; also prevent multiple opens within a couple of seconds
    if (Platform.OS !== 'android' || recentlyOpened) return;
    lastIapOpenAtRef.current = now;
    // Mark that IAP was opened - we'll check this when screen comes back into focus
    iapOpenedRef.current = true;
    hasHandledIapCancelRef.current = false;
    // Store plan page URL now so after payment+API we append gwallet & order_id to this URL
    const urlToStore = currentWebViewUrl || subscriptionUrl;
    planPageUrlStoredRef.current = urlToStore || null;
    console.log('[Gwallet] Step 0: WebView - stored plan page URL for post-payment callback:', urlToStore || '(none)');
    console.log('[Gwallet] Step 0: WebView - opening IAP (openIapSubscription)');
    openIapSubscription().catch((e) => console.warn('[Gwallet] Step 0: WebView - IAP open error:', e));
  }, [currentWebViewUrl, subscriptionUrl]);

  const handleShouldStartLoadWithRequest = React.useCallback((request) => {
    const url = request?.url || '';
    // Android only: intercept Google IAP triggers (WebView used for plan selection on Android; iOS uses native Subscription screen)
    if (Platform.OS !== 'android') return true; // iOS: allow all navigations; no Google wallet IAP
    // Trigger 1: Custom scheme fasttv://open-google-iap
    if (url.startsWith(GOOGLE_IAP_TRIGGER_URL) || url.includes('open-google-iap')) {
      console.log('[Gwallet] Step 0: WebView - intercepted URL (custom scheme), opening IAP');
      handleGoogleIapTrigger();
      return false; // Block the navigation
    }
    // Trigger 2: Billing pay.php - per team, when user clicks Google option this URL is hit
    if (url.includes('chpac.hungama.com/billing/pay.php')) {
      console.log('[Gwallet] Step 0: WebView - intercepted chpac billing/pay.php, opening IAP');
      handleGoogleIapTrigger();
      return false; // Block; we handle payment via native IAP
    }
    return true;
  }, [handleGoogleIapTrigger]);

  const handleWebViewMessage = React.useCallback((event) => {
    try {
      const data = JSON.parse(event?.nativeEvent?.data || '{}');
      if (data?.action === 'open_google_iap' || data?.action === 'openGoogleIap') {
        handleGoogleIapTrigger();
      }
    } catch (e) {}
  }, [handleGoogleIapTrigger]);

  const handleNavigationStateChange = async (navState) => {
    if (navState?.url) {
      setCurrentWebViewUrl(navState.url);
    }

    if (hasHandledCloseRef.current) {
      return;
    }

    // Don't close when showing gwallet result page – stay on WebView for user to see success/fail
    const url = navState?.url || '';
    const isGwalletResultPage = url.includes('gwallet=') && url.includes('order_id=');
    if (isGwalletResultPage) {
      return;
    }

    if ((navState.canGoBack && !navState?.url) || url === 'https://pac.hungama.com/wvclose.php' || url === 'https://chpac.hungama.com/wvclose.php') {
      hasHandledCloseRef.current = true;
      handleClose(true);
    }
  };

  // When gwallet (IAP) payment completes and API returns success/fail → append &gwallet=true|false&order_id= to stored plan URL and load WebView
  React.useEffect(() => {
    const success = route.params?.gwalletSuccess;
    const orderId = route.params?.orderId;
    if (success === undefined || hasHandledGwalletResultRef.current) return;
    hasHandledGwalletResultRef.current = true;
    // Mark that IAP was completed (success or fail), so we don't show cancel popup
    iapOpenedRef.current = false;

    console.log('[Gwallet] Step 5: WebView - payment done, API called. Result params: success=', success, 'orderId=', orderId);

    // Use stored plan page URL (at IAP trigger) or fallback to current/subscription URL
    const storedPlanUrl = planPageUrlStoredRef.current;
    const base = storedPlanUrl || currentWebViewUrl || subscriptionUrl;
    if (!base) {
      console.warn('[Gwallet] Step 5: WebView - no plan URL available (stored/current/subscription), cannot build result URL');
      return;
    }
    console.log('[Gwallet] Step 5: WebView - plan URL source:', storedPlanUrl ? 'stored-at-trigger' : (currentWebViewUrl ? 'current' : 'subscription'));
    console.log('[Gwallet] Step 5: WebView - plan URL (base):', base);

    // Match format: ...#inner-mid-area&gwallet=true&order_id=XXX (no spaces, proper % encoding)
    const cleanOrderId = String(orderId || '').trim().replace(/\s+/g, '');
    const gwallet = success ? 'true' : 'false';
    const sep = base.includes('?') ? '&' : '?';
    const paramsStr = `${sep}gwallet=${gwallet}&order_id=${encodeURIComponent(cleanOrderId)}`;
    const callbackUrl = (base + paramsStr).replace(/\s+/g, '');

    console.log('[Gwallet] Step 5: WebView - appended params: gwallet=', gwallet, 'order_id=', cleanOrderId);
    console.log('[Gwallet] Step 5: WebView - FINAL URL (payment done, API called):', callbackUrl);

    setGwalletResultUrl(callbackUrl);
    console.log('[Gwallet] Step 5: WebView - result URL set, WebView will load and show success/fail page');
  }, [route.params?.gwalletSuccess, route.params?.orderId, subscriptionUrl, currentWebViewUrl]);

  // Handle cancellation from route params (set by IapListenerSetup when user cancels)
  React.useEffect(() => {
    const cancelled = route.params?.gwalletCancelled;
    if (cancelled && !hasHandledIapCancelRef.current) {
      hasHandledIapCancelRef.current = true;
      iapOpenedRef.current = false;
      console.log('[Gwallet] Step Cancel: WebView - user cancelled payment, showing failure popup');
      showPaymentFailed({
        plan: 'FastTV',
        amount: '₹399 / 3 months',
        orderId: '—',
      });
    }
  }, [route.params?.gwalletCancelled, showPaymentFailed]);

  // Detect when user returns to screen after cancelling IAP (AppState + focus)
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active' && iapOpenedRef.current && !hasHandledIapCancelRef.current) {
        // App came to foreground, IAP was opened but no result received yet
        // Wait a bit to see if purchase completes, then check
        setTimeout(() => {
          // If still no result after 1 second, user likely cancelled
          if (iapOpenedRef.current && !hasHandledGwalletResultRef.current && !hasHandledIapCancelRef.current) {
            console.log('[Gwallet] Step Cancel: WebView - detected return from Play Store, likely cancelled');
            hasHandledIapCancelRef.current = true;
            iapOpenedRef.current = false;
            showPaymentFailed({
              plan: 'FastTV',
              amount: '₹399 / 3 months',
              orderId: '—',
            });
          }
        }, 1000);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [showPaymentFailed]);

  // Also check on screen focus
  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android') return;

      // When screen comes into focus, check if IAP was opened but not completed
      if (iapOpenedRef.current && !hasHandledGwalletResultRef.current && !hasHandledIapCancelRef.current) {
        // Wait a moment to see if purchase completes
        const timeoutId = setTimeout(() => {
          if (iapOpenedRef.current && !hasHandledGwalletResultRef.current && !hasHandledIapCancelRef.current) {
            console.log('[Gwallet] Step Cancel: WebView - screen focused, IAP opened but no result, likely cancelled');
            hasHandledIapCancelRef.current = true;
            iapOpenedRef.current = false;
            showPaymentFailed({
              plan: 'FastTV',
              amount: '₹399 / 3 months',
              orderId: '—',
            });
          }
        }, 1500);

        return () => clearTimeout(timeoutId);
      }
    }, [showPaymentFailed])
  );

  const handleClose = async (shouldCheckSubscription = true) => {
    // Stop WebView loading and release memory before navigation (reduces OOM on repeated open/close)
    try {
      const wv = webViewRef.current;
      if (wv) {
        wv.stopLoading?.();
        if (Platform.OS === 'android') {
          wv.clearCache?.(true);
          wv.clearHistory?.();
        }
      }
    } catch (_) {}
    setClearWebViewForUnmount(true);

    try {
      if (shouldCheckSubscription) {
        setIsCheckingStatus(true);
        const result = await checkSubscriptionStatus();
        console.log('Info: subscription status result', result);
      }
    } finally {
      setIsCheckingStatus(false);
      // Navigate to MainTabs/Home (pops SubscriptionWebView in standard stack behavior, so we don't accumulate instances)
      if (isAuthenticated) {
        navigation.navigate('MainTabs', { screen: 'Home' });
      } else if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('MainTabs', { screen: 'Home' });
      }
    }
  };

  // When screen loses focus (user navigated back), unmount WebView to release memory and avoid OOM on repeated open/close
  if (!isFocused) {
    return <SafeAreaView style={[styles.container, { paddingTop: insets.top }]} />;
  }

  const webViewUri = clearWebViewForUnmount ? 'about:blank' : (gwalletResultUrl || subscriptionUrl);
  if (!subscriptionUrl && !gwalletResultUrl && !clearWebViewForUnmount) {
    return <SafeAreaView style={[styles.container, { paddingTop: insets.top }]} />;
  }

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: webViewUri }}
        style={styles.webview}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onMessage={handleWebViewMessage}
        onNavigationStateChange={handleNavigationStateChange}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error: ', nativeEvent);
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        mixedContentMode="always"
      />
      {isCheckingStatus && (
        <View style={styles.loaderOverlay}>
          <LottieLoader size="large" />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
});

export default SubscriptionWebViewScreen;
