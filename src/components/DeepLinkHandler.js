import React, { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import deepLinkingService from '../services/deepLinkingService';
import { Platform } from 'react-native';

/**
 * Subscribes to deep link events and navigates using the root navigation ref.
 * Auth: for auth-required routes, we still navigate to the target; the target screen shows sign-in prompt for guests.
 * Premium content: play routes navigate to player; paywall is shown by the player/screen when needed.
 */
export function useDeepLinkNavigation(navigationRef) {
  const unsubRef = useRef(null);
  const pendingDeepLinkRef = useRef(null);
  const pendingPlayLinkRef = useRef(null);
  const navigateRef = useRef(null);
  const { isAuthenticated, isGuestUser } = useAuth();
  const { isSubscribed, subscriptionReady, subscriptionRefreshedAfterAuth } = useSubscription();

  const navigate = useCallback(
    (parsed) => {
      const nav = navigationRef?.current;
      if (!nav) {
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const { route } = parsed;
      if (!isAuthenticated) {
        pendingDeepLinkRef.current = parsed;
        return;
      }

      const { pathParams: rawPathParams, queryParams: rawQueryParams } = parsed;
      const pathParams = rawPathParams && typeof rawPathParams === 'object' ? rawPathParams : {};
      const queryParams = rawQueryParams && typeof rawQueryParams === 'object' ? rawQueryParams : {};
      const params = { ...pathParams, ...queryParams };
      const autoplay = queryParams.autoplay === 'true' || queryParams.autoplay === true;
      const skipAuth = queryParams.skipAuth === 'true' || queryParams.skipAuth === true;

      // Play routes and subscribe route need subscription state to decide destination — wait until ready
      const isPlayRoute = [
        'play/episode', 'episode', 'play/show', 'show',
        'play/reel', 'play/promo', 'play/trailer', 'continue/show'
      ].includes(route);
      const isSubscribeRoute = route === 'subscribe' || route === 'subscribe/trial';
      if ((isPlayRoute || isSubscribeRoute) && !subscriptionReady) {
        if (isPlayRoute) pendingPlayLinkRef.current = parsed;
        else pendingDeepLinkRef.current = parsed;
        return;
      }

      // Logged-in users: wait until subscription API has run after auth so isSubscribed is correct for Reels vs TileDetails.
      // Phone OTP can persist user slightly after this; OAuth often wins the race — without this, subscribed users hit TileDetails.
      if (
        (isPlayRoute || isSubscribeRoute) &&
        isAuthenticated &&
        !isGuestUser &&
        !subscriptionRefreshedAfterAuth
      ) {
        if (isPlayRoute) pendingPlayLinkRef.current = parsed;
        else pendingDeepLinkRef.current = parsed;
        return;
      }

      // Subscribed + not guest → Reels. Unsubscribed or guest → Tile Details (Reels not accessible)
      const goToReels = isSubscribed && !isGuestUser;

      // When we're about to navigate for this play/subscribe link, clear any deferred link so it isn't processed again by useEffect
      if (isPlayRoute) pendingPlayLinkRef.current = null;
      if (isSubscribeRoute) pendingDeepLinkRef.current = null;

      if (!route) {
        nav.navigate('MainTabs', { screen: 'Home' });
        return;
      }

      try {
        switch (route) {
          case 'home':
            nav.navigate('MainTabs', { screen: 'Home', params: { bannerId: pathParams.bannerId, railId: pathParams.railId, ...queryParams } });
            break;
          case 'home/banner':
            nav.navigate('MainTabs', { screen: 'Home', params: { bannerId: pathParams.bannerId, ...queryParams } });
            break;
          case 'home/rail':
            nav.navigate('MainTabs', { screen: 'Home', params: { railId: pathParams.railId, ...queryParams } });
            break;
          case 'feeds':
            nav.navigate('MainTabs', { screen: 'Feeds', params: queryParams });
            break;
          case 'feeds/reel':
          case 'feeds/promo':
          case 'feeds/trailer': {
            const id = pathParams.reelId || pathParams.promoId || pathParams.trailerId;
            nav.navigate('MainTabs', { screen: 'Feeds', params: { reelId: id, ...queryParams } });
            break;
          }
          case 'watchlist':
            nav.navigate('MainTabs', { screen: 'My List', params: queryParams });
            break;
          case 'watchlist/show': {
            const showId = pathParams.showId;
            const asset = { path: showId, id: showId, seriesId: showId, title: 'Series', assetGroupId: showId };
            nav.navigate('MainTabs', { screen: 'My List', params: { screen: 'TileDetails', params: { asset, ...queryParams } } });
            break;
          }
          case 'search':
            nav.navigate('MainTabs', { screen: 'Search', params: queryParams });
            break;
          case 'search/query':
            nav.navigate('MainTabs', { screen: 'Search', params: { query: pathParams.term, ...queryParams } });
            break;
          case 'play/episode':
          case 'episode': {
            const episodeId = pathParams.episodeId;
            const showIdForEpisode = pathParams.showId || queryParams.showId;
            const pathForReels = showIdForEpisode || episodeId;
            const playbackSource = queryParams.playback_source || 'deep_link';
            if (goToReels) {
              nav.navigate('Reels', {
                path: pathForReels,
                episodeId,
                showId: showIdForEpisode,
                isSeries: true,
                isForYouPage: false,
                skipApiCall: false,
                playback_source: playbackSource,
                autoplay,
                ...queryParams,
              });
            } else {
              const pathOrShow = showIdForEpisode || episodeId;
              const asset = { path: pathOrShow, id: pathOrShow, seriesId: showIdForEpisode || pathOrShow, title: 'Series', assetGroupId: pathOrShow };
              nav.navigate('TileDetails', {
                asset,
                showId: showIdForEpisode,
                episodeId,
                fromDeepLink: true,
                ...queryParams,
              });
            }
            break;
          }
          case 'play/show':
          case 'show': {
            const showId = pathParams.showId || queryParams.showId;
            const playbackSource = queryParams.playback_source || 'deep_link';
            if (!showId) {
              // /show with no ID → go to Feeds (For You / content)
              nav.navigate('MainTabs', { screen: 'Feeds', params: queryParams });
              break;
            }
            if (goToReels) {
              nav.navigate('Reels', {
                path: showId,
                showId,
                isSeries: true,
                isForYouPage: false,
                skipApiCall: false,
                playback_source: playbackSource,
                autoplay: true,
                ...queryParams,
              });
            } else {
              const asset = { path: showId, id: showId, seriesId: showId, title: 'Series', assetGroupId: showId };
              nav.navigate('TileDetails', {
                asset,
                showId,
                fromDeepLink: true,
                ...queryParams,
              });
            }
            break;
          }
          case 'play/reel':
          case 'play/promo':
          case 'play/trailer': {
            const reelId = pathParams.reelId || pathParams.promoId || pathParams.trailerId;
            const playbackSource = queryParams.playback_source || 'deep_link';
            if (goToReels) {
              nav.navigate('Reels', { path: reelId, reelId, isSeries: false, isForYouPage: false, skipApiCall: false, playback_source: playbackSource, autoplay, ...queryParams });
            } else {
              const asset = { path: reelId, id: reelId, assetGroupId: reelId, title: 'Video' };
              nav.navigate('TileDetails', { asset, fromDeepLink: true, ...queryParams });
            }
            break;
          }
          case 'continue':
            nav.navigate('MainTabs', { screen: 'Home', params: queryParams });
            break;
          case 'starme':
            // StarME feature (own navigator + theme scope).
            nav.navigate('StarME');
            break;
          case 'continue/show': {
            const showIdForContinue = pathParams.showId || queryParams.showId;
            const playbackSource = queryParams.playback_source || 'notification_continue';
            if (!showIdForContinue) { nav.navigate('MainTabs', { screen: 'Home' }); break; }
            if (goToReels) {
              nav.navigate('Reels', {
                path: showIdForContinue,
                showId: showIdForContinue,
                isSeries: true,
                isForYouPage: false,
                skipApiCall: false,
                playback_source: playbackSource,
                autoplay: true,
                ...queryParams,
              });
            } else {
              const asset = { path: showIdForContinue, id: showIdForContinue, seriesId: showIdForContinue, title: 'Series', assetGroupId: showIdForContinue };
              nav.navigate('TileDetails', { asset, showId: showIdForContinue, fromDeepLink: true, ...queryParams });
            }
            break;
          }
          case 'search/category':
          case 'category': {
            // /search/category/{id} and /category/{id} (MoEngage) — same navigation
            const categoryIdFromSpec = pathParams.categoryId;
            nav.navigate('MainTabs', { screen: 'Search', params: { categoryId: categoryIdFromSpec, ...queryParams } });
            break;
          }
          case 'rich_landing': {
            // Internal route used by moengageNotificationHandler for external URLs
            const landingUrl = queryParams.url || params.url;
            if (landingUrl) {
              nav.navigate('RichLanding', { url: landingUrl, title: queryParams.title });
            } else {
              nav.navigate('MainTabs', { screen: 'Home' });
            }
            break;
          }
          case 'subscribe':
            // Paid user → Home; free user → Subscription (trial 1rs vs 399 based on isEligibleForSubscription / free_trial_eligible)
            if (isSubscribed) {
              nav.navigate('MainTabs', { screen: 'Home', params: queryParams });
            } else {
              nav.navigate(Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView', { ...queryParams });
            }
            break;
          case 'subscribe/trial':
            if (isSubscribed) {
              nav.navigate('MainTabs', { screen: 'Home', params: queryParams });
            } else {
              nav.navigate(Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView', { planId: pathParams.plan_id, trial: true, ...queryParams });
            }
            break;
          case 'profile':
            nav.navigate('MainTabs', { screen: 'Profile', params: queryParams });
            break;
          case 'profile/subscription':
            nav.navigate(Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView', queryParams);
            break;
          case 'profile/subscription/manage':
            nav.navigate('ManageSubscription', queryParams);
            break;
          case 'profile/history':
            nav.navigate('WatchHistory', queryParams);
            break;
          case 'profile/rewards':
            nav.navigate('MainTabs', { screen: 'Profile', params: { openRewards: true, ...queryParams } });
            break;
          case 'profile/settings':
            nav.navigate('Settings', queryParams);
            break;
          case 'rewards':
            nav.navigate('MainTabs', { screen: 'Profile', params: { openRewards: true, ...queryParams } });
            break;
          case 'rewards/unlock':
            nav.navigate('MainTabs', { screen: 'Profile', params: { openRewards: true, rewardId: pathParams.rewardId, ...queryParams } });
            break;
          default:
            nav.navigate('MainTabs', { screen: 'Home' });
        }
      } catch (err) {
        console.error('[Deeplink] navigate error', err);
        // Do not redirect to Home on error — avoids duplicate navigate throwing and sending user to Home.
      }
    },
    [
      navigationRef,
      isSubscribed,
      isAuthenticated,
      isGuestUser,
      subscriptionReady,
      subscriptionRefreshedAfterAuth,
    ]
  );

  navigateRef.current = navigate;

  useEffect(() => {
    // Process any pending deeplink (from ref when we were unauthenticated, or from cold-start URL)
    // only after BOTH subscriptionRefreshedAfterAuth AND subscriptionReady so isSubscribed is correct
    // and we don't navigate with stale state (which would then get overwritten by AuthScreen timeout).
    if (!isAuthenticated || !subscriptionRefreshedAfterAuth || !subscriptionReady) {
      return;
    }

    let parsed = null;
    const pendingUrl = deepLinkingService.getPendingInitialUrl();
    if (pendingUrl) {
      const url = deepLinkingService.getAndClearPendingInitialUrl();
      if (url) {
        parsed = deepLinkingService.parseDeepLink(url);
      }
    }
    if (!parsed && pendingDeepLinkRef.current) {
      parsed = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
    }

    if (!parsed) {
      return;
    }

    const route = parsed?.route;
    const needsSubscription = [
      'subscribe', 'subscribe/trial',
      'play/episode', 'episode', 'play/show', 'show',
      'play/reel', 'play/promo', 'play/trailer', 'continue/show',
    ].includes(route);

    const nav = navigationRef?.current;

    if (!nav) {
      deepLinkingService.setPendingParsed(parsed);
      return;
    }

    const isFeedsRoute = route === 'feeds' || (route && route.startsWith('feeds/'));
    if (nav && isFeedsRoute) {
      // Reset directly to MainTabs with Feeds selected so we don't rely on a timeout
      // (effect re-run can clear the timeout and leave user on Home).
      const pathParams = parsed.pathParams && typeof parsed.pathParams === 'object' ? parsed.pathParams : {};
      const queryParams = parsed.queryParams && typeof parsed.queryParams === 'object' ? parsed.queryParams : {};
      const feedParams = { ...pathParams, ...queryParams };
      if (route === 'feeds/reel' || route === 'feeds/promo' || route === 'feeds/trailer') {
        const id = pathParams.reelId || pathParams.promoId || pathParams.trailerId;
        if (id) feedParams.reelId = id;
      }
      nav.reset({
        index: 0,
        routes: [{
          name: 'MainTabs',
          state: {
            routes: [
              { name: 'Home' },
              { name: 'Feeds', params: feedParams },
              { name: 'My List' },
              { name: 'Search' },
              { name: 'Profile' },
            ],
            index: 1,
          },
        }],
      });
      deepLinkingService.setPostLoginDeeplinkHandled();
      return;
    }

    nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    deepLinkingService.setPostLoginDeeplinkHandled();

    if (needsSubscription) {
      if (route === 'subscribe' || route === 'subscribe/trial') {
        pendingDeepLinkRef.current = parsed;
      }
      // Do NOT set pendingPlayLinkRef here: subscriptionReady effect would run immediately and
      // call navigate() before reset commits. Do NOT return cleanup: effect re-run (e.g. subscriptionRefreshedAfterAuth
      // change) would cancel this timeout and the navigate would never run; we want the 80ms timeout to always fire.
      setTimeout(() => {
        if (navigateRef.current) navigateRef.current(parsed);
      }, 80);
      return;
    } else {
      setTimeout(() => {
        if (navigateRef.current) navigateRef.current(parsed);
      }, 100);
      return;
    }
  }, [isAuthenticated, subscriptionRefreshedAfterAuth, subscriptionReady]);

  useEffect(() => {
    if (!subscriptionReady || !subscriptionRefreshedAfterAuth) return;
    const playParsed = pendingPlayLinkRef.current;
    if (playParsed) {
      pendingPlayLinkRef.current = null;
      deepLinkingService.setPostLoginDeeplinkHandled();
      navigate(playParsed);
      return;
    }
    const deepParsed = pendingDeepLinkRef.current;
    const route = deepParsed?.route;
    if (deepParsed && (route === 'subscribe' || route === 'subscribe/trial')) {
      pendingDeepLinkRef.current = null;
      // User reached Subscription via this path (e.g. just logged in); ensure AuthScreen timeout does not reset to MainTabs.
      deepLinkingService.setPostLoginDeeplinkHandled();
      navigate(deepParsed);
    }
  }, [subscriptionReady, subscriptionRefreshedAfterAuth, navigate]);

  useEffect(() => {
    if (!navigationRef) return;
    unsubRef.current = deepLinkingService.subscribe(navigate);
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, [navigate, navigationRef]);
}

/**
 * Renders nothing; only subscribes to deep links and navigates.
 * Must be used inside NavigationContainer (with ref), AuthProvider, and SubscriptionProvider.
 */
export default function DeepLinkHandler({ navigationRef }) {
  useDeepLinkNavigation(navigationRef);
  return null;
}
