import React, { useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { usePaymentFeedback } from '../context/PaymentFeedbackContext';
import API from '../services/api';
import {
  attachPurchaseListeners,
  IOS_PRODUCT_IDS,
  ANDROID_PRODUCT_IDS,
  getIosPlanIdFromProductId,
} from '../services/iapService';

/**
 * Handle iOS purchase only. Uses iOS-specific API payload (platform_id 4, payment_id 10).
 * Matches develop branch flow: notifyBilling → 2.5s delay → checkSubscriptionStatus → show popup or goBack.
 * setSkipSubscriptionRedirectForIap prevents Subscription screen from auto-redirecting so popup shows first.
 */
async function handleIosPurchase(
  purchase,
  userId,
  navigationRef,
  checkSubscriptionStatus,
  showPaymentSuccess,
  setSkipSubscriptionRedirectForIap
) {
  const productId = purchase?.productId || '';
  const planId = getIosPlanIdFromProductId(productId);

  let transactionReceipt = purchase?.transactionReceipt || purchase?.receipt || '';
  if (!transactionReceipt) {
    try {
      const { getReceiptIOS } = require('react-native-iap');
      const receipt = await getReceiptIOS();
      if (receipt) transactionReceipt = receipt;
    } catch (receiptError) {
      console.warn('Could not get full app receipt:', receiptError);
    }
  }

  try {
    await API.notifyBilling({
      platform_id: '4',
      payment_id: '10',
      identity: userId,
      plan_id: planId,
      store_payment_id: productId,
      product_id: productId,
      transactionDate: purchase?.transactionDate || '',
      transactionId: purchase?.transactionId || '',
      purchase_token: purchase?.transactionId || '',
      hardware_id: '',
      aff_code: '',
      country: '',
      debug: '',
    });
    console.log('iOS IAP: Billing notification sent successfully');
  } catch (error) {
    console.error('iOS IAP: Error sending billing notification:', error);
    require('../utils/errorReporting').reportErrorAlert(
      'Sync Issue',
      'Your payment succeeded but we could not verify it. Please check your subscription status or contact support.',
      [{ text: 'OK' }]
    );
  }

  await new Promise((r) => setTimeout(r, 2500));
  // Prevent Subscription screen's "isGoldUser" useEffect from redirecting before we show the success popup.
  if (typeof setSkipSubscriptionRedirectForIap === 'function') {
    setSkipSubscriptionRedirectForIap(true);
  }
  try {
    await checkSubscriptionStatus();
  } catch (e) {
    console.warn('iOS IAP: Subscription status refresh after IAP:', e);
  }

  const nav = navigationRef?.current;
  if (!nav) return;

  const currentRoute = nav.getCurrentRoute?.();
  const isOnSubscriptionScreen = currentRoute?.name === 'Subscription';

  const navigateHome = () => {
    if (typeof setSkipSubscriptionRedirectForIap === 'function') {
      setSkipSubscriptionRedirectForIap(false);
    }
    if (nav.canGoBack()) {
      nav.goBack();
    } else {
      nav.navigate('MainTabs', { screen: 'Home' });
    }
  };

  // Only show success popup when purchase was initiated from Subscription screen.
  if (isOnSubscriptionScreen && typeof showPaymentSuccess === 'function') {
    // Map product to simple display info; details from API are not available here
    let planTitle = 'FastTV';
    let amountLabel = '';
    let validTillLabel = '';
    let validityDays = 0;

    if (productId === IOS_PRODUCT_IDS.TRIAL_3DAY_1R) {
      amountLabel = '₹1 / 3 days';
      validityDays = 3;
    } else if (productId === IOS_PRODUCT_IDS.QUARTERLY_399) {
      amountLabel = '₹399 / 3 months';
      validityDays = 90;
    }

    if (validityDays > 0) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + validityDays);
      const day = expiry.getDate().toString().padStart(2, '0');
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const month = monthNames[expiry.getMonth()];
      const year = expiry.getFullYear();
      validTillLabel = `${day} ${month} ${year}`;
    }

    const orderId =
      purchase?.transactionId ||
      purchase?.originalTransactionIdentifierIOS ||
      '';

    showPaymentSuccess({
      plan: planTitle,
      amount: amountLabel,
      orderId,
      validTill: validTillLabel,
      onPrimary: navigateHome,
    });
  } else {
    if (typeof setSkipSubscriptionRedirectForIap === 'function') {
      setSkipSubscriptionRedirectForIap(false);
    }
    navigateHome();
  }
}

// -----------------------------------------------------------------------------
// Android IAP (Google Wallet) only: notifyMiniSubscription + notifyBilling
// with Android payload (platform_id 1, payment_id 11), then WebView or goBack.
// -----------------------------------------------------------------------------
function getAndroidPlanIdFromProductId(productId) {
  if (!productId) return '74';
  if (productId === ANDROID_PRODUCT_IDS.QUARTERLY) return '74';
  return '74';
}

