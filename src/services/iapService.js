import { Platform, Alert } from 'react-native';

// Lazy-load react-native-iap to avoid "Cannot read property 'NativeModule' of undefined" at bundle load (Hermes).
let _RNIap = null;
function getRNIap() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  if (_RNIap) return _RNIap;
  try {
    _RNIap = require('react-native-iap');
    return _RNIap;
  } catch (e) {
    return null;
  }
}

// TODO: Replace with your real product IDs from App Store Connect
export const IOS_PRODUCT_IDS = {
  TRIAL_3DAY_1R: 'com.fasttv.app.quarterly',
  QUARTERLY_399: 'com.fasttv.app.quarterly',
};

// Google Play Console subscription SKU used for wallet / free trial payment
export const ANDROID_QUARTERLY_FREE_TRIAL_SKU = 'fastv_premium_quarterly_free_trial';

export const ANDROID_PRODUCT_IDS = {
  QUARTERLY: ANDROID_QUARTERLY_FREE_TRIAL_SKU,
};

export const getDefaultSubscriptionProductId = () => {
  if (Platform.OS === 'android') return ANDROID_QUARTERLY_FREE_TRIAL_SKU;
  return IOS_PRODUCT_IDS.QUARTERLY_399;
};

/** iOS only: map IAP productId to backend plan_id (used by notifyBilling). */
export const getIosPlanIdFromProductId = (productId) => {
  if (!productId) return '74';
  if (productId === IOS_PRODUCT_IDS.TRIAL_3DAY_1R) return '73';
  if (productId === IOS_PRODUCT_IDS.QUARTERLY_399) return '74';
  return '74';
};

let initialized = false;
let purchaseUpdateSub = null;
let purchaseErrorSub = null;

export const initIap = async () => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  if (initialized) return;
  const RNIap = getRNIap();
  if (!RNIap) return;
  try {
    await RNIap.initConnection();
    initialized = true;
  } catch (e) {
    console.error('IAP init error:', e);
    require('../utils/errorReporting').reportErrorAlert(
      'Error',
      Platform.OS === 'ios'
        ? 'Unable to connect to App Store for purchases.'
        : 'Unable to connect to Google Play for purchases.'
    );
  }
};

export const getSubscriptions = async (skus) => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return [];
  const RNIap = getRNIap();
  if (!RNIap) return [];
  try {
    await initIap();
    const ids = skus && skus.length > 0
      ? skus
      : Platform.OS === 'ios'
        ? Object.values(IOS_PRODUCT_IDS)
        : Object.values(ANDROID_PRODUCT_IDS);
    const products = await RNIap.getSubscriptions({ skus: ids });
    return products || [];
  } catch (e) {
    console.error('IAP getSubscriptions error:', e);
    return [];
  }
};

export const requestIosSubscription = async (productId) => {
  if (Platform.OS !== 'ios') return;
  const RNIap = getRNIap();
  if (!RNIap) return;
  try {
    await initIap();
    if (!productId) return;
    const subs = await RNIap.getSubscriptions({ skus: [productId] });
    if (!subs || subs.length === 0) {
      require('../utils/errorReporting').reportErrorAlert('Invalid Product ID', `The App Store cannot find this product: "${productId}".`);
      return;
    }
    await RNIap.requestSubscription({ sku: productId, skus: [productId] });
  } catch (e) {
    console.error('IAP requestSubscription error:', e);
    require('../utils/errorReporting').reportErrorAlert('Purchase Failed', 'Unable to start purchase. Please try again.');
    // Let callers decide how to show purchase failure UI
    throw e;
  }
};

/**
 * Request a subscription on Android. Google Play requires subscriptionOffers with offerToken.
 */
export const requestAndroidSubscription = async (productId) => {
  if (Platform.OS !== 'android') return;
  const RNIap = getRNIap();
  if (!RNIap) return;
  try {
    await initIap();
    if (!productId) return;
    const subs = await RNIap.getSubscriptions({ skus: [productId] });
    if (!subs || subs.length === 0) {
      require('../utils/errorReporting').reportErrorAlert(
        'Subscription not available',
        `Google Play returned no product for "${productId}". Install the app from the Play Store (e.g. Internal testing) and try again.`
      );
      return;
    }
    const product = subs[0];
    const details = product?.subscriptionOfferDetails || [];
    if (!Array.isArray(details) || details.length === 0) {
      require('../utils/errorReporting').reportErrorAlert('Configuration Error', 'This subscription has no offer. Configure offers in Google Play Console.');
      return;
    }
    let offerToken = null;
    for (const d of details) {
      if (!d || !d.offerToken) continue;
      const token = typeof d.offerToken === 'string' ? d.offerToken : null;
      if (!token) continue;
      const offerId = (d.offerId || d.basePlanId || '').toLowerCase();
      if (offerId.includes('trial') || offerId.includes('free')) {
        offerToken = token;
        break;
      }
      if (!offerToken) offerToken = token;
    }
    if (!offerToken && details[0]?.offerToken) offerToken = details[0].offerToken;
    if (!offerToken) {
      require('../utils/errorReporting').reportErrorAlert('Configuration Error', 'This subscription has no offer. Configure offers in Google Play Console.');
      return;
    }
    await RNIap.requestSubscription({
      sku: productId,
      skus: [productId],
      subscriptionOffers: [{ sku: productId, offerToken }],
    });
  } catch (e) {
    const message = (e?.message || String(e)) || '';
    const code = e?.code || '';
    const isUserCancel = code === 'E_USER_CANCELLED' || code === 'USER_CANCELED' || /cancel/i.test(message);
    const isItemNotFound = /could not be found|item not found|not find/i.test(message);
    const isItemUnavailable = code === 'E_ITEM_UNAVAILABLE' || /unavailable/i.test(message);
    if (isUserCancel || isItemNotFound) return;
    if (isItemUnavailable) {
      require('../utils/errorReporting').reportErrorAlert(
        'Subscription unavailable',
        'This subscription is not available for your account or region. Check that it\'s active in your country in Play Console and that you\'re signed in with a license tester account if required.'
      );
      return;
    }
    require('../utils/errorReporting').reportErrorAlert('Purchase Failed', 'Unable to start purchase. Please try again.');
  }
};

