import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Must NOT contain substrings cleared by clearAllUserData() (e.g. 'guest', 'user', 'auth', 'token', 'subscription', 'profile')
const REDIRECT_AFTER_LOGIN_KEY = '@post_login_redirect';
const SUBSCRIPTION_STATUS_KEY = '@hungama_subscription_status';

/**
 * Common helper to redirect a guest user to the Auth flow.
 * Optionally stores where to send the user after they log in.
 *
 * @param {object} params
 * @param {object} params.navigation - React Navigation object
 * @param {Function} params.signOut - signOut function from AuthContext
 * @param {Function} [params.setIsLoggingOut] - optional state setter to show loading state while logging out
 * @param {boolean} [params.redirectToSubscriptionAfterLogin] - if true, after login go to Subscription (or SubscriptionWebView on Android). If user already subscribed, go to that TileDetails. Use for TileDetails "Subscribe to Watch".
 * @param {object} [params.redirectToSubscriptionAfterLoginPayload] - optional { asset }. Use with redirectToSubscriptionAfterLogin so we can open TileDetails when user is already subscribed.
 * @param {boolean} [params.redirectToSubscriptionFromHome] - if true, after login: if subscribed go to Home, else go to Subscription. Use for Home "3-days trial ₹1".
 * @param {object} [params.redirectToTileDetailsOrReelsAfterLogin] - after login: if subscribed go to Reels, else go to TileDetails. (Not used for "Login to Watch" – use redirectToTileDetailsAfterLogin instead.)
 * @param {object} [params.redirectToTileDetailsAfterLogin] - after login always go to TileDetails for this asset (no subscription check). Use for TileDetails "Login to Watch". Pass { asset }.
 * @param {boolean} [params.redirectToProfileAfterLogin] - if true, after login go to Profile tab. Use for Profile "Login to your account".
 */
export const redirectGuestToLogin = async ({
  navigation,
  signOut,
  setIsLoggingOut,
  redirectToSubscriptionAfterLogin,
  redirectToSubscriptionFromHome,
  redirectToTileDetailsOrReelsAfterLogin,
  redirectToTileDetailsAfterLogin,
  redirectToProfileAfterLogin,
  redirectToSubscriptionAfterLoginPayload,
}) => {
  try {
    if (setIsLoggingOut) {
      setIsLoggingOut(true);
    }

    // Store redirect intent before sign-out so it survives the auth flow
    let redirect = null;
    if (redirectToSubscriptionAfterLogin) {
      redirect = {
        type: 'subscription',
        ...(redirectToSubscriptionAfterLoginPayload && typeof redirectToSubscriptionAfterLoginPayload === 'object'
          ? { payload: redirectToSubscriptionAfterLoginPayload }
          : {}),
      };
      // Clear subscription cache so after login we don't use a previous user's cached "subscribed" state
      try {
        await AsyncStorage.removeItem(SUBSCRIPTION_STATUS_KEY);
      } catch (e) {
        // ignore
      }
    } else if (redirectToTileDetailsAfterLogin && typeof redirectToTileDetailsAfterLogin === 'object') {
      redirect = { type: 'tile_details_only', payload: redirectToTileDetailsAfterLogin };
    } else if (redirectToSubscriptionFromHome) {
      redirect = { type: 'subscription_from_home' };
    } else if (redirectToTileDetailsOrReelsAfterLogin && typeof redirectToTileDetailsOrReelsAfterLogin === 'object') {
      redirect = { type: 'tile_details_or_reels', payload: redirectToTileDetailsOrReelsAfterLogin };
    } else if (redirectToProfileAfterLogin) {
      redirect = { type: 'profile' };
    }
    if (redirect) {
      await AsyncStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, JSON.stringify(redirect));
    }

    const result = await signOut();

    if (result?.success) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Auth' }],
      });
    } else {
      require('./errorReporting').reportErrorAlert('Error', 'Failed to switch from guest. Please try again.');
    }
  } catch (error) {
    console.error('Guest redirect error:', error);
    Alert.alert('Error', 'Failed to switch from guest. Please try again.');
  } finally {
    if (setIsLoggingOut) {
      setIsLoggingOut(false);
    }
  }
};

