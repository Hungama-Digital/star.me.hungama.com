import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Share,
  Alert,
  Image,
  Animated,
  BackHandler,
  PanResponder,
  FlatList,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import LottieLoader from '../components/LottieLoader';
import LazyImage from '../components/LazyImage';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Video } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSubscription } from '../context/SubscriptionContext';
import { useMyList } from '../context/MyListContext';
import { useFavourites } from '../context/FavouritesContext';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import { useDeepLinking } from '../hooks/useDeepLinking';
import { useSubscriptionCtaConfig } from '../hooks/useSubscriptionCtaConfig';
import { createUniversalLink } from '../utils/deepLinkUtils';
import { safeGoBack } from '../utils/navigationUtils';
import PlayIcon from '../components/PlayIcon';
import { redirectGuestToLogin } from '../utils/guestUtils';
import InteractiveChip from '../components/InteractiveChip';
import { useInteractiveEnabled } from '../context/InteractiveShowContext';
import SubscriptionFeedCard from '../components/SubscriptionFeedCard';
import { LikeIcon, SaveIcon, ShareIcon } from '../components/Icons';
import Toast from '../components/Toast';
import { useKeepAwake } from 'expo-keep-awake';
import { getSeriesGenres } from '../utils/assetUtils';
import NetInfo from "@react-native-community/netinfo";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
async function getNetworkTypeOnce() {
  const state = await NetInfo.fetch();
  // state.type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown' ...
  // state.details?.cellularGeneration: '2g' | '3g' | '4g' | '5g' | null
  return {
    isConnected: state.isConnected,
    type: state.type,
    cellularGeneration: state.details?.cellularGeneration ?? null,
  };
}
// Prefer useWindowDimensions() in component so layout updates when dimensions are ready (e.g. after deeplink)

// Scrub bar: cooldown after release so playback status doesn't overwrite thumb (avoids iOS flicker)
const SCRUB_COOLDOWN_MS = 450;

// Animated gradient for scrub/progress bars
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * Tile Details view: single full-screen view showing preview (trailer via preview_url / hlsUrl).
 * Can be used as standalone screen (with back button) or inside a feed (no back, shouldPlay from parent).
 */
