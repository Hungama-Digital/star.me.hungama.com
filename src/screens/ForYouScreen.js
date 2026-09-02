import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  BackHandler,
  FlatList,
  Dimensions,
  Platform,
  AppState,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBar } from '../context/TabBarContext';
import { useAutoplay } from '../context/AutoplayContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import API, { API_CONFIG } from '../services/api';
import { TileDetailsView } from './TileDetailsScreen';
import LottieLoader from '../components/LottieLoader';
import SubscriptionFeedCard from '../components/SubscriptionFeedCard';
import { redirectGuestToLogin } from '../utils/guestUtils';

const { height: screenHeight } = Dimensions.get('screen');

/**
 * Feeds (For You) screen: vertical scroll of series tiles.
 * Scroll view fills viewport above footer; we measure that height and use it for each item
 * so one item = one viewport (no gap, no next video peeking in).
 */
const ForYouScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { setIsForYouPlaying } = useTabBar();
  const { autoplayEnabled } = useAutoplay();
  const { isGuestUser, isAuthenticated, signOut } = useAuth();
  const { isSubscribed, isEligibleForSubscription } = useSubscription();

  const [feedData, setFeedData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const currentIndexRef = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const flatListRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const scrollOffsetRef = useRef(0);
  const hasInitializedScrollRef = useRef(false);
  const isLoopingRef = useRef(false);
  const [isPaywallVisible, setIsPaywallVisible] = useState(false);

  // Helper to get root navigation (top-level stack) for subscription navigation
  const getRootNavigation = useCallback(() => {
    let nav = navigation;
    while (nav?.getParent?.()) {
      nav = nav.getParent();
    }
    return nav;
  }, [navigation]);

  // After Facebook/Google login the app returns from browser; viewport can change but onLayout won't re-fire.
  // Remount the list container when app becomes active so we re-measure and use the current viewport.
  // Only on iOS: on Android, opening the share sheet briefly sends app to background; when user
  // dismisses it (click outside) we'd remount the list and jump back to first video — so skip reset on Android.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'background' && nextState === 'active') {
        // iOS app state remount logic removed as layout is now statically calculated

      }
      appStateRef.current = nextState;
    });
    return () => sub?.remove?.();
  }, []);

  // iOS/iPad only: use window height and effectiveBottomInset so feed item height fills viewport (no next-video peek).
  // Android: keep existing formula and screen height — no change.
  const isIpad = Platform.OS === 'ios' && Platform.isPad;
  const tabHeight = Platform.OS === 'ios'
    ? 60 + ((insets.bottom != null && insets.bottom > 0) ? insets.bottom : (isIpad ? 20 : 34)) + 10
    : 60 + (Math.max(insets.bottom || 0, 24)) + 10;
  const itemHeight = Platform.OS === 'ios' ? (windowHeight - tabHeight) : (screenHeight - tabHeight);

  // Store itemHeight in ref for use in callbacks
  const itemHeightRef = useRef(itemHeight);
  useEffect(() => {
    itemHeightRef.current = itemHeight;
  }, [itemHeight]);

  useEffect(() => {
    const backAction = () => {
      navigation.navigate('Home');
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [navigation]);

  const fetchFeedData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await API.getForYou({
        start: 0,
        limit: 50,
        filter: {
          deviceTypeId: API_CONFIG.deviceTypeId,
          languageId: 1,
        },
      });
      const decoded = API.decodeJwtToken(response);
      if (decoded?.success && decoded?.data?.data && Array.isArray(decoded.data.data)) {
        const list = decoded.data.data.map((item, index) => ({
          ...item,
          id: item.agdlmId?.toString() || item.path?.toString() || `feed_${index}`,
        }));
        setFeedData(list);
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      setError(err.message || 'Failed to load Feeds content');
    } finally {
      setIsLoading(false);
    }
    try {
      const currentVideo = videoData[currentIndex];
      if (!currentVideo) {
        return;
      }
      const analyticsService = require('../services/analytics').default;
      var properties = {
        content_id: currentVideo.id || '',
        content_title: currentVideo.title || 'Unknown',
        content_type: 'episode',
        episode_number: currentIndex + 1 || '',
        season_number: 1,
        episode_title: currentVideo.title || '',
        page_name: "Reels",
        button_name: "Subscribe to Watch",
        button_location: "player_screen",
        action_type: "subscription_required",
        reason_for_prompt: "premium_content_access",
        conversion_step: "subscription_prompt"
      }
      analyticsService.logSubscriptionButtonClicked(currentVideo.id, properties);
    } catch (error) {
      return;
    }
  }, []);

  useEffect(() => {
    fetchFeedData();
  }, []);

  // Keep footer visible on Feeds; stop preview when leaving so it doesn't play in background
  useFocusEffect(
    useCallback(() => {
      setIsForYouPlaying(false);
      setIsScreenFocused(true);
      return () => {
        setIsScreenFocused(false);
      };
    }, [setIsForYouPlaying])
  );

  const itemLength = itemHeight;

  /**
   * Build logical feed items: sequence of videos + subscription paywalls.
   * Paywall is inserted after every 3 videos when user is not subscribed.
   */
  const { logicalFeed, videoIndexToLogicalIndex } = useMemo(() => {
    const result = { logicalFeed: [], videoIndexToLogicalIndex: {} };
    if (!feedData || feedData.length === 0) return result;

    // If subscribed, just show videos
    if (isSubscribed) {
      result.logicalFeed = feedData.map((asset, idx) => ({
        type: 'video',
        asset,
        videoIndex: idx,
      }));
      result.videoIndexToLogicalIndex = Object.fromEntries(
        result.logicalFeed.map((item, idx) => [item.videoIndex, idx]),
      );
      return result;
    }

    const items = [];
    const indexMap = {};
    let videosSincePaywall = 0;

    feedData.forEach((asset, videoIndex) => {
      const logicalIndex = items.length;
      items.push({ type: 'video', asset, videoIndex });
      indexMap[videoIndex] = logicalIndex;
      videosSincePaywall += 1;

      if (videosSincePaywall === 3) {
        items.push({
          type: 'paywall',
          key: `paywall_${videoIndex}`,
        });
        videosSincePaywall = 0;
      }
    });

    result.logicalFeed = items;
    result.videoIndexToLogicalIndex = indexMap;
    return result;
  }, [feedData, isSubscribed]);

  // Create extended data array for circular scrolling on logical items:
  // [all logical items] + [first items]
  const extendedData = useMemo(() => {
    if (!logicalFeed || logicalFeed.length === 0) return [];
    if (logicalFeed.length === 1) return logicalFeed;

    const duplicateCount = Math.min(3, logicalFeed.length);
    const firstItems = logicalFeed.slice(0, duplicateCount);

    return [...logicalFeed, ...firstItems];
  }, [logicalFeed]);

  const startIndex = 0;

  // Map extended index → logical index inside base logicalFeed
  const getLogicalIndex = useCallback(
    (extendedIndex) => {
      if (!logicalFeed || logicalFeed.length === 0) return 0;

      const realItemsLength = logicalFeed.length;
      if (extendedIndex < realItemsLength) {
        return extendedIndex;
      }
      return extendedIndex - realItemsLength;
    },
    [logicalFeed],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
    waitForInteraction: false,
    minimumViewTime: 200,
  }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      if (viewableItems.length === 0 || viewableItems[0].index == null || logicalFeed.length === 0) {
        return;
      }

      const extendedIdx = viewableItems[0].index;

      const realItemsLength = logicalFeed.length;
      if (extendedIdx >= realItemsLength && !isLoopingRef.current) {
        return;
      }

      const logicalIdx = getLogicalIndex(extendedIdx);
      const item = logicalFeed[logicalIdx];
      if (!item) return;

      if (item.type === 'paywall') {
        setIsPaywallVisible(true);
        return;
      }

      setIsPaywallVisible(false);
      currentIndexRef.current = item.videoIndex;
      setCurrentIndex(item.videoIndex);
    },
    [logicalFeed, getLogicalIndex],
  );

  // Handle video finished - autoplay to next logical item (may be paywall) if enabled.
  const handleVideoFinished = useCallback(() => {
    if (!autoplayEnabled || logicalFeed.length === 0) {
      return;
    }

    const currentVideoIdx = currentIndexRef.current;
    const logicalIdxForVideo = videoIndexToLogicalIndex[currentVideoIdx];
    if (logicalIdxForVideo == null) return;

    const nextLogicalIdx = (logicalIdxForVideo + 1) % logicalFeed.length;
    const nextExtendedIndex = startIndex + nextLogicalIdx;

    if (flatListRef.current) {
      try {
        flatListRef.current.scrollToIndex({
          index: nextExtendedIndex,
          animated: true,
        });
      } catch (error) {
        try {
          const nextOffset = nextExtendedIndex * itemLength;
          flatListRef.current.scrollToOffset({
            offset: nextOffset,
            animated: true,
          });
          scrollOffsetRef.current = nextOffset;
        } catch (fallbackError) {
          console.error('Error scrolling to next item:', fallbackError);
        }
      }
    }
  }, [autoplayEnabled, logicalFeed.length, videoIndexToLogicalIndex, startIndex, itemLength]);

  const renderItem = useCallback(
    ({ item, index }) => {
      // Map extended index to logical feed index
      const logicalIdx = getLogicalIndex(index);
      const logicalItem = logicalFeed[logicalIdx];

      if (!logicalItem) {
        return null;
      }

      if (logicalItem.type === 'paywall') {
        // Show "Start Trial" UI if: guest user OR logged-in user eligible for subscription
        // Show "Subscribe Now" UI if: logged-in user NOT eligible for subscription
        const mode = isGuestUser || isEligibleForSubscription ? 'guest' : 'free';
        
        // Get the previous video's poster image (the video before this paywall)
        let posterImage = null;
        if (logicalIdx > 0) {
          const previousItem = logicalFeed[logicalIdx - 1];
          if (previousItem && previousItem.type === 'video' && previousItem.asset) {
            const asset = previousItem.asset;
            posterImage = asset.verticalFilePath || 
                         asset.horizontalFilePath || 
                         asset.vodOrLivePosterImageFilePath ||
                         asset.thumbnail || 
                         asset.poster || 
                         asset.imageUrl || 
                         null;
          }
        }
        
        return (
          <View style={{ height: itemHeight, width: '100%', overflow: 'hidden' }}>
            <SubscriptionFeedCard
              mode={mode}
              posterImage={posterImage}
              onPrimaryPress={async () => {
                // If guest user, redirect to login first, then subscription after login
                if (isGuestUser) {
                  await redirectGuestToLogin({
                    navigation,
                    signOut,
                    redirectToSubscriptionAfterLogin: true,
                  });
                } else {
                  // Logged-in free user: navigate directly to subscription
                  const rootNav = getRootNavigation();
                  if (!rootNav) return;
                  if (Platform.OS === 'ios') {
                    rootNav.navigate('Subscription');
                  } else {
                    rootNav.navigate('SubscriptionWebView');
                  }
                }
              }}
            />
          </View>
        );
      }

      const realVideoIndex = logicalItem.videoIndex;

      return (
        <View style={{ height: itemHeight, width: '100%', overflow: 'hidden' }}>
          <TileDetailsView
            asset={logicalItem.asset}
            navigation={navigation}
            showBackButton={false}
            shouldPlay={currentIndex === realVideoIndex && isScreenFocused && !isPaywallVisible}
            onVideoFinished={currentIndex === realVideoIndex ? handleVideoFinished : undefined}
          />
        </View>
      );
    },
    [
      navigation,
      currentIndex,
      itemHeight,
      isScreenFocused,
      handleVideoFinished,
      getLogicalIndex,
      logicalFeed,
      isGuestUser,
      getRootNavigation,
      isPaywallVisible,
    ],
  );

  const keyExtractor = useCallback((item, index) => {
    const base =
      item.type === 'paywall'
        ? item.key || 'paywall'
        : item.asset?.id?.toString() || String(item.asset?.path || index);
    return `${base}_${index}`;
  }, []);
  
  const getItemLayout = useCallback(
    (_, index) => ({
      length: itemLength,
      offset: itemLength * index,
      index,
    }),
    [itemLength]
  );
  
  // Handle scroll for circular looping in both directions
  const handleScroll = useCallback((event) => {
    if (!logicalFeed || logicalFeed.length === 0 || logicalFeed.length === 1 || isLoopingRef.current) {
      if (!isLoopingRef.current) {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      }
      return;
    }
    
    const offsetY = event.nativeEvent.contentOffset.y;
    const previousOffset = scrollOffsetRef.current;
    
    const realItemsLength = logicalFeed.length;
    const realStartOffset = 0;
    const realEndOffset = realItemsLength * itemLength;
    
    const isScrollingDown = offsetY > previousOffset;
    const isScrollingUp = offsetY < previousOffset;
    
    // Handle looping DOWN from last to first
    if (isScrollingDown && offsetY >= realEndOffset) {
      isLoopingRef.current = true;
      // Jump to the start of real items (which corresponds to first item)
      if (flatListRef.current) {
        flatListRef.current.scrollToOffset({
          offset: realStartOffset,
          animated: false,
        });
        scrollOffsetRef.current = realStartOffset;
        setTimeout(() => {
          isLoopingRef.current = false;
        }, 50);
      }
    }
    else {
      // Update scroll offset normally for all other cases
      scrollOffsetRef.current = offsetY;
    }
  }, [logicalFeed, itemLength]);

  // Use same white loader as TileDetailsScreen video loader so Feeds doesn't show yellow then white (two loaders)
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <LottieLoader size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, textAlign: 'center', marginBottom: 20, color: '#fff' }}>
          Failed to load Feeds content
        </Text>
        <Text style={{ fontSize: 14, textAlign: 'center', color: '#999', marginBottom: 20 }}>{error}</Text>
        <TouchableOpacity
          style={{ backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
          onPress={fetchFeedData}
        >
          <Text style={{ color: 'white', fontSize: 16 }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!feedData || feedData.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, textAlign: 'center', marginBottom: 20, color: '#fff' }}>
          No Feeds content available
        </Text>
        <Text style={{ fontSize: 14, textAlign: 'center', color: '#999' }}>
          Check back later for recommendations
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      collapsable={false}
    >
      <FlatList
        ref={flatListRef}
        data={extendedData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        removeClippedSubviews={true}
        maxToRenderPerBatch={2}
        windowSize={3}
        initialNumToRender={1}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.998}
        snapToInterval={itemLength}
        snapToAlignment="start"
        disableIntervalMomentum={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onLayout={() => {
          // Initialize scroll position to start of real items (first item) on first load
          if (!hasInitializedScrollRef.current && feedData.length > 0 && flatListRef.current) {
            hasInitializedScrollRef.current = true;
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToOffset({
                  offset: 0,
                  animated: false,
                });
                scrollOffsetRef.current = 0;
              } catch (error) {
                // Ignore initialization errors
              }
            }, 100);
          }
        }}
        contentContainerStyle={{ padding: 0, margin: 0 }}
        style={{ flex: 1, padding: 0, margin: 0 }}
      />
    </View>
  );
};

export default ForYouScreen;