/**
 * Handle Android purchase only. Uses Android-specific APIs and payload.
 * Does not call or share any iOS logic.
 */
async function handleAndroidPurchase(purchase, userId, navigationRef) {
  const productId = purchase?.productId || '';
  const planId = getAndroidPlanIdFromProductId(productId);
  const orderIdFromPurchase = purchase?.orderId || purchase?.transactionId || '';
  const purchaseToken = purchase?.purchaseToken || purchase?.transactionId || '';

  try {
    await API.notifyMiniSubscription({
      identity: userId,
      order_id: orderIdFromPurchase,
    });
  } catch (miniErr) {
    console.warn('[Gwallet] notifyMiniSubscription failed:', miniErr);
  }

  let orderIdFromApi = '';
  let billingSuccess = false;
  try {
    const transactionDate = purchase?.transactionDate ?? purchase?.purchaseTime ?? Date.now();
    const transactionIdVal = purchase?.transactionId || purchase?.orderId || orderIdFromPurchase;
    const billingResponse = await API.notifyBilling({
      payment_id: '11',
      platform_id: '1',
      identity: userId,
      plan_id: planId,
      store_payment_id: productId,
      product_id: productId,
      transactionDate,
      transactionId: transactionIdVal,
      hardware_id: '',
      aff_code: '',
      country: 'IN',
      debug: '',
      purchase_token: purchaseToken,
    });
    const res = billingResponse?.response || billingResponse;
    const status = res?.status || '';
    orderIdFromApi =
      res?.order_id ||
      billingResponse?.order_id ||
      billingResponse?.response?.order_id ||
      orderIdFromPurchase;
    billingSuccess =
      String(status).toLowerCase() === 'success' && (res?.valid_token === 1 || res?.valid_token === true);
  } catch (billingErr) {
    console.error('[Gwallet] notifyBilling failed:', billingErr);
  }

  const nav = navigationRef?.current;
  const currentRoute = nav?.getCurrentRoute?.();
  if (currentRoute?.name === 'SubscriptionWebView') {
    nav.navigate({
      name: 'SubscriptionWebView',
      params: {
        ...(currentRoute.params || {}),
        gwalletSuccess: billingSuccess,
        orderId: orderIdFromApi,
      },
      merge: true,
    });
  } else {
    if (nav?.canGoBack?.()) nav.goBack();
    else nav?.navigate?.('MainTabs', { screen: 'Profile' });
  }
}

// -----------------------------------------------------------------------------
// App-level IAP listener: single registration, dispatches to iOS or Android only.
// -----------------------------------------------------------------------------
export default function IapListenerSetup({ navigationRef }) {
  const { user } = useAuth();
  const { checkSubscriptionStatus } = useSubscription();
  const { showPaymentFailed, showPaymentSuccess, setSkipSubscriptionRedirectForIap } = usePaymentFeedback();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    attachPurchaseListeners(
      async (purchase) => {
        try {
          let userId = userRef.current?.uid || userRef.current?.userId || '';
          if (!userId) {
            try {
              const storedUser = await AsyncStorage.getItem('user');
              if (storedUser) {
                const userData = JSON.parse(storedUser);
                userId = userData.uid || userData.id || userData.userId || '';
              }
            } catch (e) {}
          }

          if (Platform.OS === 'android') {
            await handleAndroidPurchase(purchase, userId, navigationRef);
          } else {
            await handleIosPurchase(
              purchase,
              userId,
              navigationRef,
              checkSubscriptionStatus,
              showPaymentSuccess,
              setSkipSubscriptionRedirectForIap
            );
          }
        } catch (error) {
          console.error('IAP purchase handler error:', error);
          require('../utils/errorReporting').reportErrorAlert(
            'Error',
            'We could not process your subscription. Please try again or contact support.',
            [{ text: 'OK' }]
          );
          if (navigationRef?.current) {
            if (navigationRef.current.canGoBack()) {
              navigationRef.current.goBack();
            } else {
              navigationRef.current.navigate('MainTabs', { screen: 'Profile' });
            }
          }
        }
      },
      (error) => {
        const code = error?.code || '';
        const message = (error?.message || String(error || '')) || '';
        const isUserCancel =
          code === 'E_USER_CANCELLED' ||
          code === 'USER_CANCELED' ||
          /cancel/i.test(message);
        
        // If user cancelled and we're on SubscriptionWebView screen, notify it
        if (isUserCancel) {
          const nav = navigationRef?.current;
          const currentRoute = nav?.getCurrentRoute?.();
          if (currentRoute?.name === 'SubscriptionWebView') {
            nav.navigate({
              name: 'SubscriptionWebView',
              params: {
                ...(currentRoute.params || {}),
                gwalletCancelled: true,
              },
              merge: true,
            });
          }
          return;
        }

        showPaymentFailed();
      }
    );
      }, [navigationRef, checkSubscriptionStatus, showPaymentFailed]);

  return null;
}