/**
 * Read and clear the stored redirect-after-login intent.
 * Call after successful login to decide where to navigate.
 */
export const getAndClearRedirectAfterLogin = async () => {
  try {
    const raw = await AsyncStorage.getItem(REDIRECT_AFTER_LOGIN_KEY);
    await AsyncStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.type === 'string' ? parsed : null;
  } catch (e) {
    return null;
  }
};

/**
 * Apply post-login redirect: given the redirect intent and (if needed) subscription status,
 * perform the appropriate navigation reset.
 * @param {boolean} [subscriptionResultFromCache] - when true, subscription check used cache; for 'subscription' we prefer Subscription screen.
 */
export const applyPostLoginRedirect = ({ redirect, isSubscribed, navigation, subscriptionResultFromCache }) => {
  if (!redirect || !navigation) return;

  const { type, payload } = redirect;

  switch (type) {
    case 'subscription': {
      const asset = payload?.asset;
      if (asset && isSubscribed && !subscriptionResultFromCache) {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        navigation.navigate('MainTabs', { screen: 'Home', params: { screen: 'TileDetails', params: { asset } } });
      } else {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView' },
          ],
        });
      }
      break;
    }
    case 'tile_details_only': {
      const asset = payload?.asset;
      if (asset) {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        navigation.navigate('MainTabs', { screen: 'Home', params: { screen: 'TileDetails', params: { asset } } });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      }
      break;
    }
    case 'subscription_from_home': {
      if (isSubscribed) {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      } else {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView' },
          ],
        });
      }
      break;
    }
    case 'tile_details_or_reels': {
      const asset = payload?.asset;
      const path = payload?.path;
      const seriesData = payload?.seriesData;
      if (isSubscribed && (path || asset?.path)) {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            {
              name: 'Reels',
              params: {
                initialIndex: 0,
                path: path || asset?.path || asset?.id,
                isSeries: !!seriesData,
                isForYouPage: false,
                skipApiCall: false,
                playback_source: 'tile_details_after_login',
                seriesData: seriesData || (asset ? { title: asset.title, id: asset.id ?? asset.path, poster: asset.thumbFilePath } : undefined),
              },
            },
          ],
        });
      } else if (asset) {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        navigation.navigate('MainTabs', { screen: 'Home', params: { screen: 'TileDetails', params: { asset } } });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      }
      break;
    }
    case 'profile': {
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Profile' } }],
      });
      break;
    }
    default:
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }
};

/**
 * Run after login success: read redirect intent, optionally check subscription, then navigate.
 * Call from AuthScreen (Google/FB/Apple success) and OTPVerificationScreen.
 */
export const runPostLoginRedirect = async ({ navigation, checkSubscriptionStatus }) => {
  const redirect = await getAndClearRedirectAfterLogin();
  if (!redirect) return false;

  let isSubscribed = false;
  let subscriptionResultFromCache = false;
  if (redirect.type === 'subscription' || redirect.type === 'subscription_from_home' || redirect.type === 'tile_details_or_reels') {
    if (typeof checkSubscriptionStatus === 'function') {
      try {
        const result = await checkSubscriptionStatus();
        // Only treat as subscribed when we have an explicit successful result; treat failure or missing result as not subscribed
        if (result && result.success === true) {
          isSubscribed = result.isSubscribed === true;
          subscriptionResultFromCache = result.fallback === true;
        }
      } catch (e) {
        // keep isSubscribed false, go to Subscription for 'subscription' type
      }
    }
  }

  applyPostLoginRedirect({ redirect, isSubscribed, navigation, subscriptionResultFromCache });
  return true;
};