export const TileDetailsView = ({
  asset: assetProp,
  navigation,
  showBackButton = true,
  shouldPlay = true,
  // Indicates that this TileDetails was opened directly from a deep link
  fromDeepLink = false,
  // Optional callback when video finishes (for autoplay functionality)
  onVideoFinished,
}) => {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const { user, isGuestUser, signOut } = useAuth();
  const { isSubscribed, isEligibleForSubscription } = useSubscription();
  const isInteractiveEnabled = useInteractiveEnabled();
  const { subscriptionCta } = useSubscriptionCtaConfig();
  const { addSeriesToMyList, removeSeriesFromMyList, isSeriesInMyList } = useMyList();
  const { isFavourite, addFavourite, removeFavourite } = useFavourites();
  const { pathForPlayShow } = useDeepLinking();

  const asset = assetProp || {};
  const previewUrl = asset.trailer_url || asset.trailerUrl || asset.preview_url || asset.previewUrl || '';
  const hasPreview = !!(previewUrl && previewUrl.startsWith('http'));
  const verticalImageUri =
    asset.verticalFilePath ||
    asset.horizontalFilePath ||
    asset.vodOrLivePosterImageFilePath ||
    asset.thumbnail ||
    asset.poster ||
    asset.imageUrl ||
    '';
  const title = asset.seriesTitle || asset.title || asset.label || 'Series';
  const path = asset.path || asset.id;
  const seriesId = asset.seriesId ? String(asset.seriesId) : (asset.assetGroupId?.toString() || path || asset.agdlmId?.toString());
  const seriesGenres = (() => {
    const g = asset.content_genre;
    if (Array.isArray(g)) {
      const first = g[0];
      if (first != null && typeof first === 'object' && (first.genreName != null || first.title != null)) {
        return g.map((item) => item.genreName ?? item.title ?? '').filter(Boolean).join(' · ');
      }
      return g.join(' · ');
    }
    if (typeof g === 'string') return g;
    const fallback = asset.genre;
    if (typeof fallback === 'string') return fallback;
    if (Array.isArray(fallback)) {
      return fallback.map((item) => typeof item === 'object' ? (item.genreName ?? item.title ?? '') : item).filter(Boolean).join(' · ') || '';
    }
    return '';
  })();

  const assetId = asset.assetId || asset.id || path;

  const [isLiked, setIsLiked] = useState(
    asset.isUserLikes === 1 || isFavourite(assetId)
  );
  const isLikedRef = useRef(isLiked);
  isLikedRef.current = isLiked;
  // Check saved status from context
  const isSaved = seriesId ? isSeriesInMyList(seriesId) : false;
  const [userSharedFromTrailer, setUserSharedFromTrailer] = useState(false);
  // expo-av keeps a stable playback callback; handlePlaybackStatusUpdate must not close over stale
  // engagement. Sync latest like/save/share into a ref each render and read it on didJustFinish.
  const trailerEngagementRef = useRef({ isLiked: false, isSaved: false, userShared: false });
  trailerEngagementRef.current = { isLiked, isSaved, userShared: userSharedFromTrailer };
  const [isPlaying, setIsPlaying] = useState(shouldPlay);
  const [hasUserPaused, setHasUserPaused] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(hasPreview);
  const [hasVideoFinished, setHasVideoFinished] = useState(false);
  const [tailerDuration, setTailerDuration] = useState(0);
  const [watchedDuration, setWatchedDuration] = useState(0);
  const [completionPercentage, setCompletionPercentage] = useState(0);

  const videoRef = useRef(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrubberTrackRef = useRef(null);
  const scrubberLayoutRef = useRef({ x: 0, width: windowDimensions.width });
  const isSeekingRef = useRef(false);
  const [isSeeking, setIsSeeking] = useState(false); // State for React re-renders
  const scrubInitialPageXRef = useRef(0);
  const scrubGestureLayoutRef = useRef(null);
  const lastScrubReleaseTimeRef = useRef(0);
  const seekToPageXRef = useRef(() => { });
  const tailerDurationRef = useRef(0);
  const scrubBarHeightAnim = useRef(new Animated.Value(3)).current; // Default height: 3px

  // Toast state (similar pattern as HomeScreen/ReelsScreen)
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const callTrailerWatchedEvents = (item, clickPerformed, pageName, overrides = {}) => {
    try {
      const analyticsService = require('../services/analytics').default;
      const properties = buildTrailerWatchedProperties(
        item,
        "Tile Details Screen",
        pageName,
        assetId,
        clickPerformed,
        overrides
      );
      analyticsService.logTrailerWatched(assetId, properties);
    } catch (error) {
      // Error logged
      return;
    }
  };
  const buildTrailerWatchedProperties = (item, sectionName, pageName, assetId, clickPerformed, overrides = {}) => {
    var userIdEvent = "", subscriptionTierEvent = "", subscriptionPlanName = "", isLoggedIn = "", languageEvent = "";
    if (isGuestUser) {
      userIdEvent = "";
      subscriptionTierEvent = "free";
      subscriptionPlanName = "free_plan";
      isLoggedIn = false;
      languageEvent = "en";
    }
    if (!isGuestUser && user) {
      userIdEvent = user?.userId || user?.uid || "";
      subscriptionTierEvent = isSubscribed ? "premium" : "free";
      subscriptionPlanName = isSubscribed ? (user.subscriptionPlanName || "premium_plan") : "free_plan";
      isLoggedIn = true;
      languageEvent = user.languagePreference || "en";
    }
    const contentId = String(assetId || '');

    const contentType = item?.assetType || item?.contentType || "series";
    let rawGenre = item?.seriesGenres || item?.genre || item?.geners || item?.content_genre || '';
    const genre = Array.isArray(rawGenre) ? rawGenre.join(' · ') : rawGenre;

    return {
      content_id: contentId,
      content_title: title,
      content_type: contentType,
      content_genre: genre,
      episode_title: item?.label || title,
      original_show_name: item?.originalShowName || item?.seriesTitle || title,
      original_show_id: item?.seriesId || item?.assetGroupId || item?.id || item?.path || "",
      trailer_duration: (() => {
        const ms =
          typeof tailerDurationRef.current === 'number' && tailerDurationRef.current > 0
            ? tailerDurationRef.current
            : typeof tailerDuration === 'number' && tailerDuration > 0
              ? tailerDuration
              : 0;
        return ms > 0 ? Math.floor(ms / 1000) : 0;
      })(),
      trailer_source: pageName,
      watch_duration: typeof watchedDuration === 'number' && watchedDuration > 0 ? Math.floor(watchedDuration / 1000) : 0,
      completion_percentage: completionPercentage ? Math.round(parseFloat(completionPercentage)) : 0,
      is_completed: false,
      playback_quality: 'Auto',
      User_did__action: clickPerformed,
      primary_cta: "Subscribe to Watch",
      reaction: isLiked ? 'Like' : 'None',
      user_saved: overrides.user_saved ?? isSaved,
      user_shared: userSharedFromTrailer,
      artwork_long_pressview: false,
      section_name: sectionName,
      page_name: pageName,
      user_id: userIdEvent,
      distinct_id: userIdEvent,
      subscription_tier: subscriptionTierEvent,
      subscription_plan_name: subscriptionPlanName,
      is_logged_in: isLoggedIn,
      language: languageEvent,

    };
  };
  const handlePlaybackStatusUpdate = useCallback((status) => {
    if (!status?.isLoaded) {
      // Still loading metadata / initial buffer
      setIsVideoLoading(true);
      return;
    }

    // Sync ref whenever native reports duration (avoids stale closure / 0 trailer_duration on didJustFinish).
    if (status.durationMillis != null && status.durationMillis > 0) {
      tailerDurationRef.current = status.durationMillis;
    }

    // Hide loader as soon as video is actually playing
    if (status.isPlaying) {
      setIsVideoLoading(false);

    } else if (status.isBuffering) {
      // Show loader only while explicitly buffering
      setIsVideoLoading(true);
    }

    if (status.didJustFinish) {
      progressAnim.setValue(0);
      setIsPlaying(false);
      setHasVideoFinished(true);
      setHasUserPaused(false); // Reset user pause state when video finishes
      // Fire trailer_watched when trailer completes (so it triggers in Mixpanel)
      try {
        const durationMs =
          status.durationMillis ??
          tailerDurationRef.current ??
          0;
        const watchMs = status.didJustFinish ? durationMs : (status.positionMillis ?? watchedDuration);
        const completionPct = durationMs > 0 ? Math.round((watchMs / durationMs) * 100) : 0;
        const trailerDurationSec = durationMs > 0 ? Math.floor(durationMs / 1000) : 0;
        const props = buildTrailerWatchedProperties(
          asset,
          'Tile Details Screen',
          'Tile Details Screen',
          assetId,
          'trailer_completed'
        );
        const eng = trailerEngagementRef.current;
        const analyticsService = require('../services/analytics').default;
        analyticsService.logTrailerWatched(assetId, {
          ...props,
          trailer_duration: trailerDurationSec,
          watch_duration: Math.floor(watchMs / 1000),
          completion_percentage: completionPct,
          is_completed: true,
          reaction: eng.isLiked ? 'Like' : 'None',
          user_saved: eng.isSaved,
          user_shared: eng.userShared,
        });
      } catch (e) {
        // ignore
      }
      // Feeds screen: notify parent to scroll to next; do not reset position or we'll replay before scroll completes
      if (onVideoFinished) {
        onVideoFinished();
        return;
      }
      // Standalone: reset video position to beginning so user can tap play again
      if (videoRef.current) {
        videoRef.current.setPositionAsync(0).catch(() => { });
      }
      return;
    }

    if (
      status.positionMillis != null &&
      status.durationMillis != null &&
      status.durationMillis > 0
    ) {
      tailerDurationRef.current = status.durationMillis;
      setTailerDuration(status.durationMillis);
      setWatchedDuration(status.positionMillis);
      setCompletionPercentage(((status.positionMillis / status.durationMillis) * 100).toFixed(2) + '%');
      const inScrubCooldown = lastScrubReleaseTimeRef.current > 0 && (Date.now() - lastScrubReleaseTimeRef.current) < SCRUB_COOLDOWN_MS;
      if (!isSeekingRef.current && !inScrubCooldown) {
        const progress = status.positionMillis / status.durationMillis;
        progressAnim.setValue(progress);
      }
    }

    // Update playing state based on actual playback status
    if (status.isPlaying !== undefined) {
      setIsPlaying(status.isPlaying);
    }
  }, [progressAnim, onVideoFinished]);

  // Sync playing state with shouldPlay prop
  useEffect(() => {
    if (!hasPreview || !videoRef.current) return;

    setIsVideoLoading(true);
    if (shouldPlay) {
      if (hasVideoFinished) {
        // Reset to beginning when user scrolls back to a completed trailer
        videoRef.current.setPositionAsync(0).catch(() => { });
        setHasVideoFinished(false);
      }
      videoRef.current.playAsync().catch(() => { });
      setIsPlaying(true);
      setHasUserPaused(false);
    } else {
      videoRef.current.pauseAsync().catch(() => { });
      setIsPlaying(false);
    }
  }, [shouldPlay, hasPreview, hasVideoFinished, onVideoFinished]);

  tailerDurationRef.current = tailerDuration;

  const measureScrubBar = useCallback(() => {
    if (scrubberTrackRef.current) {
      scrubberTrackRef.current.measureInWindow((x, y, width) => {
        if (width > 0) scrubberLayoutRef.current = { x, width };
      });
    }
  }, []);

  // Keep scrubber layout width in sync when window dimensions resolve (e.g. after deeplink)
  useEffect(() => {
    const w = windowDimensions.width;
    if (w > 0) {
      scrubberLayoutRef.current = { ...scrubberLayoutRef.current, width: w };
    }
  }, [windowDimensions.width]);

  const seekToPageX = useCallback((pageX, shouldSeekVideo = false, layoutOverride = null) => {
    const layout = layoutOverride && layoutOverride.width > 0
      ? layoutOverride
      : scrubberLayoutRef.current;
    const { x, width } = layout;
    const duration = tailerDurationRef.current;
    if (!width || !duration) return;
    const ratio = Math.min(1, Math.max(0, (pageX - x) / width));
    progressAnim.setValue(ratio);
    if (shouldSeekVideo) {
      const seekToMs = Math.floor(ratio * duration);
      videoRef.current?.setPositionAsync?.(seekToMs);
    }
  }, [progressAnim]);

  seekToPageXRef.current = seekToPageX;

  const scrubPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!tailerDurationRef.current,
        onStartShouldSetPanResponderCapture: () => !!tailerDurationRef.current,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          // Allow horizontal movement to trigger scrub
          return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
        },
        onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
          // Prefer horizontal movement for scrubbing
          return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
        },
        onPanResponderGrant: (evt) => {
          isSeekingRef.current = true;
          setIsSeeking(true); // Update state for React re-render
          const pageX = evt.nativeEvent.pageX;
          scrubInitialPageXRef.current = pageX;
          scrubGestureLayoutRef.current = { ...scrubberLayoutRef.current };
          seekToPageXRef.current(pageX, false, scrubGestureLayoutRef.current);
          // Animate scrub bar height increase
          Animated.timing(scrubBarHeightAnim, {
            toValue: 11, // 3px + 8px = 11px
            duration: 200,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderMove: (evt, gestureState) => {
          const { dx, dy } = gestureState;
          if (Math.abs(dy) >= Math.abs(dx)) return;
          const effectivePageX = scrubInitialPageXRef.current + dx;
          seekToPageXRef.current(effectivePageX, false, scrubGestureLayoutRef.current);
        },
        onPanResponderRelease: (evt, gestureState) => {
          const effectivePageX = scrubInitialPageXRef.current + gestureState.dx;
          seekToPageXRef.current(effectivePageX, true, scrubGestureLayoutRef.current);
          isSeekingRef.current = false;
          setIsSeeking(false); // Update state for React re-render
          lastScrubReleaseTimeRef.current = Date.now();
          scrubGestureLayoutRef.current = null;
          // Animate scrub bar height back to normal
          Animated.timing(scrubBarHeightAnim, {
            toValue: 3, // Back to default 3px
            duration: 200,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderTerminate: () => {
          isSeekingRef.current = false;
          setIsSeeking(false); // Update state for React re-render
          lastScrubReleaseTimeRef.current = Date.now();
          scrubGestureLayoutRef.current = null;
          // Animate scrub bar height back to normal
          Animated.timing(scrubBarHeightAnim, {
            toValue: 3, // Back to default 3px
            duration: 200,
            useNativeDriver: false,
          }).start();
        },
      }),
    []
  );

  const handleVideoTap = useCallback(async () => {
    if (!hasPreview || !videoRef.current) return;

    try {
      const status = await videoRef.current.getStatusAsync();
      if (status.isLoaded) {
        if (status.isPlaying) {
          await videoRef.current.pauseAsync();
          setIsPlaying(false);
          setHasUserPaused(true); // User manually paused
          setHasVideoFinished(false); // Reset finished state when user pauses
        } else {
          // If video has finished or is at/near the end, reset to beginning
          const isAtEnd = status.positionMillis >= (status.durationMillis - 100); // Within 100ms of end
          if (hasVideoFinished || isAtEnd) {
            await videoRef.current.setPositionAsync(0);
            setHasVideoFinished(false);
          }
          await videoRef.current.playAsync();
          setIsPlaying(true);
          setHasUserPaused(false); // User manually played
          setIsVideoLoading(true); // Show loading while starting playback
        }
      }
    } catch (error) {
      console.error('Error toggling video playback:', error);
    }
  }, [hasPreview, hasVideoFinished]);

  const getRootNavigation = useCallback(() => {
    let nav = navigation;
    while (nav?.getParent?.()) nav = nav.getParent();
    return nav;
  }, [navigation]);

  const handleSubscribeToWatch = useCallback(async () => {
    callTrailerWatchedEvents(asset, "Subscribe to Watch", "Tile Details Screen");
    // If user is a guest, redirect to login first; after login send to Subscription (or SubscriptionWebView on Android)
    if (isGuestUser) {
      await redirectGuestToLogin({
        navigation,
        signOut,
        redirectToSubscriptionAfterLogin: true,
        redirectToSubscriptionAfterLoginPayload: { asset },
      });
      return;
    }

    const rootNav = getRootNavigation();
    if (Platform.OS === 'ios') {
      rootNav?.navigate?.('Subscription');
    } else {
      rootNav?.navigate?.('SubscriptionWebView');
    }
    try {
      var userIdEvent = "", subscriptionTierEvent = "", subscriptionPlanName = "", isLoggedIn = "", languageEvent = "";
      if (isGuestUser) {
        userIdEvent = "";
        subscriptionTierEvent = "free";
        subscriptionPlanName = "free_plan";
        isLoggedIn = false;
        languageEvent = "en";
      }
      if (!isGuestUser && user) {
        userIdEvent = user?.userId || user?.uid || "";
        subscriptionTierEvent = isSubscribed ? "premium" : "free";
        subscriptionPlanName = isSubscribed ? (user.subscriptionPlanName || "premium_plan") : "free_plan";
        isLoggedIn = true;
        languageEvent = user.languagePreference || "en";
      }
      const analyticsService = require('../services/analytics').default;
      var properties = {
        content_id: path || '',
        content_title: title || 'Unknown',
        content_type: 'series',
        season_number: 1,
        total_episodes: asset?.assetCount ?? asset?.totalEpisodes ?? asset?.episodeCount ?? 1,
        page_name: "Tile Details Screen",
        button_name: "Subscribe to Watch",
        button_location: "Tile Details Screen",
        action_type: "subscription_required",
        reason_for_prompt: "premium_content_access",
        conversion_step: "subscription_prompt",
        user_id: userIdEvent,
        distinct_id: userIdEvent,
        subscription_tier: subscriptionTierEvent,
        subscription_plan_name: subscriptionPlanName,
        is_logged_in: isLoggedIn,
        language: languageEvent,
      }
      analyticsService.logSubscriptionButtonClicked(path, properties);
    } catch (error) {
      // Error logged
      return;
    }
  }, [getRootNavigation, isGuestUser, navigation, signOut]);

  const handleBackNavigation = useCallback(() => {
    safeGoBack(navigation);
  }, [navigation]);

  const handleGuestLoginRedirect = async () => {
    callTrailerWatchedEvents(asset, "Login to Watch Clicked", "Tile Details Screen");
    await redirectGuestToLogin({
      navigation,
      signOut,
      redirectToTileDetailsAfterLogin: { asset },
    });
  };

  const handleWatchSeries = useCallback(() => {
    callTrailerWatchedEvents(asset, "Watch Series", "Tile Details Screen");
    try {
      const analyticsService = require('../services/analytics').default;
      const subscriptionTier = isSubscribed ? 'premium' : 'free';
      const totalEps = asset?.assetCount ?? asset?.totalEpisodes ?? asset?.episodeCount ?? 1;
      analyticsService.logWatchActionClicked(path || seriesId, {
        content_id: path || seriesId || '',
        content_title: title || 'Unknown',
        content_type: 'series',
        episode_number: 1,
        episode_title: title || 'Episode 1',
        season_number: 1,
        total_episodes: totalEps,
        subscription_tier: subscriptionTier,
        access_type: 'paid_subscription',
        button_name: 'Watch Show',
        button_location: 'detail_page',
        is_first_episode: true,
        playback_source: 'watch_series_button',
        previous_page: fromDeepLink ? 'deep_link' : 'detail_page',
        page_name: 'Tile Details Screen',
      });
    } catch (e) {
      // ignore
    }
    const rootNav = getRootNavigation();
    rootNav?.navigate?.('Reels', {
      initialIndex: 0,
      path: path,
      isForYouPage: false,
      isSeries: true,
      skipApiCall: false,
      playback_source: 'watch_series_button',
      seriesData: {
        title,
        id: seriesId,
        poster: asset.thumbFilePath,
        genre: seriesGenres,
        seriesGenres: seriesGenres,
      },
    });
  }, [getRootNavigation, path, title, seriesId, asset, fromDeepLink, isSubscribed]);

  // Keep local like state in sync with favourites context and initial server flag
  useEffect(() => {
    setIsLiked(asset.isUserLikes === 1 || isFavourite(assetId));
  }, [asset.isUserLikes, assetId, isFavourite]);

  const handleLike = useCallback(async () => {
    if (!assetId && !path) return;

    // Block like for guest / unauthenticated users, matching watchlist behavior
    const userId = user?.userId || user?.uid || null;
    if (isGuestUser || !userId) {
      setToastMessage('Please login in to like this series');
      setToastType('error');
      setToastVisible(true);
      return;
    }

    const targetId = assetId || path;
    const nextLiked = !isLiked;

    // Optimistically update local + context state
    setIsLiked(nextLiked);
    if (nextLiked) {
      addFavourite(targetId);
    } else {
      removeFavourite(targetId);
    }

    try {
      if (nextLiked) {
        await API.assetfavourite({
          assetId: targetId,
          type: 1,
        });
      } else {
        await API.deleteAssetFavourite({
          assetId: targetId,
        });
      }
    } catch (e) {
      console.log('Error updating favourite state for asset:', e);
      // Revert local + context state on failure
      setIsLiked((prev) => !prev);
      if (nextLiked) {
        removeFavourite(targetId);
      } else {
        addFavourite(targetId);
      }
    }
  }, [assetId, path, isLiked, addFavourite, removeFavourite, user, isGuestUser]);

  const handleSave = useCallback(async () => {
    const userId = user?.userId || user?.uid || null;
    if (isGuestUser || !userId) {
      setToastMessage('Please login to add to watchlist');
      setToastType('error');
      setToastVisible(true);
      return;
    }

    if (!seriesId) {
      console.warn('No series ID found for watchlist toggle');
      return;
    }

    // Check current saved state from context
    const isCurrentlySaved = isSeriesInMyList(seriesId);

    setToastMessage(isCurrentlySaved ? 'Removed from My List' : 'Saved to My List');
    setToastType('success');
    setToastVisible(true);

    // Call centralized context functions (they handle API and optimistic updates)
    if (isCurrentlySaved) {
      const result = await removeSeriesFromMyList(seriesId, userId);
      if (!result.success) {
        setToastMessage('Failed to update My List');
        setToastType('error');
        setToastVisible(true);
      } else {
        callTrailerWatchedEvents(asset, "Remove from Watchlist", "Tile Details Screen", {
          user_saved: false,
        });
      }
    } else {
      const result = await addSeriesToMyList(seriesId, userId);
      if (!result.success) {
        setToastMessage('Failed to update My List');
        setToastType('error');
        setToastVisible(true);
      } else {
        callTrailerWatchedEvents(asset, "Add to Watchlist", "Tile Details Screen", {
          user_saved: true,
        });
      }
    }
  }, [seriesId, user, isGuestUser, isSeriesInMyList, addSeriesToMyList, removeSeriesFromMyList, asset]);

  const handleShare = useCallback(async () => {
    try {
      const totalEpisodes = asset.assetCount ?? asset.totalEpisodes ?? 20;
      const shareableLink = createUniversalLink(`play/episode/1`, { showId: seriesId });
      const shareTitle = `${title} - Episode 1 by Series Creator`;
      const shareMessage = `${shareTitle}\n\nEpisode 1 of ${totalEpisodes} - Amazing content to watch!\n\nWatch on FastTV: ${shareableLink}\n\n#FastTV #ShortVideos #Entertainment`;
      const result = await Share.share({
        title: shareTitle,
        message: shareMessage,
        url: Platform.OS === 'ios' ? undefined : shareableLink,
      }, { dialogTitle: 'Share' });
      // Android sometimes returns the string 'sharedAction' instead of the constant reference.
      const shared =
        result?.action === Share.sharedAction || result?.action === 'sharedAction';
      if (shared) {
        setUserSharedFromTrailer(true);
      }
    } catch (e) {
      console.log('Error sharing series:', e);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to share.');
    }
  }, [title, seriesId, asset.assetCount, asset.totalEpisodes, assetId, path]);

  // Bottom offset so scrub bar sits at tab bar top. App.js positions tab bar with Dimensions.get('screen').height
  // so we use the same reference: tab bar top = screenHeight - tabBarHeight; offset = containerHeight - tabBarTop.
  const [containerHeight, setContainerHeight] = useState(null);
  const screenHeight = Dimensions.get('screen').height;
  const effectiveBottomInset = (insets.bottom != null && insets.bottom > 0)
    ? insets.bottom
    : (Platform.OS === 'ios' ? (Platform.isPad ? 20 : 34) : 45);
  const tabBarHeight = 60 + effectiveBottomInset + 10;
  const tabBarTopScreen = screenHeight - tabBarHeight;
  const tabBarBottomOffset = showBackButton
    ? (containerHeight != null && screenHeight > 0
        ? Math.max(0, containerHeight - tabBarTopScreen)
        : tabBarHeight)
    : (Platform.OS === 'ios' ? 0 : 21);
  const contentAboveScrub = tabBarBottomOffset + 30; // metadata + right actions sit above scrub bar

  const onContainerLayout = useCallback((e) => {
    const { height } = e.nativeEvent.layout;
    if (typeof height === 'number' && height > 0) setContainerHeight(height);
  }, []);

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {hasPreview ? (
        <>
          <Video
            ref={videoRef}
            source={{ uri: previewUrl }}
            style={styles.video}
            shouldPlay={shouldPlay}
            isLooping={false}
            resizeMode="cover"
            useNativeControls={false}
            isMuted={false}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}

          />
          {/* Tap overlay for play/pause - positioned to avoid interfering with buttons */}
          <TouchableOpacity
            style={styles.videoTapArea}
            activeOpacity={1}
            onPress={handleVideoTap}
          >
            {/* Show play icon when user has manually paused OR video has finished */}
            {!isPlaying && (hasUserPaused || hasVideoFinished) && (
              <View style={styles.playPauseOverlay}>
                <PlayIcon size={64} color="#FFFFFF" backgroundColor='rgba(255, 255, 255, 0.3)' />
              </View>
            )}
          </TouchableOpacity>
          {isVideoLoading && !hasUserPaused && (
            <View style={styles.videoLoaderOverlay}>
              <LottieLoader size="large" />
            </View>
          )}
        </>
      ) : (
        <LazyImage
          source={verticalImageUri && verticalImageUri.startsWith('http') ? { uri: verticalImageUri } : require('../../assets/placeholder.png')}
          style={styles.coverImage}
          resizeMode="cover"
          priority
        />
      )}

      {/* Tiny bottom strip to prevent next screen peeking through by a few pixels; not full tab height to avoid black strip */}
      <View style={styles.bottomMask} />

      {/* Top bar: Back (left, optional) + Trial / Subscribe button (right) */}
      <View style={[styles.topOverlay, { paddingTop: 50 }]}>
        {showBackButton && navigation ? (
          <TouchableOpacity onPress={handleBackNavigation} activeOpacity={0.8}>
            <View style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}
        {!isSubscribed && (
          <TouchableOpacity
            onPress={handleSubscribeToWatch}
            activeOpacity={0.8}
          >
            {isEligibleForSubscription || isGuestUser ? (
              <LinearGradient
                colors={['#0B2A36', '#114255', '#0B2A36']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.trialButton}
              >
                <View style={styles.trialContent}>
                  <View style={styles.trialTextWrapper}>
                    <View style={styles.trialIconWrapper}>
                      <Text style={styles.trialLabel}>
                        FREE TRIAL
                      </Text>
                      <Svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <Path d="M3.70323 1.00028C3.79736 1.00036 3.89052 1.01764 3.97714 1.05114C4.06376 1.08464 4.14207 1.13368 4.20742 1.19528L8.80234 5.50924C8.92825 5.62767 8.99905 5.78565 8.99999 5.95035C9.00093 6.11505 8.93194 6.27373 8.80738 6.39334L4.21429 10.8002C4.08604 10.9233 3.90925 10.995 3.72281 10.9996C3.53637 11.0043 3.35555 10.9414 3.22014 10.8248C3.08472 10.7082 3.00579 10.5475 3.00071 10.378C2.99564 10.2086 3.06484 10.0442 3.19309 9.9211L7.32325 5.95793L3.19813 2.08315C3.10207 1.99307 3.03732 1.87928 3.01197 1.75596C2.98661 1.63265 3.00176 1.50526 3.05553 1.38972C3.10931 1.27418 3.19932 1.17556 3.31435 1.10623C3.42937 1.0369 3.5643 0.999937 3.70231 0.999877L3.70323 1.00028Z" fill="white" opacity={0.8} />
                      </Svg>
                    </View>
                    <Text style={styles.trialSubLabel}>{subscriptionCta.tile_details_trial_cta}</Text>
                  </View>
                </View>
                {/* <View style={[styles.trialWedge, { top: 15 }]}><TrialIcon /></View> */}
              </LinearGradient>
            ) : (
              <LinearGradient
                colors={['#0B2A36', '#114255', '#0B2A36']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.trialButton}
              >
                <View style={styles.trialContent}>
                  <View style={styles.trialTextWrapper}>
                    <View style={styles.trialIconWrapper}>
                      <Text style={styles.trialLabel}>
                        SUBSCRIBE
                      </Text>
                      <Svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <Path d="M3.70323 1.00028C3.79736 1.00036 3.89052 1.01764 3.97714 1.05114C4.06376 1.08464 4.14207 1.13368 4.20742 1.19528L8.80234 5.50924C8.92825 5.62767 8.99905 5.78565 8.99999 5.95035C9.00093 6.11505 8.93194 6.27373 8.80738 6.39334L4.21429 10.8002C4.08604 10.9233 3.90925 10.995 3.72281 10.9996C3.53637 11.0043 3.35555 10.9414 3.22014 10.8248C3.08472 10.7082 3.00579 10.5475 3.00071 10.378C2.99564 10.2086 3.06484 10.0442 3.19309 9.9211L7.32325 5.95793L3.19813 2.08315C3.10207 1.99307 3.03732 1.87928 3.01197 1.75596C2.98661 1.63265 3.00176 1.50526 3.05553 1.38972C3.10931 1.27418 3.19932 1.17556 3.31435 1.10623C3.42937 1.0369 3.5643 0.999937 3.70231 0.999877L3.70323 1.00028Z" fill="white" opacity={0.8} />
                      </Svg>
                    </View>
                    <Text style={styles.trialSubLabel}>{subscriptionCta.tile_details_subscribe_cta}</Text>
                  </View>
                </View>
                {/* <View style={[styles.trialWedge, { top: 15 }]}><TrialIcon /></View> */}
              </LinearGradient>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom left: title + genres + CTA - Hidden when scrubbing */}
      {!isSeeking && (
        <View style={[styles.metadataContainer, { bottom: contentAboveScrub }]}>
          {asset.is_interactive && isInteractiveEnabled ? (
            <View style={{ marginBottom: 6 }}>
              <InteractiveChip size="medium" />
            </View>
          ) : null}
          <Text style={styles.videoTitle}>{title}</Text>
          <Text style={styles.videoGenres}>{seriesGenres || 'Drama · Thriller'}</Text>
          <TouchableOpacity
            style={styles.inlineWatchNowButton}
            onPress={isGuestUser ? handleGuestLoginRedirect : isSubscribed ? handleWatchSeries : handleSubscribeToWatch}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#FFFFFF', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.inlineWatchNowGradient}
            >
              <Image
                source={require('../../assets/Play.png')}
                style={styles.playIcon}
                resizeMode="contain"
              />
              <Text style={styles.inlineWatchNowText}>
                {isGuestUser ? 'Login to Watch' : isSubscribed ? 'Watch Show' : 'Subscribe to Watch'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />

      {/* Right actions: Like, Save, Share - Hidden when scrubbing */}
      {!isSeeking && (
        <View style={[styles.rightActions, { bottom: contentAboveScrub }]}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
            <View style={styles.actionIconContainer}>
              <LikeIcon filled={isLiked} />
            </View>
            <Text style={styles.actionText}>Like</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleSave}>
            <View style={styles.actionIconContainer}>
              <SaveIcon filled={isSaved} />
            </View>
            <Text style={styles.actionText}>{isSaved ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <View style={styles.actionIconContainer}>
              <ShareIcon />
            </View>
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Progress bar - scrubbable track */}
      {hasPreview && shouldPlay && (
        <View style={[styles.scrubberContainer, { bottom: tabBarBottomOffset }]} pointerEvents="box-none">
          <View
            ref={scrubberTrackRef}
            style={styles.scrubberTrack}
            onLayout={measureScrubBar}
            collapsable={false}
            {...scrubPanResponder.panHandlers}
          >
            <View style={styles.scrubberTrackContainer} pointerEvents="box-none">
              <Animated.View
                style={[
                  styles.scrubberBackground,
                  {
                    height: scrubBarHeightAnim,
                  }
                ]}
                pointerEvents="none"
              >
                <AnimatedLinearGradient
                  colors={['#A8E6FF', '#0081B5']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.scrubberProgress,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.scrubberThumb,
                  {
                    left: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                    opacity: isSeeking ? 1 : 0, // Show white circle only when scrubbing
                  },
                ]}
                pointerEvents="none"
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",

  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  topOverlay: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    zIndex: 10,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 50,
    padding: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  backButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  trialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    paddingRight: 40,
    right: -20,
  },
  subscribeNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    right: 20,
  },
  trialContent: {
    position: 'relative',
    flexDirection: 'row',
    padding: 10,
    gap: 10,
  },
  trialTextWrapper: {
    flexDirection: 'column',
    gap: 2
  },
  trialIconWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.8,
  },
  trialLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    fontFamily: 'Product Sans',
    flexDirection: 'row',
    opacity: 0.8,
  },
  trialSubLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Product Sans',
  },
  trialWedge: {
    position: 'absolute',
    right: 20,
    zIndex: 1000,
  },
  crownIcon: {
    marginRight: 8,
  },
  trialButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    fontFamily: 'Product Sans',
  },
  metadataContainer: {
    position: 'absolute',
    left: 0,
    zIndex: 100, // Lower than scrub bar
    right: 100,
    paddingHorizontal: 15,
    zIndex: 10,
  },
  videoTitle: {
    fontFamily: Platform.select({
      ios: 'Product Sans',
      android: 'Product Sans',
      default: 'System',
    }),
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 30, // 100% of font size
    letterSpacing: 0,
    color: '#FFFFFF',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  videoGenres: {
    fontFamily: 'Product Sans',
    fontWeight: '500',
    fontSize: 15,
    lineHeight: 15, // 100% of font size
    letterSpacing: 0,
    color: '#e0e0e097',
    marginBottom: 8,
  },
  inlineWatchNowButton: {
    marginTop: 10,
    borderRadius: 10,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    zIndex: 1000,
  },
  inlineWatchNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 220,
    minHeight: 50,
  },
  playIcon: {
    width: 14,
    height: 14,
    tintColor: '#000000',
    marginRight: 8,
  },
  inlineWatchNowText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '600',
  },
  rightActions: {
    position: 'absolute',
    right: 20,
    alignItems: 'center',
    zIndex: 100, // Lower than scrub bar
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    minWidth: 40,
    minHeight: 57,
    justifyContent: 'center',
  },
  actionIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 50,
    padding: 11,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionText: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 11, // 100% of font size
    letterSpacing: 0,
    color: '#FFFFFF',
    marginTop: 7,
  },
  scrubberContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 10000, // Very high zIndex to ensure it's above all other elements
  },
  scrubberTrack: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0, // Increased padding for better touch target
    paddingTop: 20,
  },
  scrubberTrackContainer: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  scrubberBackground: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  scrubberProgress: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 1.5,
  },
  scrubberThumb: {
    position: 'absolute',
    top: '50%',
    marginTop: -5,
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    zIndex: 2,
  },
  videoTapArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    // Tap area covers video but buttons with higher z-index (10+) will receive touches first
    // This ensures buttons remain clickable while video area can be tapped for play/pause
  },
  videoLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  playPauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 1,
  },
  playPauseIcon: {
    opacity: 0.8,
  },
  bottomMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: '#000',
    zIndex: 100,
  },
});

