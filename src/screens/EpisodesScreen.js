import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  Animated,
  Alert,
  RefreshControl,
  BackHandler,
  PanResponder,
  FlatList,
  Platform,
} from 'react-native';
import LazyImage from '../components/LazyImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataCache } from '../context/DataCacheContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import API, { API_CONFIG } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import performanceMonitor from '../utils/performanceMonitor';
import { emitEpisodeSelection } from '../utils/episodeSelectionBus';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isIpad = Platform.OS === 'ios' && Platform.isPad;

// Wavy animation component for playing episode
const WavyPlayingIndicator = React.memo(() => {
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const wave3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(wave1, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(wave1, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(wave2, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(wave2, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(wave3, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(wave3, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animate();
  }, []);

  const getWaveStyle = (animValue) => ({
    transform: [
      {
        scaleY: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.3, 1],
        }),
      },
    ],
  });

  return (
    <View style={styles.wavyContainer}>
      <Animated.View style={[styles.waveBar, getWaveStyle(wave1)]} />
      <Animated.View style={[styles.waveBar, getWaveStyle(wave2)]} />
      <Animated.View style={[styles.waveBar, getWaveStyle(wave3)]} />
    </View>
  );
});

const EpisodesScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { getCachedData, setCachedData } = useDataCache();
  const { user, isGuestUser, isGuestSet } = useAuth();
  const { isSubscribed } = useSubscription();

  // Performance monitoring
  const performanceTimer = useRef(null);

  // State management
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [episodesData, setEpisodesData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);
  const [watchedEpisodes, setWatchedEpisodes] = useState(new Set());

  // Get data from route params
  const {
    seriesData: routeSeriesData,
    /** Explicit show name from Reels (preferred over episode-only fields). */
    seriesTitle: routeSeriesTitle,
    currentEpisode,
    path: seriesPath,
    episodePoster,
    origin,
    poster,
    genres,
    fromPreview,
    preloadedEpisodes,
  } = route?.params || {};

  const seriesData = useMemo(() => routeSeriesData || {
    id: 1,
    title: "The Crown",
    genre: "Drama • Historical",
    poster: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=400&fit=crop&crop=center",
    banner: "https://images.unsplash.com/photo-1489599500942-04b8f0d6b9db?w=400&h=200&fit=crop",
    lastWatchedEpisode: 3,
    totalEpisodes: 0,
    totalViews: null,
    ranking: null,
  }, [routeSeriesData]);

  /** Header: Reels passes `seriesTitle`; Home tile series objects often only have `title`; episodes use `seriesTitle`. */
  const topSeriesDisplayTitle = useMemo(() => {
    const pick = (v) => (v == null ? '' : String(v).trim());
    const candidates = [routeSeriesTitle, seriesData?.seriesTitle, seriesData?.title];
    const best = candidates.map(pick).find((s) => s && s !== 'Series');
    if (best) return best;
    return candidates.map(pick).find(Boolean) || '';
  }, [routeSeriesTitle, seriesData]);

  const currentPlayingEpisode = useMemo(() =>
    fromPreview ? false : currentEpisode || seriesData.lastWatchedEpisode || 3,
    [currentEpisode, seriesData.lastWatchedEpisode]
  );

  // Main ScrollView ref for programmatic scrolling
  const contentScrollViewRef = useRef(null);
  const groupSelectorScrollViewRef = useRef(null);
  const isAutoScrollingRef = useRef(false);
  const gridTopOffsetRef = useRef(0);
  const episodeRowHeightRef = useRef(0);
  const episodePressBlockRef = useRef(false);
  const episodePressBlockTimeoutRef = useRef(null);

  // State management
  const [selectedGroup, setSelectedGroup] = useState(0);

  // Animated value for drawer vertical translation
  const drawerTranslateY = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe-down to move drawer and close
  const drawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Capture mostly vertical movements
        return (
          Math.abs(gestureState.dy) > 5 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        );
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          drawerTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose =
          gestureState.dy > screenHeight * 0.15 || gestureState.vy > 0.75;

        if (shouldClose) {
          Animated.timing(drawerTranslateY, {
            toValue: screenHeight * 0.6,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            navigation.goBack();
          });
        } else {
          Animated.spring(drawerTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Load watched episodes from storage
  const loadWatchedEpisodes = useCallback(async () => {
    try {
      const key = `watched_episodes_${seriesData.id}`;
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const watchedSet = new Set(JSON.parse(stored));
        setWatchedEpisodes(watchedSet);
      }
    } catch (error) {
      console.error('Error loading watched episodes:', error);
    }
  }, [seriesData.id]);

  // Save watched episodes to storage
  const saveWatchedEpisodes = useCallback(async (episodeNumber) => {
    try {
      const key = `watched_episodes_${seriesData.id}`;
      const newWatched = new Set([...watchedEpisodes, episodeNumber]);
      setWatchedEpisodes(newWatched);
      await AsyncStorage.setItem(key, JSON.stringify([...newWatched]));
    } catch (error) {
      console.error('Error saving watched episodes:', error);
    }
  }, [watchedEpisodes, seriesData.id]);

  // Load watched episodes on mount
  useEffect(() => {
    loadWatchedEpisodes();
  }, [loadWatchedEpisodes]);

  // Memoized grid calculations (iPad: 10 columns per row, phone: 5)
  const gridConfig = useMemo(() => {
    const columnsCount = isIpad ? 10 : 5;
    const padding = 20;
    const gap = 8;
    const availableWidth = screenWidth - (padding * 2);
    const boxSize = Math.floor((availableWidth - (gap * (columnsCount - 1))) / columnsCount);
    const rowsPerPage = 6;
    const episodesPerPage = columnsCount * rowsPerPage;
    const itemHeight = boxSize + gap; // Approximate height of a row including gap

    return { columnsCount, padding, gap, availableWidth, boxSize, rowsPerPage, episodesPerPage, itemHeight };
  }, []);

  // Function to determine episode status based on subscription
  const getEpisodeStatus = useCallback(
    (episodeNumber) => {
      if (isSubscribed) {
        // Subscribed: all episodes are available; distinguish watched/unwatched for UI
        if (watchedEpisodes.has(episodeNumber)) {
          return 'watched';
        }
        return 'unwatched';
      }

      // Not subscribed (including guests): all episodes are locked
      return 'locked';
    },
    [isSubscribed, watchedEpisodes]
  );

  // Memoized episode grouping with dynamic status
  const episodeGroups = useMemo(() => {
    const groupEpisodes = (episodes, episodesPerGroup) => {
      const groups = [];
      for (let i = 0; i < episodes.length; i += episodesPerGroup) {
        const group = episodes.slice(i, i + episodesPerGroup);
        const startEpisode = i + 1;
        const endEpisode = Math.min(i + episodesPerGroup, episodes.length);
        groups.push({
          id: Math.floor(i / episodesPerGroup),
          title: `${startEpisode}-${endEpisode}`,
          fullTitle: `Episodes ${startEpisode}-${endEpisode}`,
          episodes: group,
        });
      }
      return groups;
    };

    // Update episode status based on watched episodes
    const updatedEpisodes = episodesData.map(episode => ({
      ...episode,
      status: getEpisodeStatus(episode.episodeNumber)
    }));

    return groupEpisodes(updatedEpisodes, gridConfig.episodesPerPage);
  }, [episodesData, gridConfig.episodesPerPage, watchedEpisodes, getEpisodeStatus]);

  // Transform episodes into rows for FlatList virtualization
  const virtualizedData = useMemo(() => {
    const data = [
      { id: 'header', type: 'header' },
      { id: 'selector', type: 'selector' },
    ];

    // Chunk episodes into rows of 5
    const columns = gridConfig.columnsCount;
    for (let i = 0; i < episodesData.length; i += columns) {
      const rowEpisodes = episodesData.slice(i, i + columns);
      data.push({
        id: `row_${i}`,
        type: 'row',
        episodes: rowEpisodes,
      });
    }

    return data;
  }, [episodesData, gridConfig.columnsCount]);

  // Fetch episodes data from API
  const fetchEpisodesData = useCallback(async (isRefresh = false) => {
    if (!seriesData.id) {
      setIsLoading(false);
      return;
    }

    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Check cache first (only if not refreshing)
      if (!isRefresh) {
        const cacheKey = `episodes_${seriesData.id}_${seriesPath || "2"}`;
        const cachedEpisodes = getCachedData(cacheKey);
        if (cachedEpisodes) {
          setEpisodesData(cachedEpisodes);
          setIsLoading(false);
          return;
        }
      }

      // Start performance timer
      performanceTimer.current = performanceMonitor.startTimer('episodes_fetch');

      // Call the asset listing API to get episodes with real HLS URLs
      const assetListingData = await API.getAssetListing({
        path: seriesPath || "2", // Use the actual series path, fallback to "2"
        start: 0,
        limit: 100,
        filter: {
          path: seriesPath || "2", // Use the actual series path, fallback to "2"
          deviceTypeId: API_CONFIG.deviceTypeId,
          languageId: 1
        }
      });

      const decodedAssetData = API.decodeJwtToken(assetListingData);

      // Handle different response structures
      let assets = [];

      if (decodedAssetData?.data?.data && Array.isArray(decodedAssetData.data.data)) {
        assets = decodedAssetData.data.data;
      } else if (decodedAssetData?.data && Array.isArray(decodedAssetData.data)) {
        assets = decodedAssetData.data;
      } else if (Array.isArray(decodedAssetData)) {
        assets = decodedAssetData;
      } else {
        console.error('Unexpected API response structure:', decodedAssetData);
        throw new Error('Invalid API response structure');
      }

      if (assets.length === 0) {
        throw new Error('No episodes available');
      }

      // Process assets into episode objects with real HLS URLs
      const processedEpisodes = assets.map((asset, index) => {
        const episodeNumber = index + 1;

        // Extract HLS URL from different possible fields
        const hlsUrl = asset.hlsUrl || asset.videoUrl || asset.streamingUrl || asset.url;

        return {
          id: asset.id || `episode_${episodeNumber}`,
          episodeNumber,
          status: getEpisodeStatus(episodeNumber), // Use dynamic status
          title: asset.title || `Episode ${episodeNumber}`,
          videoUrl: hlsUrl,
          duration: asset.duration || '2:00',
          thumbnail: asset.thumbnail || asset.poster || asset.image,
          description: asset.description || `Episode ${episodeNumber} description`,
          seriesId: seriesData.id,
          seriesTitle: seriesData.title,
          path: asset.path || seriesData.id.toString()
        };
      });

      // End performance timer
      if (performanceTimer.current) {
        const duration = performanceTimer.current.end();
        console.log(`Episodes fetch took: ${duration.toFixed(2)}ms`);
      }

      // Cache the processed episodes data
      const cacheKey = `episodes_${seriesData.id}_${seriesPath || "2"}`;
      setCachedData(cacheKey, processedEpisodes);
      setEpisodesData(processedEpisodes);

    } catch (error) {
      console.error('Error fetching episodes:', error);
      setError(error.message);

      // Fallback: Create some episodes even if API fails
      const fallbackEpisodes = Array.from({ length: 7 }, (_, index) => {
        const episodeNumber = index + 1;

        return {
          id: episodeNumber,
          episodeNumber,
          status: getEpisodeStatus(episodeNumber), // Use dynamic status
          title: `Episode ${episodeNumber}`,
          videoUrl: null,
          duration: '2:00',
          thumbnail: null,
          description: `Episode ${episodeNumber} description`,
          seriesId: seriesData.id,
          seriesTitle: seriesData.title,
          path: seriesPath || "2"
        };
      });

      setEpisodesData(fallbackEpisodes);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [seriesData.id, getCachedData, setCachedData, getEpisodeStatus]);

  // Fetch episodes on component mount (or apply preloaded from Reels)
  useEffect(() => {
    const preloaded = route?.params?.preloadedEpisodes;
    const fromReels = route?.params?.origin === 'Reels';
    if (fromReels && Array.isArray(preloaded) && preloaded.length > 0) {
      const mapped = preloaded.map((ep, i) => ({
        id: ep.id || ep.assetId || `episode_${i + 1}`,
        episodeNumber: ep.episodeNumber ?? i + 1,
        status: getEpisodeStatus(ep.episodeNumber ?? i + 1),
        title: ep.title || `Episode ${i + 1}`,
        videoUrl: ep.videoUrl,
        duration: ep.duration || '2:00',
        thumbnail: ep.thumbnail,
        description: ep.description || `Episode ${i + 1} description`,
        seriesId: ep.seriesId || seriesData.id,
        seriesTitle: ep.seriesTitle || seriesData.title,
        path: ep.path || ep.assetId || String(ep.id) || seriesData.id?.toString(),
      }));
      setEpisodesData(mapped);
      setIsLoading(false);
      return;
    }
    fetchEpisodesData();
  }, [fetchEpisodesData, getEpisodeStatus, seriesData.id, seriesData.title]);

  // Update selected group to show the group containing current playing episode
  useEffect(() => {
    const correctGroup = Math.floor((currentPlayingEpisode - 1) / gridConfig.episodesPerPage);
    setSelectedGroup(correctGroup);
  }, [currentPlayingEpisode, gridConfig.episodesPerPage]);

  // Number of episode rows visible when drawer opens at top (header + selector + first N rows).
  // If current episode is in this range, do not scroll so title/artwork stays visible.
  const EPISODE_ROWS_VISIBLE_AT_TOP = 3;

  // When drawer opens with a current episode: scroll list only if current episode is not in visible range
  useEffect(() => {
    if (!currentPlayingEpisode || episodesData.length === 0 || isLoading) return;

    const correctGroup = Math.floor((currentPlayingEpisode - 1) / gridConfig.episodesPerPage);
    setSelectedGroup(correctGroup);

    const columns = gridConfig.columnsCount;
    const rowIndex = Math.floor((currentPlayingEpisode - 1) / columns);

    // If current episode is in the first visible rows, keep list at top (title/artwork visible)
    if (rowIndex < EPISODE_ROWS_VISIBLE_AT_TOP) {
      groupSelectorScrollViewRef.current?.scrollTo({
        x: correctGroup * 80,
        animated: true,
      });
      return;
    }

    // Current episode is not visible when at top — scroll to bring it into view
    const targetFlatListIndex = 2 + rowIndex;

    const scrollToCurrentEpisode = () => {
      isAutoScrollingRef.current = true;
      contentScrollViewRef.current?.scrollToIndex({
        index: Math.min(targetFlatListIndex, virtualizedData.length - 1),
        animated: true,
        viewOffset: 70,
      });
      groupSelectorScrollViewRef.current?.scrollTo({
        x: correctGroup * 80,
        animated: true,
      });
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 600);
    };

    const t = setTimeout(scrollToCurrentEpisode, 100);
    return () => clearTimeout(t);
  }, [episodesData.length, isLoading, currentPlayingEpisode, gridConfig.columnsCount, gridConfig.episodesPerPage, virtualizedData.length]);

  // Get episodes for selected group
  const selectedGroupEpisodes = useMemo(() =>
    episodeGroups[selectedGroup]?.episodes || [],
    [episodeGroups, selectedGroup]
  );

  const handleEpisodePress = useCallback(
    (episode) => {
      // Ignore double/triple tap: treat as single tap (prevents second tap from e.g. goBack)
      if (episodePressBlockRef.current) return;
      episodePressBlockRef.current = true;
      if (episodePressBlockTimeoutRef.current) clearTimeout(episodePressBlockTimeoutRef.current);
      episodePressBlockTimeoutRef.current = setTimeout(() => {
        episodePressBlockRef.current = false;
        episodePressBlockTimeoutRef.current = null;
      }, 600);

      setSelectedEpisode(episode.id);

      // If user is not subscribed, block all episodes
      if (!isSubscribed) {
        if (isGuestUser && isGuestSet) {
          // Guest users: redirect to login page
          navigation.navigate('Auth');
        } else {
          // Logged-in but unsubscribed users: navigate to subscription screen
          navigation.navigate(Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView');
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
            userIdEvent = user?.userId || user?.uid || ""
            subscriptionTierEvent = isSubscribed ? "premium" : "free";
            subscriptionPlanName = isSubscribed ? (user.subscriptionPlanName || "premium_plan") : "free_plan";
            isLoggedIn = true;
            languageEvent = user.languagePreference || "en";
          }
          const analyticsService = require('../services/analytics').default;
          var properties = {
            content_id: episode.id || '',
            content_title: episode.title || 'Unknown',
            content_type: 'episode',
            season_number: 1,
            total_episodes: (episodesData && episodesData.length > 0)
              ? episodesData.length
              : (episode?.totalEpisodes || 1),
            page_name: "Episodes Screen",
            button_name: "Subscribe to Watch",
            button_location: "Episodes Grid",
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
          analyticsService.logSubscriptionButtonClicked(episode.id, properties);
        } catch (error) {
          // Error logged
          return;
        }
        setTimeout(() => setSelectedEpisode(null), 400);
        return;
      }

      // Subscribed users: allow all episodes
      setTimeout(() => setSelectedEpisode(null), 200);

      // Track watched episodes for subscribed users
      saveWatchedEpisodes(episode.episodeNumber);

      // Navigate to / update ReelsScreen with the episode data directly (no additional API call)
      try {
        // Convert episodes data to video format for ReelsScreen with real API data
        const videoData = episodesData.map((ep) => ({
          id: ep.id,
          title: ep.title,
          videoUrl: ep.videoUrl,
          duration: ep.duration,
          views: '',
          likes: '',
          creator: '',
          episodeNumber: ep.episodeNumber,
          totalEpisodes: episodesData.length,
          seriesTitle: ep.seriesTitle,
          seriesId: ep.seriesId,
          seriesGenres: seriesData?.seriesGenre || seriesData?.genre,
          description: ep.description,
          thumbnail: ep.thumbnail,
          path: String(seriesPath || ep.path || seriesData?.id || '2'),
        }));

        if (origin === 'Reels') {
          const mappedVideoData = episodesData.map((ep) => ({
            id: ep.id,
            title: ep.title,
            videoUrl: ep.videoUrl,
            duration: ep.duration,
            views: '',
            likes: '',
            creator: '',
            episodeNumber: ep.episodeNumber,
            totalEpisodes: episodesData.length,
            seriesTitle: ep.seriesTitle,
            seriesId: ep.seriesId,
            seriesGenres: seriesData?.seriesGenre || seriesData?.genre,
            description: ep.description,
            thumbnail: ep.thumbnail,
            path: String(seriesPath || ep.path || seriesData.id || '2'),
          }));

          // Update existing Reels instance in-place
          emitEpisodeSelection({
            origin: 'Reels',
            videoData: mappedVideoData,
            initialIndex: episode.episodeNumber - 1,
            path: seriesPath || '2',
            seriesData: seriesData,
          });
          navigation.goBack();
        } else {
          // Convert episodes data to video format for ReelsScreen with real API data
          const mappedVideoData = episodesData.map((ep) => ({
            id: ep.id,
            title: ep.title,
            videoUrl: ep.videoUrl,
            duration: ep.duration,
            views: '',
            likes: '',
            creator: '',
            episodeNumber: ep.episodeNumber,
            totalEpisodes: episodesData.length,
            seriesTitle: ep.seriesTitle,
            seriesId: ep.seriesId,
            seriesGenres: seriesData?.seriesGenre || seriesData?.genre,
            description: ep.description,
            thumbnail: ep.thumbnail,
            path: String(seriesPath || ep.path || seriesData.id || '2'),
          }));

          // Default behavior: navigate to Reels normally
          navigation.navigate('Reels', {
            initialIndex: episode.episodeNumber - 1,
            videoData: mappedVideoData, // Pass the episodes list as videoData
            seriesData: seriesData, // Pass the actual series metadata object
            isSeries: true,
            isForYouPage: false,
            skipApiCall: true,
            playback_source: 'episodes_screen',
            path: seriesPath || '2', // Use the actual series path, fallback to "2"
          });
        }
      } catch (error) {
        console.error('Error navigating to Reels:', error);
        require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to open episode. Please try again.');
      }
    },
    [episodesData, isSubscribed, isGuestUser, isGuestSet, navigation, seriesData.genre, saveWatchedEpisodes, seriesPath]
  );

  const handleGroupPress = useCallback((groupIndex) => {
    if (isAutoScrollingRef.current) return;

    setSelectedGroup(groupIndex);
    isAutoScrollingRef.current = true;

    // Calculate which row index to scroll to
    // index 0 is header, index 1 is selector
    // Row index for episodes starts at index 2
    const episodesPerGroup = gridConfig.episodesPerPage;
    const itemsPerRow = gridConfig.columnsCount;
    const startEpisodeIndex = groupIndex * episodesPerGroup;
    const rowIndex = Math.floor(startEpisodeIndex / itemsPerRow);

    // FlatList index = header (0) + selector (1) + rowIndex
    const targetFlatListIndex = 2 + rowIndex;

    contentScrollViewRef.current?.scrollToIndex({
      index: targetFlatListIndex,
      animated: true,
      viewOffset: 70, // Height of the sticky header
    });

    // Reset auto-scrolling flag after animation duration
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 500);
  }, [gridConfig]);

  const handleScroll = useCallback((event) => {
    if (isAutoScrollingRef.current) return;

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const offsetY = contentOffset.y;

    // Detect if we've reached the bottom of the list
    const isAtBottom = layoutMeasurement.height + offsetY >= contentSize.height - 50;

    let activeGroup;
    if (isAtBottom) {
      activeGroup = episodeGroups.length - 1;
    } else {
      // Use a reference point slightly below the top (e.g., 1/4 of viewport)
      // to make the group selection feel more natural as rows move up.
      const referencePoint = offsetY + (layoutMeasurement.height / 4);
      const relativeY = Math.max(0, referencePoint - gridTopOffsetRef.current);

      // Calculate which episode is at the reference point
      const rowIndex = Math.floor(relativeY / gridConfig.itemHeight);
      const referenceEpisodeIndex = rowIndex * gridConfig.columnsCount;
      activeGroup = Math.floor(referenceEpisodeIndex / gridConfig.episodesPerPage);
    }

    if (activeGroup !== selectedGroup && activeGroup >= 0 && activeGroup < episodeGroups.length) {
      setSelectedGroup(activeGroup);

      // Also scroll the horizontal group selector to keep the active group visible
      groupSelectorScrollViewRef.current?.scrollTo({
        x: activeGroup * 80, // Approximate width of a group button
        animated: true,
      });
    }
  }, [gridConfig, selectedGroup, episodeGroups.length]);

  const renderEpisodeItem = useCallback((episode) => {
    const isSelected = selectedEpisode === episode.id;
    const isPlaying = episode.episodeNumber === currentPlayingEpisode;

    return (
      <TouchableOpacity
        key={episode.id}
        style={[
          styles.episodeItem,
          { width: gridConfig.boxSize, height: gridConfig.boxSize },
          isSelected && styles.episodeItemSelected,
          isPlaying && styles.playingEpisodeItem,
        ]}
        onPress={() => handleEpisodePress(episode)}
        activeOpacity={0.7}
      >
        {/* Playing Indicator */}
        {isPlaying && (
          <View style={styles.playingIndicator}>
            <WavyPlayingIndicator />
          </View>
        )}

        {/* Episode Number - Hidden when playing */}
        {!isPlaying && (
          <Text style={styles.episodeNumber}>
            {episode.episodeNumber}
          </Text>
        )}

        {/* Status Indicator */}
        {!isPlaying && episode.status === 'watched' && (
          <View style={[styles.statusDot, styles.watchedDot]} />
        )}
        {!isPlaying && episode.status === 'unwatched' && (
          <View style={[styles.statusDot, styles.unwatchedDot]} />
        )}
        {episode.status === 'locked' && (
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={12} color="#009CDB" />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedEpisode, currentPlayingEpisode, gridConfig.boxSize, handleEpisodePress]);

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.topSeriesInfo}>
          <View style={styles.thumbnailContainer}>
            <LazyImage
              source={{ uri: poster }}
              style={styles.topSeriesThumbnail}
              resizeMode="cover"
              priority={true}
            />
          </View>
          <View style={styles.topSeriesDetails}>
            <Text style={styles.topSeriesTitle}>{topSeriesDisplayTitle}</Text>
            <Text style={styles.topSeriesGenre}>{genres ? typeof genres === 'string' ? genres : genres?.join(' ‧ ') : ''}</Text>
            <View style={styles.episodeStatsRow}>
              <Text style={styles.topEpisodeCount}>
                {episodesData.length} Episodes
              </Text>
            </View>
          </View>
        </View>
      );
    }

    if (item.type === 'selector') {
      return (
        <View style={styles.groupSelectorContainer}>
          <ScrollView
            ref={groupSelectorScrollViewRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.groupSelectorScroll}
            contentContainerStyle={styles.groupSelectorContent}
          >
            {episodeGroups.map((group, index) => (
              <TouchableOpacity
                key={group.id}
                style={[
                  styles.groupSelectorBox,
                  selectedGroup === index && styles.selectedGroupSelectorBox,
                ]}
                onPress={() => handleGroupPress(index)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.groupSelectorText,
                  selectedGroup === index && styles.selectedGroupText,
                ]}>
                  {group.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }

    if (item.type === 'row') {
      return (
        <View style={styles.rowContainer}>
          <View style={styles.episodesGrid}>
            {item.episodes.map(renderEpisodeItem)}
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => navigation.goBack()}
      />

      <Animated.View
        style={[
          styles.drawerContainer,
          { transform: [{ translateY: drawerTranslateY }] },
        ]}
        {...(Platform.OS !== 'ios' ? drawerPanResponder.panHandlers : {})}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header with drag handle - on iOS pan handlers only on handle so FlatList can scroll */}
          <View style={[styles.header, { paddingTop: 15 }]}>
            <View
              style={styles.handleContainer}
              {...(Platform.OS === 'ios' ? drawerPanResponder.panHandlers : {})}
            >
              <View style={styles.handleBar} />
            </View>
          </View>

          {isLoading ? (
            <LoadingSpinner
              text=""
              containerStyle={styles.loadingContainer}
            />
          ) : error && episodesData.length === 0 ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="#FF4444" />
              <Text style={styles.errorTitle}>Failed to Load Episodes</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => fetchEpisodesData(true)}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              ref={contentScrollViewRef}
              data={virtualizedData}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              stickyHeaderIndices={[1]}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                // Ensure last row is scrollable above system navigation/gesture bar
                paddingBottom:
                  Math.max(insets.bottom, 16) + 24,
              }}
              ListFooterComponent={
                <View
                  style={{
                    height: Math.max(insets.bottom, 16) + 24,
                  }}
                />
              }
              initialNumToRender={Platform.OS === 'android' ? 5 : 10}
              maxToRenderPerBatch={Platform.OS === 'android' ? 4 : 10}
              windowSize={Platform.OS === 'android' ? 3 : 5}
              getItemLayout={(data, index) => ({
                length: index === 0 ? 125 : index === 1 ? 70 : gridConfig.itemHeight,
                offset: index === 0 ? 0 : index === 1 ? 125 : 125 + 70 + (index - 2) * gridConfig.itemHeight,
                index,
              })}
              onScrollToIndexFailed={(info) => {
                const targetIndex = Math.min(info.index, virtualizedData.length - 1);
                const offset = targetIndex === 0 ? 0 : targetIndex === 1 ? 125 : 125 + 70 + (targetIndex - 2) * gridConfig.itemHeight;
                contentScrollViewRef.current?.scrollToOffset?.({ offset: Math.max(0, offset - 70), animated: true });
              }}
            />
          )}

        </SafeAreaView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  drawerContainer: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: screenHeight * 0.6,
  },
  handleContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  header: {
    paddingBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 5,
    marginBottom: 10,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 8,
    marginRight: 15,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  refreshButton: {
    padding: 8,
    marginLeft: 10,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  errorMessage: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },

  topSeriesInfo: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 25,
  },
  thumbnailContainer: {
    marginRight: 15,
  },
  topSeriesThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  topSeriesDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  topSeriesTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  topSeriesGenre: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  episodeStatsRow: {
    marginBottom: 8,
  },
  topEpisodeCount: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
    fontWeight: '400',
  },
  statsContainer: {
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#999',
    fontSize: 12,
  },
  verticalSeparator: {
    width: 1,
    height: 12,
    backgroundColor: '#333',
    marginHorizontal: 8,
  },
  groupSelectorContainer: {
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 10,
    marginBottom: 10,
  },
  groupSelectorScroll: {
    paddingHorizontal: 20,
  },
  groupSelectorContent: {
    paddingRight: 20,
  },
  groupSelectorBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  selectedGroupSelectorBox: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  groupSelectorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedGroupText: {
    color: '#fff',
  },
  rowContainer: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  episodesContainer: {
    paddingHorizontal: 20,
    marginBottom: 25,
  },
  selectedGroupTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  noEpisodesText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  episodesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  episodeItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#333',
  },
  episodeItemSelected: {
    backgroundColor: '#333',
    transform: [{ scale: 0.95 }],
  },
  playingEpisodeItem: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  episodeNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  playingIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wavyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 16,
    width: 24,
  },
  waveBar: {
    width: 3,
    height: 12,
    backgroundColor: '#fff',
    marginHorizontal: 1.5,
    borderRadius: 1.5,
  },
  statusDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  watchedDot: {
    backgroundColor: '#00C851',
  },
  unwatchedDot: {
    backgroundColor: '#007AFF',
  },
  lockIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },

});

export default EpisodesScreen; 