export const requestSubscription = async (productId) => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  const sku = productId || getDefaultSubscriptionProductId();
  if (Platform.OS === 'ios') await requestIosSubscription(sku);
  else await requestAndroidSubscription(sku);
};

/**
 * Open IAP subscription flow (Google Play wallet on Android). Used when user closes the subscription web view from Home (3 days trial).
 * On Android always uses fastv_premium_quarterly_free_trial for the wallet payment.
 */
export const openIapSubscription = async (productId) => {
  await initIap();
  const sku = Platform.OS === 'android'
    ? (productId || ANDROID_QUARTERLY_FREE_TRIAL_SKU)
    : (productId || getDefaultSubscriptionProductId());
  await requestSubscription(sku);
};

/**
 * Attach listeners for purchase updates and errors. Works on both iOS and Android.
 */
export const attachPurchaseListeners = (onPurchase, onError) => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  if (purchaseUpdateSub || purchaseErrorSub) return;
  const RNIap = getRNIap();
  if (!RNIap) return;

  purchaseUpdateSub = RNIap.purchaseUpdatedListener(async (purchase) => {
    try {
      if (onPurchase) await onPurchase(purchase);
      if (!purchase) return;
      const iap = getRNIap();
      if (iap) await iap.finishTransaction({ purchase, isConsumable: false });
    } catch (e) {
      console.error('Error handling IAP purchase:', e);
    }
  });

  purchaseErrorSub = RNIap.purchaseErrorListener((error) => {
    const code = error?.code || '';
    const message = (error?.message || String(error || '')) || '';
    const isUserCancel = code === 'E_USER_CANCELLED' || code === 'USER_CANCELED' || /cancel/i.test(message);
    const isItemNotFound = /could not be found|item not found|not find/i.test(message);
    const isItemUnavailable = code === 'E_ITEM_UNAVAILABLE' || /unavailable/i.test(message);
    if (isUserCancel || isItemNotFound) return;

    if (typeof onError === 'function') {
      onError(error);
      return;
    }

    if (isItemUnavailable) {
      require('../utils/errorReporting').reportErrorAlert(
        'Subscription unavailable',
        'This subscription is not available for your account or region. Check that it\'s active in your country in Play Console and that you\'re signed in with a license tester account if required.'
      );
      return;
    }
    require('../utils/errorReporting').reportErrorAlert('Purchase Error', 'Something went wrong with the purchase.');
  });
};

export const cleanupIap = () => {
  if (purchaseUpdateSub) {
    purchaseUpdateSub.remove();
    purchaseUpdateSub = null;
  }
  if (purchaseErrorSub) {
    purchaseErrorSub.remove();
    purchaseErrorSub = null;
  }
};

/**
 * Restore previous purchases (iOS). Follows react-native-iap pattern:
 * getAvailablePurchases() → filter to our products → finishTransaction.
 * @param {string[]} [productIds] - Subscription product IDs to consider. Defaults to IOS_PRODUCT_IDS.
 * @param {{ validateAndGrant?: (purchase: import('react-native-iap').Purchase) => Promise<void> }} [options]
 *   - validateAndGrant: optional. Called for each restored purchase to validate (e.g. notify backend) and grant entitlement.
 *     If it throws, that purchase is not finished. If omitted, transactions are only finished locally.
 * @returns {Promise<import('react-native-iap').Purchase[]>} - Array of active, restored subscription purchases
 */
export const restorePurchases = async (productIds, options = {}) => {
  if (Platform.OS !== 'ios') return [];
  const RNIap = getRNIap();
  if (!RNIap) return [];
  const { validateAndGrant } = options;
  const ourProductIds = productIds && productIds.length > 0
    ? productIds
    : Object.values(IOS_PRODUCT_IDS);
  try {
    await initIap();
    const allPurchases = await RNIap.getAvailablePurchases();
    // const subscriptionPurchases = (allPurchases || []).filter(
    //   (p) => p?.productId && ourProductIds.includes(p.productId)
    // );
    // for (const purchase of subscriptionPurchases) {
    //   try {
    //     if (typeof validateAndGrant === 'function') {
    //       await validateAndGrant(purchase);
    //     }
    //     await RNIap.finishTransaction({ purchase, isConsumable: false });
    //   } catch (e) {
    //     console.warn('restorePurchases: validateAndGrant or finishTransaction:', e?.message);
    //     throw e;
    //   }
    // }
    return allPurchases;
  } catch (e) {
    console.error('restorePurchases error:', e);
    throw e;
  }
};