/**
 * Map getAssetGroupDetails / getAssetListing response to asset shape for TileDetailsView.
 */
function mapGroupDetailsToAsset(d, pathOrShowId) {
  const path = d?.path?.toString() || pathOrShowId?.toString();
  return {
    path,
    id: d?.id ?? path,
    seriesId: d?.id ?? path,
    assetGroupId: d?.id ?? path,
    agdlmId: d?.agdlmId ?? d?.id,
    title: d?.title || d?.label || 'Series',
    seriesTitle: d?.title || d?.label || 'Series',
    label: d?.label || d?.title,
    horizontalFilePath: d?.horizontalFilePath || d?.uploadHorizontalImage,
    verticalFilePath: d?.verticalFilePath,
    thumbnail: d?.thumbnail || d?.verticalFilePath || d?.horizontalFilePath,
    poster: d?.poster || d?.thumbFilePath,
    imageUrl: d?.imageUrl || d?.horizontalFilePath,
    preview_url: d?.previewUrl || d?.trailerUrl || d?.preview_url,
    previewUrl: d?.previewUrl || d?.trailerUrl || d?.videoUrl,
    videoUrl: d?.videoUrl || d?.previewUrl || d?.trailerUrl,
    hlsUrl: d?.hlsUrl || d?.videoUrl,
    seriesGenres: Array.isArray(d?.genre) ? d.genre : (d?.genre ? [d.genre] : ''),
    genre: d?.genre,
    description: d?.description,
    assetCount: d?.assetCount ?? d?.totalEpisodes ?? 0,
    isUserLikes: d?.isUserLikes ?? 0,
  };
}

/**
 * Tile Details screen: uses TileDetailsView with route params and back button.
 * When opened with only showId (e.g. deep link), fetches show details and first-episode preview.
 */
const TileDetailsScreen = ({ navigation, route }) => {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const assetFromParams = params.asset || (params.showId ? {
    path: params.showId,
    id: params.showId,
    seriesId: params.showId,
    title: 'Series',
    assetGroupId: params.showId,
  } : null);
  const initialAsset = assetFromParams || params || {};
  const pathForFetch = initialAsset.path || initialAsset.id || params.showId;

  const { isGuestUser } = useAuth();
  const { isSubscribed, isEligibleForSubscription } = useSubscription();
  const { height: windowHeight } = useWindowDimensions();

  const subscriptionFlatListRef = useRef(null);
  /** 0 = tile details (trailer), 1 = subscription. Pause trailer when user swipes to subscription. */
  const [subscriptionListVisibleIndex, setSubscriptionListVisibleIndex] = useState(0);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const idx = viewableItems[0].index;
      if (typeof idx === 'number') setSubscriptionListVisibleIndex(idx);
    }
  }).current;

  const [fetchedAsset, setFetchedAsset] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const needToFetchDetails = pathForFetch && (
    (!initialAsset.preview_url && !initialAsset.previewUrl && !initialAsset.videoUrl && !initialAsset.hlsUrl) &&
    (initialAsset.title === 'Series' || !initialAsset.seriesTitle || !initialAsset.horizontalFilePath)
  );

  // Align with ReelsScreen / EpisodesScreen: use only getAssetListing (no getAssetGroupDetails).
  // getAssetGroupDetails (GET /assetgroup?filter=...) is not reachable from some networks.
  useEffect(() => {
    if (!needToFetchDetails || !pathForFetch) {
      if (!needToFetchDetails) setLoadingDetails(false);
      return;
    }

    setLoadingDetails(true);

    const minimalAsset = {
      path: pathForFetch,
      id: initialAsset.id ?? pathForFetch,
      seriesId: initialAsset.seriesId ?? pathForFetch,
      assetGroupId: initialAsset.assetGroupId ?? pathForFetch,
      agdlmId: initialAsset.agdlmId ?? pathForFetch,
      title: initialAsset.title || initialAsset.seriesTitle || initialAsset.label || 'Series',
      seriesTitle: initialAsset.seriesTitle || initialAsset.title || initialAsset.label || 'Series',
      label: initialAsset.label || initialAsset.title || 'Series',
      horizontalFilePath: initialAsset.horizontalFilePath || initialAsset.verticalFilePath || initialAsset.thumbnail || initialAsset.poster || initialAsset.imageUrl,
      verticalFilePath: initialAsset.verticalFilePath || initialAsset.horizontalFilePath || initialAsset.thumbnail,
      thumbnail: initialAsset.thumbnail || initialAsset.verticalFilePath || initialAsset.horizontalFilePath,
      poster: initialAsset.poster || initialAsset.thumbFilePath,
      imageUrl: initialAsset.imageUrl || initialAsset.horizontalFilePath,
      seriesGenres: initialAsset.seriesGenres || initialAsset.genre,
      genre: initialAsset.genre,
      description: initialAsset.description,
      assetCount: initialAsset.assetCount ?? 0,
      isUserLikes: initialAsset.isUserLikes ?? 0,
    };

    console.log('INFO -> pathForFetch', pathForFetch);

    API.getAssetGroupDetails({ filter: JSON.stringify({ path: pathForFetch.toString() }) })
      .then((groupDetailsData) => {
        if (minimalAsset.preview_url) return;
        const groupDetailsDecoded = API.decodeJwtToken(groupDetailsData);
        console.log('INFO -> groupDetailsDecoded', groupDetailsDecoded);
        const assetData = groupDetailsDecoded?.data[0];
        if (assetData) {
          const previewUrl = assetData.hlsUrl || assetData.videoUrl || assetData.streamingUrl || assetData.url;
          if (previewUrl) {
            minimalAsset.preview_url = previewUrl;
            minimalAsset.previewUrl = previewUrl;
            minimalAsset.videoUrl = previewUrl;
            minimalAsset.hlsUrl = previewUrl;
          }
        }
        minimalAsset.assetCount = assetData?.assetCount ?? assetData?.totalEpisodes ?? 0;
        const seriesTitleFromApi = assetData?.title ?? assetData?.seriesTitle ?? assetData?.label ?? assetData?.title;
        if (seriesTitleFromApi) {
          minimalAsset.seriesTitle = seriesTitleFromApi;
          minimalAsset.title = seriesTitleFromApi;
          minimalAsset.label = seriesTitleFromApi;
        }
        minimalAsset.seriesGenres = getSeriesGenres(assetData);
        minimalAsset.genre = assetData?.genre ?? [];
        minimalAsset.description = assetData?.description ?? '';
        minimalAsset.isUserLikes = assetData?.isUserLikes ?? 0;
        setFetchedAsset(minimalAsset);
        setLoadingDetails(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(err?.message || 'Failed to load episodes');
          setFetchedAsset(minimalAsset);
          setLoadingDetails(false);
        }
      });
  }, [needToFetchDetails, pathForFetch]);

  const asset = fetchedAsset || initialAsset;

  // Handle Android hardware back: go back or go to Home
  useEffect(() => {
    const backAction = () => {
      safeGoBack(navigation);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        // Don't auto-go-back when screen loses focus (user should use back button)
      };
    }, [navigation])
  );

  const isFocused = useIsFocused();
  const autoplayFromParams = params?.autoplay;
  const fromDeepLink = !!params?.fromDeepLink;

  if (loadingDetails) {
    return (
      <View style={[screenStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LottieLoader size="large" />
        <Text style={screenStyles.loadingDetailText}>Loading...</Text>
      </View>
    );
  }
  if (fetchError) {
    return (
      <View style={[screenStyles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={screenStyles.errorDetailText}>{fetchError}</Text>
        <TouchableOpacity onPress={() => safeGoBack(navigation)} style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#FF6B6B', borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // When user is logged-in and unsubscribed: wrap in FlatList so scroll-up shows SubscriptionFeedCard after trailer.
  const showSubscriptionAfterTrailer = !isGuestUser && !isSubscribed;

  if (showSubscriptionAfterTrailer) {
    // Match ForYouScreen: leave space for tab bar so footer content isn't hidden when opened from Home/tile click.
    const isIpad = Platform.OS === 'ios' && Platform.isPad;
    const tabHeightIos = 60 + ((insets.bottom != null && insets.bottom > 0) ? insets.bottom : (isIpad ? 20 : 34)) + 10;
    const originalAndroidTabBarOffset = 60 + (insets.bottom || 0) + 8;
    
    // The cell length is always the full screen height
    const itemLength = windowHeight;
    const tabBarBottomOffset = Platform.OS === 'ios' ? tabHeightIos : originalAndroidTabBarOffset;
    const listData = [
      { type: 'tileDetails', key: 'tile' },
      { type: 'subscription', key: 'subscription' },
    ];
    const posterImage = asset.thumbFilePath
      || asset.verticalFilePath
      || asset.horizontalFilePath
      || asset.vodOrLivePosterImageFilePath
      || asset.thumbnail
      || asset.poster
      || asset.imageUrl
      || null;
    const subscriptionMode = isEligibleForSubscription ? 'guest' : 'free';

    const getRootNavigation = () => {
      let nav = navigation;
      while (nav?.getParent?.()) nav = nav.getParent();
      return nav;
    };

    return (
      <View style={[screenStyles.container, { flex: 1 }]}>
        <FlatList
          ref={subscriptionFlatListRef}
          data={listData}
          keyExtractor={(item) => item.key}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={itemLength}
          snapToAlignment="start"
          decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.998}
          disableIntervalMomentum
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          getItemLayout={(_, index) => ({ length: itemLength, offset: itemLength * index, index })}
          renderItem={({ item }) => {
            if (item.type === 'tileDetails') {
              const isTileDetailsVisible = subscriptionListVisibleIndex === 0;
              return (
                <View style={{ height: itemLength, width: '100%' }}>
                  <TileDetailsView
                    asset={asset}
                    navigation={navigation}
                    showBackButton={true}
                    shouldPlay={isTileDetailsVisible && (autoplayFromParams !== undefined ? autoplayFromParams : isFocused)}
                    fromDeepLink={fromDeepLink}
                    onVideoFinished={() => {
                      try {
                        subscriptionFlatListRef.current?.scrollToIndex({ index: 1, animated: true });
                      } catch (e) {
                        subscriptionFlatListRef.current?.scrollToOffset({ offset: itemLength, animated: true });
                      }
                    }}
                  />
                </View>
              );
            }
            if (item.type === 'subscription') {
              return (
                <View style={[{ height: itemLength, width: '100%', paddingBottom: tabBarBottomOffset }]}>
                  <SubscriptionFeedCard
                    mode={subscriptionMode}
                    posterImage={posterImage}
                    onPrimaryPress={() => {
                      const rootNav = getRootNavigation();
                      if (!rootNav) return;
                      if (Platform.OS === 'ios') {
                        rootNav.navigate('Subscription');
                      } else {
                        rootNav.navigate('SubscriptionWebView');
                      }
                    }}
                  />
                </View>
              );
            }
            return null;
          }}
        />
      </View>
    );
  }

  return (
    <TileDetailsView
      asset={asset}
      navigation={navigation}
      showBackButton={true}
      // If deep link (or caller) explicitly wants autoplay, honour that; otherwise tie to focus
      shouldPlay={autoplayFromParams !== undefined ? autoplayFromParams : isFocused}
      fromDeepLink={fromDeepLink}
    />
  );
};

const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingDetailText: { color: '#fff', marginTop: 12, fontSize: 16 },
  errorDetailText: { color: '#FF6B6B', fontSize: 16 },
});

export default TileDetailsScreen;
