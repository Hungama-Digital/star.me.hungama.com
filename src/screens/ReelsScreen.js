import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import AppStatusBar from '../components/AppStatusBar';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Alert,
  TouchableWithoutFeedback,
  Share,
  Platform,
  PanResponder,
  BackHandler,
  Image,
  AppState,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import NetInfo from "@react-native-community/netinfo";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMyList } from '../context/MyListContext';
import { useWatchHistory } from '../context/WatchHistoryContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useDataCache } from '../context/DataCacheContext';
import { useAuth } from '../context/AuthContext';
import { useDataSaver } from '../context/DataSaverContext';
import crashlyticsService from '../services/crashlytics';
import { safeGoBack } from '../utils/navigationUtils';
import { useFavourites } from '../context/FavouritesContext';
import { useAutoplay } from '../context/AutoplayContext';
import * as Sharing from 'expo-sharing';
import Toast from '../components/Toast';
import SubscriptionOfferModal from '../components/SubscriptionOfferModal';
import GuestLoginModal from '../components/GuestLoginModal';
import SubtitlesBottomSheet from '../components/SubtitlesBottomSheet';
import { SUBTITLE_OFF } from '../utils/subtitleUtils';
import API, { API_CONFIG } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDeepLinking } from '../hooks/useDeepLinking';
import { createUniversalLink } from '../utils/deepLinkUtils';
import { subscribeEpisodeSelection } from '../utils/episodeSelectionBus';
import { LikeIcon, SaveIcon, ShareIcon, EpisodesIcon } from '../components/Icons';
import { useKeepAwake } from 'expo-keep-awake';
import LottieLoader from '../components/LottieLoader';
import ReelItem from '../components/ReelItem';
import { useInteractiveEnabled } from '../context/InteractiveShowContext';
import useInteractiveGraph from '../hooks/useInteractiveGraph';

const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');

// Animated gradient for scrub/progress bars
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Performance constants
// Preload a small buffer of reels around the current index so that scrolling feels instant.
// This controls how many neighbors we keep alive in memory and eligible for preloading logic.
const VIDEO_PRELOAD_COUNT = 3;
const VIDEO_CLEANUP_DELAY = 100; // Delay before cleaning up videos that are far outside the buffer
const VIEWABILITY_THRESHOLD = 80; // Higher threshold to ensure only fully visible videos play

// Scrub bar: cooldown after release so playback status doesn't overwrite thumb (avoids iOS flicker)
const SCRUB_COOLDOWN_MS = 450;


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

/** API may return genre as strings, { name, label }, or mixed — never pass raw objects into join() or Text. */
function normalizeGenreToStrings(value) {
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    const parts = value.split(/\s*[·•,]\s*/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [value];
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const g of value) {
      if (g == null) continue;
      if (typeof g === 'string') out.push(g.trim());
      else if (typeof g === 'object') {
        const t = g.name ?? g.label ?? g.title ?? g.genreName ?? g.text ?? g.value;
        if (t != null && String(t).trim()) out.push(String(t).trim());
      }
    }
    return out.filter(Boolean);
  }
  if (typeof value === 'object') {
    const t = value.name ?? value.label ?? value.title;
    return t ? [String(t)] : [];
  }
  return [];
}

function formatGenresForDisplay(value) {
  return normalizeGenreToStrings(value).join(' · ');
}

/** Map GET /assetgroup decoded row to seriesData shape used by Reels (deep link has no Home tile object). */
function mapAssetGroupDetailsToSeriesData(d, pathStr) {
  const path = d?.path != null ? String(d.path) : String(pathStr);
  const genreStrings = normalizeGenreToStrings(d?.genre);
  const genersStr =
    typeof d?.geners === 'string' && d.geners.trim()
      ? d.geners
      : genreStrings.join(' · ');
  return {
    title: d?.title || d?.seriesTitle || d?.label || 'Series',
    id: d?.id ?? path,
    path,
    seriesId: d?.id ?? path,
    poster:
      d?.poster ||
      d?.thumbFilePath ||
      d?.verticalFilePath ||
      d?.horizontalFilePath ||
      d?.uploadHorizontalImage,
    seriesGenre: genreStrings,
    genre: genreStrings,
    geners: genersStr,
    release_date: d?.release_date || d?.airStartDate,
    year_of_release: d?.productionyear || d?.year_of_release,
    age_rating: d?.age_rating,
    actor: d?.actor,
    keywords: d?.keywords,
    description: d?.description,
  };
}

const ReelsScreen = ({ navigation, route, onPlayingStateChange }) => {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { addSeriesToMyList, removeSeriesFromMyList, isSeriesInMyList, updateLastWatchedEpisode, getLastWatchedEpisode } = useMyList();
  const { getCachedData, setCachedData } = useDataCache();
  const { user, isGuestUser, isGuestSet } = useAuth();
  const isInteractiveEnabled = useInteractiveEnabled();
  const { addToHistory } = useWatchHistory();
  const { getVideoUrlWithQuality, saveVideoPosition, getVideoPosition, clearVideoPosition, setCurrentPlayingVideo } = useDataSaver();
  const { pathForPlayEpisode, pathForPlayShow, pathForPlayReel } = useDeepLinking();

  // Spec-based share URLs: episode/show use play/*; reels use play/reel or feeds/reel
  const getShareLinksForVideo = useCallback((video, isSeriesContent, seriesContent) => {
    const id = video?.id;
    if (!id) return { shareableLink: 'https://fasttv.app', assetDeepLink: '' };
    if (isSeriesContent && seriesContent?.id) {
      const showId = seriesContent.id;
      return {
        shareableLink: createUniversalLink(`play/episode/${id}`, { showId }),
        assetDeepLink: pathForPlayEpisode(id, { showId }),
      };
    }
    return {
      shareableLink: createUniversalLink(`play/reel/${id}`),
      assetDeepLink: pathForPlayReel(id),
    };
  }, [pathForPlayEpisode, pathForPlayReel]);

  // Subscription context values
  const {
    isSubscribed,
    checkSubscriptionStatus
  } = useSubscription();
  const isFocused = useIsFocused();

  // Guest user restriction state
  const [showGuestLoginModal, setShowGuestLoginModal] = useState(false);
  const [guestWatchedCount, setGuestWatchedCount] = useState(0);
  const GUEST_LIMIT = 3; // Guest users can only watch 3 episodes/reels

  // Track guest episode watching
  const trackGuestEpisodeWatched = useCallback((episodeId) => {
    if (!isGuestUser || !isGuestSet) return;

    const watchedEpisodes = JSON.parse(AsyncStorage.getItem('guestWatchedEpisodes') || '[]');
    if (!watchedEpisodes.includes(episodeId)) {
      watchedEpisodes.push(episodeId);
      AsyncStorage.setItem('guestWatchedEpisodes', JSON.stringify(watchedEpisodes));
    }
  }, [isGuestUser, isGuestSet]);

  // Check if guest user can watch more episodes
  const canGuestWatchMore = useCallback(() => {
    return !isGuestUser || !isGuestSet || guestWatchedCount < GUEST_LIMIT;
  }, [isGuestUser, isGuestSet, guestWatchedCount, GUEST_LIMIT]);

  // Get series data from route params and normalize it
  const params = route?.params || {};
  const { seriesData: routeSeriesData, isSeries: routeIsSeries, isForYouPage, skipApiCall, playback_source: routePlaybackSource } = params;
  // Playback source for analytics: from navigation or derived (for_you vs reels)
  const playbackSource = routePlaybackSource || (isForYouPage ? 'for_you' : 'reels');
  // Derive path for API when opened via deep link (linking only passes episodeId/showId, not path)
  const path = params.path ?? params.showId ?? params.episodeId ?? undefined;

  /** Filled via getAssetGroupDetails when series deep link has no seriesData from navigation. */
  const [seriesDataFromAssetGroup, setSeriesDataFromAssetGroup] = useState(null);

  useEffect(() => {
    if (routeSeriesData != null || !routeIsSeries || !path) {
      if (routeSeriesData != null) setSeriesDataFromAssetGroup(null);
      return;
    }
    let cancelled = false;
    setSeriesDataFromAssetGroup(null);
    (async () => {
      try {
        const raw = await API.getAssetGroupDetails({
          filter: JSON.stringify({ path: String(path) }),
        });
        const decoded = API.decodeJwtToken(raw);
        const details = decoded?.data?.[0];
        if (cancelled || !details) return;
        setSeriesDataFromAssetGroup(mapAssetGroupDetailsToSeriesData(details, path));
      } catch (e) {
        console.warn('ReelsScreen getAssetGroupDetails', e);
        if (!cancelled) setSeriesDataFromAssetGroup(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, routeIsSeries, routeSeriesData]);

  // Normalize seriesData if it's an array (API returns [videoObj])
  const { seriesData, isSeries } = useMemo(() => {
    if (Array.isArray(routeSeriesData)) {
      // If it's an array, treat it as a single video and wrap in episodes
      return {
        seriesData: {
          episodes: routeSeriesData,
          title: routeSeriesData[0]?.title || 'Untitled',
          id: routeSeriesData[0]?.id || 'unknown',
          seriesGenre: routeSeriesData[0]?.seriesGenres || routeSeriesData[0]?.genre,
          poster: routeSeriesData[0]?.poster || routeSeriesData[0]?.imageUrl || routeSeriesData[0]?.thumbnail || routeSeriesData[0]?.verticalFilePath || routeSeriesData[0]?.horizontalFilePath,
        },
        isSeries: true
      };
    }

    // Auto-detect series based on data structure
    const autoDetectSeries = () => {
      if (routeSeriesData) {
        // Check if it has series-like properties
        const hasSeriesProperties = routeSeriesData.title &&
          (routeSeriesData.episodes ||
            routeSeriesData.totalEpisodes ||
            routeSeriesData.genre);

        // Check if title contains series indicators
        const titleIndicators = ['series', 'episode', 'season', 'part'];
        const titleHasSeriesIndicators = titleIndicators.some(indicator =>
          routeSeriesData.title.toLowerCase().includes(indicator)
        );

        // Check if ID suggests it's a series
        const idSuggestsSeries = routeSeriesData.id &&
          (String(routeSeriesData.id).includes('series') ||
            String(routeSeriesData.id).includes('video_'));

        return hasSeriesProperties || titleHasSeriesIndicators || idSuggestsSeries;
      }
      return false;
    };

    const detectedIsSeries = routeIsSeries !== undefined ? routeIsSeries : autoDetectSeries();

    // Ensure series data has the correct structure for saving
    let finalSeriesData = routeSeriesData;
    if (detectedIsSeries && routeSeriesData && !routeSeriesData.path) {
      // If it's a series but missing the 'path' field (needed for API calls), create it
      finalSeriesData = {
        ...routeSeriesData,
        path: routeSeriesData.id || `series_${Date.now()}`,
        // Ensure we have a proper series ID for API calls
        seriesId: routeSeriesData.id || `series_${Date.now()}`
      };
    }

    if (detectedIsSeries && !finalSeriesData && seriesDataFromAssetGroup) {
      finalSeriesData = {
        ...seriesDataFromAssetGroup,
        path: seriesDataFromAssetGroup.path ?? path,
        seriesId: seriesDataFromAssetGroup.seriesId ?? path,
      };
    }

    return {
      seriesData: finalSeriesData,
      isSeries: detectedIsSeries
    };
  }, [routeSeriesData, routeIsSeries, seriesDataFromAssetGroup, path]);

  // Interactive show graph — only fetch when this series is interactive
  const interactiveShowId =
    seriesData?.asset_group_id ||
    seriesData?.assetGroupId ||
    (seriesData?.agdlmId ? String(seriesData.agdlmId) : null) ||
    null;
  const { graph: interactiveGraph } = useInteractiveGraph(
    isInteractiveEnabled && seriesData?.is_interactive ? interactiveShowId : null
  );

  // No fallback - we'll show loader if no data is available

  // API data state
  const [apiDataLoaded, setApiDataLoaded] = useState(false);

  // Dynamic video data state
  const [dynamicVideoData, setDynamicVideoData] = useState(null);

  // Trailer-first mode state (when we start by playing only trailer from homepage data)
  const [isTrailerMode, setIsTrailerMode] = useState(!!route?.params?.isTrailerMode);
  const [episodesLoaded, setEpisodesLoaded] = useState(false);

  // API loading state
  const [isApiLoading, setIsApiLoading] = useState(false);

  // Track if initial API call has been made to prevent infinite loops
  const hasInitialApiCall = useRef(false);
  const lastPathRef = useRef(null);

  // Use series episodes if available, otherwise use empty array
  const videoData = useMemo(() => {
    let data = [];

    // If we have dynamic video data from API, use that
    if (dynamicVideoData && dynamicVideoData.length > 0) {
      data = dynamicVideoData;
    }
    // If skipApiCall is true and seriesData is an array, use it directly
    else if (skipApiCall && Array.isArray(seriesData)) {
      data = seriesData;
    }
    // If skipApiCall is true and seriesData has episodes (after normalization), use episodes
    else if (skipApiCall && isSeries && seriesData && seriesData.episodes) {
      data = seriesData.episodes;
    }
    // Otherwise use series episodes or empty array
    else if (isSeries && seriesData && seriesData.episodes) {
      data = seriesData.episodes;
    }

    return data;
  }, [dynamicVideoData, isSeries, seriesData, skipApiCall]);

  // Defensive: Ensure videoData is always an array
  const safeVideoData = Array.isArray(videoData) ? videoData : [];

  // Auto-detect if it's a series based on videoData (multiple episodes with seriesTitle)
  const detectedIsSeries = useMemo(() => {
    // If already marked as series, use that
    if (isSeries) return true;

    // If we have videoData with seriesTitle, it's a series (even if just one episode)
    if (videoData && videoData.length > 0 && videoData[0]?.seriesTitle) {
      return true;
    }

    // If we have videoData with seriesId, it's likely a series
    if (videoData && videoData.length > 0 && videoData[0]?.seriesId) {
      return true;
    }

    return false;
  }, [isSeries, videoData]);

  // Prefer resolved series metadata (e.g. getAssetGroupDetails) over listing fallback "Series".
  const effectiveSeriesTitle = useMemo(() => {
    const fromSeries = seriesData?.title;
    const fromVideo = videoData?.[0]?.seriesTitle;
    if (fromSeries && fromSeries !== 'Series') return fromSeries;
    if (fromVideo && fromVideo !== 'Series') return fromVideo;
    return fromSeries || fromVideo || null;
  }, [videoData, seriesData]);

  const seriesGenresDisplay = useMemo(() => {
    const fromSeries = seriesData?.geners || formatGenresForDisplay(seriesData?.genre);
    if (fromSeries) return fromSeries;
    const v = videoData?.[0];
    return (
      (typeof v?.geners === 'string' ? v.geners : '') ||
      formatGenresForDisplay(v?.genre) ||
      formatGenresForDisplay(v?.seriesGenres) ||
      ''
    );
  }, [seriesData, videoData]);

  // Autoplay state from context
  const { autoplayEnabled, updateAutoplaySetting } = useAutoplay();
  const [userManuallyScrolled, setUserManuallyScrolled] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(route.params?.initialIndex || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [likedVideos, setLikedVideos] = useState(new Set());
  const [savedVideos, setSavedVideos] = useState(new Set());
  const [likeCounts, setLikeCounts] = useState({}); // Track like counts for each video
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // UI Visibility and Control States
  const [showUI, setShowUI] = useState(true);
  const [showMetadataPopup, setShowMetadataPopup] = useState(true); // New state for metadata popup
  const [currentTime, setCurrentTime] = useState(0);
  const [currentTimePlayed, setCurrentTimePlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoQuality, setVideoQuality] = useState('Auto');
  const [resumeTime, setResumeTime] = useState(0);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  // Subscription offer modal state
  const [subscriptionOfferVisible, setSubscriptionOfferVisible] = useState(false);
  const [lockedEpisode, setLockedEpisode] = useState(null);
  const [pendingUnlockEpisode, setPendingUnlockEpisode] = useState(null);

  // Subtitles: keep the user's selection for the whole player session until they exit Reels.
  const [subtitleSheetOpen, setSubtitleSheetOpen] = useState(false);
  const [currentSubtitleLang, setCurrentSubtitleLang] = useState(SUBTITLE_OFF);

  const openSubtitleSheet = useCallback(() => setSubtitleSheetOpen(true), []);

  const handleSubtitleLanguagePicked = useCallback(
    (lang) => {
      setCurrentSubtitleLang(lang);
    },
    []
  );

  useEffect(() => {
    setSubtitleSheetOpen(false);
  }, [currentIndex]);

  const { isFavourite, addFavourite, removeFavourite } = useFavourites();

  // Initialize likedVideos from favourites context when video data changes.
  // We combine two sources of truth:
  //   1) FavouritesContext – synced from backend on login (may be incomplete on first load)
  //   2) isUserLikes field from the assetlisting API response – always accurate per-video
  // Merging both ensures the liked state is never accidentally cleared on first render.
  useEffect(() => {
    if (!videoData || videoData.length === 0) {
      setLikedVideos(new Set());
      return;
    }

    const initialLiked = new Set();
    videoData.forEach((video) => {
      const assetId = video.assetId || video.id;
      // Liked if context says so OR if the API marked isUserLikes = 1
      if (assetId && (isFavourite(assetId) || video.isUserLikes === 1)) {
        initialLiked.add(video.id);
      }
    });

    setLikedVideos(initialLiked);
  }, [videoData, isFavourite]);

  // Asset listing API call function (defined AFTER showUIWithTimeout)
  const callAssetListingAPI = useCallback(async () => {
    if (!path) {
      return;
    }

    // Prevent multiple simultaneous calls
    if (isApiLoading) {
      return;
    }

    // Check if asset listing data is cached
    const cacheKey = `assetListing_${path}`;
    const cachedAssetData = getCachedData(cacheKey);
    if (cachedAssetData) {
      setDynamicVideoData(cachedAssetData);
      setApiDataLoaded(true);
      let idx = 0;
      const episodeIdFromRoute = route?.params?.episodeId;
      if (episodeIdFromRoute && cachedAssetData.length > 0) {
        let foundIdx = cachedAssetData.findIndex(
          (v) => v.id === episodeIdFromRoute || v.assetId === episodeIdFromRoute || v.path === episodeIdFromRoute || String(v.id) === String(episodeIdFromRoute)
        );
        if (foundIdx < 0) {
          const num = parseInt(String(episodeIdFromRoute).replace(/^episode_/i, ''), 10);
          if (!Number.isNaN(num) && num >= 1) {
            foundIdx = cachedAssetData.findIndex((v) => v.episodeNumber === num);
            if (foundIdx < 0) foundIdx = Math.min(num - 1, cachedAssetData.length - 1);
          }
        }
        if (foundIdx >= 0) idx = foundIdx;
      }
      setCurrentIndex(idx);
      if (cachedAssetData[idx]) {
        const currentVideo = cachedAssetData[idx];
        setCurrentPlayingVideo(currentVideo.id || `video-${idx}`);
      }
      return;
    }

    try {
      setIsApiLoading(true);

      if (!path) {
        setToastMessage('Invalid series path');
        setToastType('error');
        setToastVisible(true);
        setApiDataLoaded(true);
        return;
      }

      const authToken = await AsyncStorage.getItem('authToken');
      if (!authToken) {
        setToastMessage('Please sign in to watch');
        setToastType('error');
        setToastVisible(true);
        setApiDataLoaded(true);
        return;
      }

      const assetListingData = await API.getAssetListing({
        path: path.toString(), // Ensure path is a string
        start: 0,
        limit: 100
      });

      const decodedAssetData = API.decodeJwtToken(assetListingData);

      // Handle different response structures
      let assets = [];

      // Extract series title from API response if available
      const apiSeriesTitle = decodedAssetData?.data?.title ||
        decodedAssetData?.data?.seriesTitle ||
        decodedAssetData?.data?.label ||
        decodedAssetData?.title ||
        decodedAssetData?.seriesTitle ||
        decodedAssetData?.label ||
        null;

      // Extract series ID from API response if available
      const apiSeriesId = decodedAssetData?.data?.id ||
        decodedAssetData?.data?.seriesId ||
        decodedAssetData?.id ||
        decodedAssetData?.seriesId ||
        null;

      // Extract series genre from API response if available (may be string or array of objects)
      const apiSeriesGenreRaw = decodedAssetData?.data?.genre ??
        decodedAssetData?.genre ??
        null;

      // Try different possible data structures
      if (decodedAssetData?.data?.data && Array.isArray(decodedAssetData.data.data)) {
        assets = decodedAssetData.data.data;
      } else if (decodedAssetData?.data && Array.isArray(decodedAssetData.data)) {
        assets = decodedAssetData.data;
      } else if (Array.isArray(decodedAssetData)) {
        assets = decodedAssetData;
      } else {
        // Error logged
        setToastMessage('Invalid API response format');
        setToastType('error');
        setToastVisible(true);
        setApiDataLoaded(true);
        return;
      }

      if (assets.length === 0) {
        setToastMessage('No videos found for this category');
        setToastType('info');
        setToastVisible(true);
        setApiDataLoaded(true);
        return;
      }

      const apiGenreList = normalizeGenreToStrings(apiSeriesGenreRaw);

      // Process assets into video objects
      const hlsVideos = assets.map((asset, index) => {
        // Extract HLS URL from different possible fields
        const hlsUrl = asset.hlsUrl || asset.videoUrl || asset.streamingUrl || asset.url;

        // Prefer non-placeholder title from route/getAssetGroupDetails when listing JWT has no title yet
        const finalSeriesTitle =
          (seriesData?.title && seriesData.title !== 'Series' ? seriesData.title : null) ||
          (apiSeriesTitle && String(apiSeriesTitle).trim() && apiSeriesTitle !== 'Series' ? apiSeriesTitle : null) ||
          asset.seriesTitle ||
          apiSeriesTitle ||
          seriesData?.title ||
          'Series';

        // Use API response series ID first, then asset seriesId, then route params, then fallback
        const finalSeriesId = apiSeriesId ||
          asset.seriesId ||
          seriesData?.id ||
          'series_1';

        const fromAssetGenres = normalizeGenreToStrings(asset.genres || asset.genre);
        const fromSeriesRoute = normalizeGenreToStrings(seriesData?.genre);
        const finalSeriesGenres = apiGenreList.length
          ? apiGenreList
          : (fromAssetGenres.length ? fromAssetGenres : fromSeriesRoute);

        // Series-level metadata from API for analytics (content_genre, age_rating, etc.)
        const seriesMeta = decodedAssetData?.data || decodedAssetData || {};
        const genreStr =
          formatGenresForDisplay(seriesMeta.genre) ||
          (typeof asset.geners === 'string' ? asset.geners : '') ||
          formatGenresForDisplay(asset.genre) ||
          finalSeriesGenres.join(' · ') ||
          (seriesData?.geners || '') ||
          '';

        return {
          id: asset.path || asset.id || `hls_video_${index}`, // Use path as ID
          assetId: asset.path || asset.id, // Store the path as asset ID for API calls
          title: asset.title || `Episode ${index + 1}`,
          videoUrl: hlsUrl || '',
          duration: asset.duration != null && asset.duration !== '' ? asset.duration : '',
          views: asset.views || '1M',
          likes: asset.likeCount?.toString() || '0', // Use likeCount from API
          isUserLikes: asset.isUserLikes || 0, // Track if user has liked this video (from assetlisting API)
          watchedCount: asset.watchedCount || 0,
          isUserWatched: asset.isUserWatched || 0,
          creator: asset.creator || asset.author || 'Series Creator',
          episodeNumber: asset.episodeNumber ?? index + 1,
          totalEpisodes: assets.length,
          seriesTitle: finalSeriesTitle,
          seriesId: finalSeriesId,
          seriesGenres: finalSeriesGenres,
          description: asset.description || `Episode ${index + 1} of ${assets.length} - Amazing content to watch!`,
          // Use correct thumbnail with same priority as bookmark API: vertical > horizontal > poster
          thumbnail: asset.verticalFilePath || asset.horizontalFilePath || asset.vodOrLivePosterImageFilePath || asset.thumbnail || asset.poster || asset.image,
          // Metadata for stream_finished / analytics (prefer asset, then series-level)
          geners:
            (typeof asset.geners === 'string' && asset.geners.trim() ? asset.geners : '') ||
            genreStr ||
            finalSeriesGenres.join(' · '),
          genre:
            normalizeGenreToStrings(asset.genre).length > 0
              ? normalizeGenreToStrings(asset.genre)
              : finalSeriesGenres,
          age_rating: asset.age_rating || seriesMeta.age_rating || '',
          release_date: asset.release_date || seriesMeta.release_date || '',
          year_of_release: asset.year_of_release || seriesMeta.year_of_release || '',
          actor: asset.actor || seriesMeta.actor || '',
          keywords: asset.keywords || seriesMeta.keywords || '',
          language: asset.language || seriesMeta.language || seriesMeta.langauge || '',
          // Cliffhanger & Opening Hook fields from assetlist API
          tropesName: asset.tropesName || null,
          openingHookStrength: asset.openingHookStrength || null,
          openingHookStart: asset.openingHookStart || null,
          openingHookEnd: asset.openingHookEnd || null,
          openingHookEffectiveness: asset.openingHookEffectiveness || null,
          openingHookKeywords: asset.openingHookKeywords || null,
          cliffhangerStrength: asset.cliffhangerStrength || null,
          cliffhangerStart: asset.cliffhangerStart || null,
          cliffhangerEnd: asset.cliffhangerEnd || null,
          cliffhangerEffectiveness: asset.cliffhangerEffectiveness || null,
          cliffhangerKeywords: asset.cliffhangerKeywords || null,
          subtitle: Array.isArray(asset.subtitle) ? asset.subtitle : [],
        };
      });

      // Filter out videos without URLs
      const validVideos = hlsVideos.filter(video => video.videoUrl);

      if (validVideos.length === 0) {
        // Error logged
        setToastMessage('No playable videos found');
        setToastType('error');
        setToastVisible(true);
        setApiDataLoaded(true);
        return;
      }

      // Cache the processed video data
      setCachedData(cacheKey, validVideos);

      // Initialize like counts and liked state from API data
      const initialLikeCounts = {};
      const initialLikedVideos = new Set();
      const initialSavedVideos = new Set();

      validVideos.forEach(video => {
        initialLikeCounts[video.id] = video.likes || '0';
        // If user has already liked this video, add it to liked videos set
        if (video.isUserLikes === 1) {
          initialLikedVideos.add(video.id);
        }
        // Saved videos are tracked via savedVideos state and MyList context
      });

      setLikeCounts(initialLikeCounts);
      setLikedVideos(initialLikedVideos);
      setSavedVideos(initialSavedVideos);

      // Set the dynamic video data state to trigger re-render
      setDynamicVideoData(validVideos);

      // Use initialIndex from route params, or find index by episodeId (deep link or resume), otherwise 0
      let initialIndex = route?.params?.initialIndex ?? 0;
      const episodeIdFromRoute = route?.params?.episodeId;
      const resumeTimeFromRoute = route?.params?.resumeTime;

      if (episodeIdFromRoute && validVideos.length > 0) {
        let foundIdx = validVideos.findIndex(
          (v) => v.id === episodeIdFromRoute || v.assetId === episodeIdFromRoute || v.path === episodeIdFromRoute || String(v.id) === String(episodeIdFromRoute)
        );
        if (foundIdx < 0) {
          const num = parseInt(String(episodeIdFromRoute).replace(/^episode_/i, ''), 10);
          if (!Number.isNaN(num) && num >= 1) {
            foundIdx = validVideos.findIndex((v) => v.episodeNumber === num);
            if (foundIdx < 0) foundIdx = num - 1;
            if (foundIdx >= validVideos.length) foundIdx = validVideos.length - 1;
          }
        }
        if (foundIdx >= 0) {
          initialIndex = foundIdx;
          // Set resumeTime if provided in route params for this specific episode
          if (resumeTimeFromRoute > 0) {
            setResumeTime(resumeTimeFromRoute);
          }
        }
      }

      const safeInitialIndex = Math.min(Math.max(0, initialIndex), validVideos.length - 1);
      setCurrentIndex(safeInitialIndex);

      // Set current playing video for quality settings
      if (validVideos[safeInitialIndex]) {
        const currentVideo = validVideos[safeInitialIndex];
        const videoId = currentVideo.id || `video-${safeInitialIndex}`;
        setCurrentPlayingVideo(videoId);
      }

      // Mark API data as loaded to trigger videoData refresh
      setApiDataLoaded(true);

      // When episodes are loaded from API, we are no longer in trailer-only mode
      setEpisodesLoaded(true);
      setIsTrailerMode(false);

      // Scroll to the correct episode after data is loaded
      setTimeout(() => {
        if (flatListRef.current && safeInitialIndex >= 0) {
          flatListRef.current.scrollToIndex({
            index: safeInitialIndex,
            animated: false,
          });
        }
      }, 100);

      // Start playing the correct episode after a short delay to ensure data is updated
      setTimeout(() => {
        if (isMountedRef.current) {
          setIsPlaying(true);
          // Show metadata popup when initial API video starts playing (will hide with main UI)
          setShowMetadataPopup(true);
          showUIWithTimeout();
        }
      }, 200);

    } catch (error) {
      // Error logged
      setToastMessage(`Failed to load videos: ${error.message}`);
      setToastType('error');
      setToastVisible(true);
      setApiDataLoaded(true);
    } finally {
      setIsApiLoading(false);
    }
  }, [path, isApiLoading, getCachedData, setCachedData, seriesData, isPlaying, setShowMetadataPopup, isTrailerMode, setCurrentPlayingVideo, setToastMessage, setToastType, setToastVisible, setLikeCounts, setLikedVideos, setSavedVideos, setDynamicVideoData, setCurrentIndex, setApiDataLoaded, setEpisodesLoaded, setIsTrailerMode]);

  // When getAssetGroupDetails resolves after getAssetListing, align episode rows with series tile metadata.
  useEffect(() => {
    if (!isSeries || !path || !seriesData) return;
    const title = seriesData.title;
    const genersLine = seriesData.geners || formatGenresForDisplay(seriesData.genre);
    const goodTitle = title && title !== 'Series';
    if (!goodTitle && !genersLine) return;
    setDynamicVideoData((prev) => {
      if (!prev || prev.length === 0) return prev;
      const needsPatch = prev.some((v) => {
        if (goodTitle && (v.seriesTitle === 'Series' || !v.seriesTitle)) return true;
        if (
          genersLine &&
          typeof v.geners === 'string' &&
          (v.geners.includes('[object Object]') || !String(v.geners).trim())
        ) {
          return true;
        }
        return false;
      });
      if (!needsPatch) return prev;
      const gList = normalizeGenreToStrings(seriesData.genre);
      const next = prev.map((v) => ({
        ...v,
        ...(goodTitle ? { seriesTitle: title, seriesId: seriesData.id || v.seriesId } : {}),
        ...(genersLine
          ? {
              geners: genersLine,
              genre: gList.length ? gList : v.genre,
              seriesGenres: gList.length ? gList : v.seriesGenres,
            }
          : {}),
      }));
      setCachedData(`assetListing_${path}`, next);
      return next;
    });
  }, [isSeries, path, seriesData, setCachedData]);

  // Enhanced refs for performance optimization
  const flatListRef = useRef(null);
  const videoDataRef = useRef(safeVideoData);
  const currentIndexRef = useRef(currentIndex);
  const currentTimeRef = useRef(0);
  const currentTimeSecondsRef = useRef(0);
  const durationRef = useRef(20);
  /** Player-reported duration in seconds per video id (from expo-video status). Used when API omits asset.duration. */
  const videoDurationSecondsByIdRef = useRef(new Map());
  const progressAnim = useRef(new Animated.Value(0)).current;
  const likeAnimValue = useRef(new Animated.Value(1)).current;
  const saveAnimValue = useRef(new Animated.Value(1)).current;
  const watchNowAnimValue = useRef(new Animated.Value(1)).current;
  const metadataAnimValue = useRef(new Animated.Value(1)).current;
  const scrubBarHeightAnim = useRef(new Animated.Value(3)).current;
  const hideUITimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const scrubberTrackRef = useRef(null);
  const scrubberLayoutRef = useRef({ x: 0, width: Dimensions.get('window').width });
  const isSeekingRef = useRef(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const scrubInitialPageXRef = useRef(0);
  const scrubGestureLayoutRef = useRef(null);
  const lastScrubReleaseTimeRef = useRef(0);
  const seekToPageXRef = useRef(() => { });
  const videoRefs = useRef(new Map()); // map of item index to ReelItem handles
  /** Latest expo-video `playing` for the visible reel; center button toggles from this, not only React state. */
  const currentNativePlayingRef = useRef(false);

  const safePauseCurrentVideo = useCallback((idx = null) => {
    try {
      const i = idx ?? currentIndexRef.current;
      const ref = videoRefs.current.get(i);
      if (ref?.pause) ref.pause();
    } catch (_) {}
  }, []);
  const safePlayCurrentVideo = useCallback((idx = null) => {
    try {
      const i = idx ?? currentIndexRef.current;
      const ref = videoRefs.current.get(i);
      if (ref?.play) ref.play();
    } catch (_) {}
  }, []);

  // Sync refs for stable callbacks
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    videoDataRef.current = safeVideoData;
  }, [safeVideoData]);


  // Resize mode: contain vs cover (toggle top-right or via pinch)
  const [videoResizeMode, setVideoResizeMode] = useState('cover');
  // Small top message when user zooms in/out
  const [zoomToast, setZoomToast] = useState(null);
  // Pinch-to-zoom: scale anim and refs for gesture
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const pinchInitialDistanceRef = useRef(null);

  const getDistance = useCallback((t1, t2) => {
    return Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY) || 1;
  }, []);

  const pinchPanResponder = useMemo(() => {
    const clampScale = (s) => Math.min(4, Math.max(0.5, s));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false, // We only want to handle moves/pinches
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          pinchInitialDistanceRef.current = getDistance(evt.nativeEvent.touches[0], evt.nativeEvent.touches[1]);
          pinchBaseScaleRef.current = scaleRef.current;
        }
      },
      onPanResponderMove: (evt) => {
        if (evt.nativeEvent.touches.length === 2 && pinchInitialDistanceRef.current != null) {
          const currentDist = getDistance(evt.nativeEvent.touches[0], evt.nativeEvent.touches[1]);
          const newScale = clampScale(pinchBaseScaleRef.current * (currentDist / pinchInitialDistanceRef.current));
          scaleRef.current = newScale;
          // Animate the scale visually during the gesture
          scaleAnim.setValue(newScale);
        }
      },
      onPanResponderRelease: () => {
        // Threshold check: if zoomed in significantly, go to cover; if zoomed out, go to contain
        // Or simply toggle based on final scale relative to 1
        if (scaleRef.current > 1.2) {
          setVideoResizeMode('cover');
          setZoomToast('Zoomed to fill');
        } else if (scaleRef.current < 0.8) { // Allow some tolerance for "zoom out" intent
          setVideoResizeMode('contain');
          setZoomToast('Original');
        }

        // Always reset visual scale to 1 after release, so the video snaps to the new mode
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
        }).start(() => {
          scaleRef.current = 1;
        });

        pinchInitialDistanceRef.current = null;
      },
    });
  }, [getDistance, scaleAnim]);

  useEffect(() => {
    scaleAnim.setValue(1);
    scaleRef.current = 1;
    pinchInitialDistanceRef.current = null;
  }, [currentIndex, scaleAnim]);

  // Auto-hide zoom toast after a short delay
  useEffect(() => {
    if (!zoomToast) return;
    const timeout = setTimeout(() => setZoomToast(null), 1200);
    return () => clearTimeout(timeout);
  }, [zoomToast]);

  const measureScrubBar = useCallback(() => {
    if (scrubberTrackRef.current) {
      scrubberTrackRef.current.measureInWindow((x, y, width) => {
        if (width > 0) scrubberLayoutRef.current = { x, width };
      });
    }
  }, []);

  const seekToPageX = useCallback((pageX, shouldSeekVideo = false, layoutOverride = null) => {
    const layout = layoutOverride && layoutOverride.width > 0
      ? layoutOverride
      : scrubberLayoutRef.current;
    const { x, width } = layout;
    if (!width) return;
    const durationSec = durationRef.current;
    if (!durationSec || durationSec <= 0) return;
    const ratio = Math.min(1, Math.max(0, (pageX - x) / width));
    progressAnim.setValue(ratio);
    if (shouldSeekVideo) {
      const seekToMs = Math.floor(ratio * durationSec * 1000);
      const idx = currentIndexRef.current;
      const currentVideoRef = videoRefs.current.get(idx);
      if (currentVideoRef?.seek) {
        currentVideoRef.seek(seekToMs);
      }
    }
  }, [progressAnim]);

  seekToPageXRef.current = seekToPageX;

  const scrubPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => durationRef.current > 0,
        onStartShouldSetPanResponderCapture: () => durationRef.current > 0,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
        },
        onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
          return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
        },
        onPanResponderGrant: (evt) => {
          isSeekingRef.current = true;
          setIsSeeking(true);
          const pageX = evt.nativeEvent.pageX;
          scrubInitialPageXRef.current = pageX;
          scrubGestureLayoutRef.current = { ...scrubberLayoutRef.current };
          seekToPageXRef.current(pageX, false, scrubGestureLayoutRef.current);
          Animated.timing(scrubBarHeightAnim, {
            toValue: 11,
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
          setIsSeeking(false);
          lastScrubReleaseTimeRef.current = Date.now();
          scrubGestureLayoutRef.current = null;
          Animated.timing(scrubBarHeightAnim, {
            toValue: 3,
            duration: 200,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderTerminate: () => {
          isSeekingRef.current = false;
          setIsSeeking(false);
          lastScrubReleaseTimeRef.current = Date.now();
          scrubGestureLayoutRef.current = null;
          Animated.timing(scrubBarHeightAnim, {
            toValue: 3,
            duration: 200,
            useNativeDriver: false,
          }).start();
        },
      }),
    [scrubBarHeightAnim]
  );

  const isChangingVideoRef = useRef(false);
  const autoNextHandledForIndexRef = useRef(null);


  // Listen for episode selections from EpisodesScreen when opened from Reels
  useEffect(() => {
    const unsubscribe = subscribeEpisodeSelection(
      async ({ origin, videoData: newVideoData, initialIndex = 0, path: newPath }) => {
        if (origin !== 'Reels') return;
        if (!Array.isArray(newVideoData) || newVideoData.length === 0) return;


        // Defer state updates to the next macrotask to avoid React "useInsertionEffect must not schedule updates" warnings
        setTimeout(() => {
          // Replace current dynamic video data with the selected series episodes
          setDynamicVideoData(newVideoData);
          setApiDataLoaded(true);

          const safeIndex = Math.max(0, Math.min(newVideoData.length - 1, initialIndex));
          setCurrentIndex(safeIndex);

          const selectedVideo = newVideoData[safeIndex];
          if (selectedVideo) {
            const videoId = selectedVideo.id || `video-${safeIndex}`;
            setCurrentPlayingVideo(videoId);
          }

          // Update path so future calls treat this series as loaded
          // We sync it with BOTH the newPath from tray and the current derived 'path' from route params
          // to prevent the API-fetching useEffect from triggering when we return from the tray.
          if (newPath) {
            lastPathRef.current = newPath.toString();
          }
          // Also set the current derived path as the 'last' path to silence the effect
          if (path) {
            lastPathRef.current = path;
          }
          hasInitialApiCall.current = true;

          // Scroll to the selected episode in the Reels list
          setTimeout(() => {
            if (flatListRef.current && safeIndex >= 0) {
              flatListRef.current.scrollToIndex({
                index: safeIndex,
                animated: false,
              });
            }
          }, 100);

          // Start playing the newly selected episode after layout settles
          setTimeout(() => {
            const targetVideoRef = videoRefs.current.get(safeIndex);
            setIsPlaying(true);
            if (targetVideoRef?.play) {
              targetVideoRef.play();
            }
          }, 100);
        }, 0);
      }
    );

    return unsubscribe;
  }, [setDynamicVideoData, setApiDataLoaded, setCurrentIndex, setCurrentPlayingVideo]);
  // Refs to track current UI visibility states to avoid flickers
  const showUIRef = useRef(showUI);
  const showMetadataPopupRef = useRef(showMetadataPopup);
  const MAX_END_GUARD_SIZE = 50;
  // Refs to access current state values in stable callbacks
  const isGuestUserRef = useRef(isGuestUser);
  const isGuestSetRef = useRef(isGuestSet);
  const isPlayingRef = useRef(isPlaying);
  /** Snapshot before pausing when app leaves foreground (Home); used to resume only if user was playing. */
  const wasPlayingBeforeBackgroundRef = useRef(false);
  const userManuallyScrolledRef = useRef(userManuallyScrolled);
  const endStreamFiredRef = useRef(new Set()); // keys: video.id
  const sharedContentIdsRef = useRef(new Set()); // keys: video.id shared in this session
  const startStreamFiredRef = useRef(new Set()); // keys: video.id — prevents duplicate stream_started
  const endReasonRef = useRef(null); // 'user_scroll' | 'auto_end' | 'user_exit'
  const fireEndStreamOnceRef = useRef(null); // set after fireEndStreamOnce is defined, avoids "before initialization" error
  const maybeFireEndStreamUserExitRef = useRef(() => {});
  const showUIWithTimeoutRef = useRef(null); // set after showUIWithTimeout is defined, avoids "before initialization" error


  useEffect(() => {
    isGuestUserRef.current = isGuestUser;
  }, [isGuestUser]);

  useEffect(() => {
    isGuestSetRef.current = isGuestSet;
  }, [isGuestSet]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    userManuallyScrolledRef.current = userManuallyScrolled;
  }, [userManuallyScrolled]);

  // Keep visibility refs in sync
  useEffect(() => {
    showUIRef.current = showUI;
  }, [showUI]);
  useEffect(() => {
    showMetadataPopupRef.current = showMetadataPopup;
  }, [showMetadataPopup]);



  // Optimized viewability config for better audio isolation
  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: VIEWABILITY_THRESHOLD,
    waitForInteraction: false,
    minimumViewTime: 300, // Increased to prevent rapid switching during scroll
  });
  // Stable ref for onViewableItemsChanged so FlatList never sees a changing callback (invariant)
  const viewableItemsChangedHandlerRef = useRef(null);


  // Check subscription status when component mounts or route changes
  useEffect(() => {
    const checkSubscription = async () => {
      try {
        await checkSubscriptionStatus();
      } catch (error) {
        console.error('Error checking subscription status in ReelsScreen:', error);
      }
    };

    checkSubscription();
  }, [route?.params?.path, checkSubscriptionStatus]);

  // Track last watched episode when current index changes
  useEffect(() => {
    if (isSeries && seriesData && isMountedRef.current) {
      const currentLastWatched = getLastWatchedEpisode(seriesData.id);
      if (currentIndex !== currentLastWatched) {
        updateLastWatchedEpisode(seriesData.id, currentIndex);
      }
    }
  }, [currentIndex, isSeries, seriesData?.id, getLastWatchedEpisode, updateLastWatchedEpisode]);

  // Bookmark timer effect - calls createBookmark API every 10 seconds
  useEffect(() => {
    // Only start timer if playing and data is available
    if (!isPlaying || !videoData || videoData.length === 0) {
      return;
    }

    const bookmarkTimer = setInterval(async () => {
      if (!isMountedRef.current || !isPlayingRef.current) {
        return;
      }

      const idx = currentIndexRef.current;
      const currentVideo = videoData[idx];

      if (!currentVideo || !currentVideo.assetId) {
        return;
      }

      // Use refs to get latest values without stale closures or dependency resets
      const currentTimeVal = currentTimeSecondsRef.current;
      const durationVal = durationRef.current || 1; // Avoid divide by zero

      // Get user info for API call
      // Use refs if user object might change, but user object usually stable enough or we can access from closure if deps include it
      // Since 'user' is in deps, it's fine.
      const userId = user?.userId || user?.uid || 57;

      try {
        // Call createBookmark API
        const bookmarkResult = await API.createBookmark({
          assetGroupId: currentVideo?.seriesId || seriesData?.id || path || '',
          assetId: currentVideo.assetId,
          userId: userId,
          duration: Math.floor(currentTimeVal), // Current video time in seconds
          languageId: 1,
          deviceTypeId: API_CONFIG.deviceTypeId
        });

        // Also add to watch history (local storage for now)
        const watchHistoryItem = {
          id: currentVideo.id,
          assetId: currentVideo.assetId,
          title: currentVideo.title,
          seriesTitle: currentVideo.seriesTitle,
          videoUrl: currentVideo.videoUrl,
          thumbnail: currentVideo.thumbnail,
          duration: currentVideo.duration, // metadata duration
          progress: Math.floor((currentTimeVal / durationVal) * 100),
          watchedAt: new Date().toISOString(),
          currentTime: currentTimeVal,
          totalDuration: durationVal
        };

        // Save to AsyncStorage
        try {
          const existingHistory = await AsyncStorage.getItem('watchHistory');
          let historyArray = existingHistory ? JSON.parse(existingHistory) : [];
          historyArray = historyArray.filter(item => item.id !== currentVideo.id);
          historyArray.unshift(watchHistoryItem);
          if (historyArray.length > 50) {
            historyArray = historyArray.slice(0, 50);
          }
          await AsyncStorage.setItem('watchHistory', JSON.stringify(historyArray));
        } catch (storageError) {
          // Failed to save to watch history
        }

      } catch (error) {
        console.warn('Bookmark error:', error);
      }
    }, 30 * 1000); // Every 30 seconds

    // Cleanup timer on unmount or when dependencies change
    return () => {
      clearInterval(bookmarkTimer);
    };
    // Dependencies: 
    // - isPlaying: start/stop timer
    // - videoData: if data is replaced, restart logic
    // - user: if user switches
    // CRITICAL: Do NOT include currentTime or duration here
  }, [isPlaying, videoData, user]);

  // Reset guest watched count when user type changes
  useEffect(() => {
    if (!isGuestUser || !isGuestSet) {
      setGuestWatchedCount(0);
    }
  }, [isGuestUser, isGuestSet]);

  // Clean up videos when video data is completely replaced (not just scrolled)
  // This prevents memory leaks when switching between different series/episodes
  const previousVideoDataRef = useRef(null);
  useEffect(() => {
    if (!dynamicVideoData || dynamicVideoData.length === 0) {
      previousVideoDataRef.current = null;
      return;
    }

    const previousData = previousVideoDataRef.current;
    const currentFirstVideoId = dynamicVideoData[0]?.id || dynamicVideoData[0]?.assetId || null;

    // If video data has been completely replaced (different first video or significant length change)


    // Update ref for next comparison
    previousVideoDataRef.current = dynamicVideoData;
  }, [dynamicVideoData]);



  // Handle initial index from route params (initialIndex or episodeId for deep link)
  useEffect(() => {
    if (route?.params?.initialIndex !== undefined && route?.params?.initialIndex !== 0) {
      const initialIndex = route.params.initialIndex;
      setCurrentIndex(initialIndex);
      if (videoData && videoData[initialIndex]) {
        const currentVideo = videoData[initialIndex];
        const videoId = isSeries && seriesData
          ? `${seriesData.id}-${initialIndex + 1}`
          : currentVideo.id || `video-${initialIndex}`;
        setCurrentPlayingVideo(videoId);
      }
      return;
    }
    const episodeIdFromRoute = route?.params?.episodeId;
    if (episodeIdFromRoute && videoData && videoData.length > 0) {
      let foundIdx = videoData.findIndex(
        (v) => v.id === episodeIdFromRoute || v.assetId === episodeIdFromRoute || v.path === episodeIdFromRoute || String(v.id) === String(episodeIdFromRoute)
      );
      if (foundIdx < 0) {
        const num = parseInt(episodeIdFromRoute.replace(/^episode_/i, ''), 10);
        if (!Number.isNaN(num) && num >= 1) {
          foundIdx = videoData.findIndex((v) => v.episodeNumber === num);
          if (foundIdx < 0) foundIdx = Math.min(num - 1, videoData.length - 1);
        }
      }
      if (foundIdx >= 0) {
        setCurrentIndex(foundIdx);
        const currentVideo = videoData[foundIdx];
        setCurrentPlayingVideo(currentVideo?.id || `video-${foundIdx}`);
      }
    }
  }, [route?.params?.initialIndex, route?.params?.episodeId, videoData, isSeries, seriesData]);

  // Notify parent component of playing state changes
  useEffect(() => {
    if (onPlayingStateChange && isForYouPage && isMountedRef.current) {
      onPlayingStateChange(isPlaying);
    }
  }, [isPlaying, isForYouPage, onPlayingStateChange]);

  // Call asset listing API only when path is available, skipApiCall is false, and user is authenticated (logged in or guest with token)
  useEffect(() => {
    const isAuthenticated = user || isGuestSet;
    // Don't re-fetch if we already have data for this path (unless path changed)
    const isDifferentPath = path && path !== lastPathRef.current;

    if (isDifferentPath && !skipApiCall && isAuthenticated) {
      lastPathRef.current = path;
      hasInitialApiCall.current = true;
      setDynamicVideoData([]);
      setApiDataLoaded(false);
      callAssetListingAPI();
    }
  }, [path, skipApiCall, callAssetListingAPI, user, isGuestSet]);


  // Enhanced cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Clear all timeouts

      if (hideUITimeoutRef.current) {
        clearTimeout(hideUITimeoutRef.current);
      }
    };
  }, []);

  // Handle bookmarking video position to API (defined before handleAutoplayNext / handleViewableItemsChanged to avoid "before initialization" error)
  const bookmarkVideo = useCallback(async (indexToBookmark) => {
    if (isGuestUser || !videoData || indexToBookmark < 0 || indexToBookmark >= videoData.length) return;

    try {
      const video = videoData[indexToBookmark];
      const sId = video.seriesId || seriesData?.id;
      const vId = video.assetId || video.id;
      const pos = Math.floor(currentTimeSecondsRef.current || 0);

      if (sId && vId) {
        await addToHistory(sId, vId, pos);
      }
    } catch (error) {
      // Don't block playback if bookmark API is down; playback continues from 0th episode
    }
  }, [isGuestUser, videoData, seriesData, addToHistory]);

  // Handle viewable items change for autoplay
  // Handle autoplay to next episode or series
  const handleAutoplayNext = useCallback(() => {
    if (!isMountedRef.current) {
      isChangingVideoRef.current = false;
      return;
    }

    if (!autoplayEnabled) {
      isChangingVideoRef.current = false;
      return;
    }

    // Special logic for For You page
    if (isForYouPage && isSeries && seriesData) {
      // For You page: Always move to the next Episode 1 (next series)
      const idx = currentIndexRef.current;
      const nextIndex = (idx + 1) % videoDataRef.current.length;

      // Bookmark before scrolling
      bookmarkVideo(currentIndexRef.current);

      // Update current index immediately for snappier UI transitions
      setCurrentIndex(nextIndex);
      setIsPlaying(isSubscribed || isTrailerMode);

      if (flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({
            index: nextIndex,
            animated: true,
          });
        } catch (error) {
          // Error auto-scrolling to next series
          isChangingVideoRef.current = false;
        }
      } else {
        isChangingVideoRef.current = false;
      }
      return;
    }

    // Regular logic for non-For You pages
    // If we're in a series and there are more episodes
    if (isSeries && seriesData && currentIndexRef.current < videoDataRef.current.length - 1) {
      // Play next episode in the same series
      const nextIndex = currentIndexRef.current + 1;

      // Bookmark before scrolling
      bookmarkVideo(currentIndexRef.current);

      // Update current index immediately for snappier UI transitions
      setCurrentIndex(nextIndex);
      setIsPlaying(isSubscribed || isTrailerMode);

      if (flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({
            index: nextIndex,
            animated: true,
          });
        } catch (error) {
          // Error auto-scrolling to next episode
          isChangingVideoRef.current = false;
        }
      } else {
        isChangingVideoRef.current = false;
      }
    }
    // If we're at the last episode of a series, provide options instead of auto-navigating
    else if (isSeries && seriesData && currentIndexRef.current >= videoDataRef.current.length - 1) {
      // Don't auto-navigate to another series - let user choose
      // Just reset the changing video flag
      isChangingVideoRef.current = false;

      // Optionally show a toast that series is complete
      setToastMessage(`"${seriesData.title}" series completed!`);
      setToastType('info');
      setToastVisible(true);

      // Stay on the current series, don't navigate away
      return;
    }
    // If we're in regular video mode and there are more videos
    else if (!isSeries && currentIndexRef.current < videoDataRef.current.length - 1) {
      const nextIndex = currentIndexRef.current + 1;

      // Bookmark before scrolling using stable ref
      bookmarkVideo(currentIndexRef.current);

      if (flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({
            index: nextIndex,
            animated: true,
          });
        } catch (error) {
          // Error auto-scrolling to next video
          isChangingVideoRef.current = false;
        }
      } else {
        isChangingVideoRef.current = false;
      }
    }
    // If we're at the last video, don't auto-navigate to series
    else if (!isSeries && currentIndexRef.current >= videoDataRef.current.length - 1) {
      // Don't auto-navigate to series - let user choose
      isChangingVideoRef.current = false;

      // Optionally show a toast that video list is complete
      setToastMessage('All videos completed!');
      setToastType('info');
      setToastVisible(true);

      // Stay on the current video, don't navigate away
      return;
    }
    else {
      isChangingVideoRef.current = false;
    }
  }, [isMountedRef, autoplayEnabled, isForYouPage, isSeries, seriesData, bookmarkVideo, setToastMessage, setToastType, setToastVisible, isSubscribed, isTrailerMode]);

  // Enhanced handleViewableItemsChanged for better precision
  const handleViewableItemsChanged = useCallback(({ viewableItems, changed }) => {
    if (!isMountedRef.current || isChangingVideoRef.current || viewableItems.length === 0) {
      return;
    }

    const visibleItem = viewableItems[0]; // Get the most visible item
    if (visibleItem && visibleItem.index !== currentIndexRef.current) {
      // Bookmark the video we are leaving using stable ref
      bookmarkVideo(currentIndexRef.current);

      // Guest restriction: prevent scrolling to 4th video and beyond
      // if (isGuestUserRef.current && isGuestSetRef.current && visibleItem.index >= 3) {
      //   setShowGuestLoginModal(true);

      //   // Force scroll back to the 3rd video (index 2)
      //   if (flatListRef.current) {
      //     flatListRef.current.scrollToIndex({
      //       index: 2, // 3rd video
      //       animated: true,
      //     });
      //   }
      //   return;
      // }
      // ✅ End the currently playing stream ONCE (leaving current item)
      fireEndStreamOnceRef.current?.("user_scroll");
      // Reset auto-next guard so next video can autoplay when it finishes
      autoNextHandledForIndexRef.current = null;
      // Mark that user has manually scrolled
      if (!userManuallyScrolledRef.current) {
        setUserManuallyScrolled(true);
      }

      isChangingVideoRef.current = true;

      // Update current index immediately
      setCurrentIndex(visibleItem.index);
      // Auto-play for subscribed users, or when in trailer mode (to allow trailer playback before subscription)
      setIsPlaying(isSubscribed || isTrailerMode);

      // Set current playing video for quality settings using stable ref
      const data = videoDataRef.current;
      if (data && data[visibleItem.index]) {
        const currentVideo = data[visibleItem.index];
        const videoId = isSeries && seriesData
          ? `${seriesData.id}-${visibleItem.index + 1}`
          : currentVideo.id || `video-${visibleItem.index}`;
        setCurrentPlayingVideo(videoId);
      }

      // Reset progress for new video
      progressAnim.setValue(0);
      setCurrentTime(0);
      setDuration(0);

      // Show UI for 7 seconds when switching videos
      showUIWithTimeoutRef.current?.();


      // Reset changing flag after a very short delay
      setTimeout(() => {
        if (isMountedRef.current) {
          isChangingVideoRef.current = false;
        }
      }, 50); // Reduced from 100ms to 50ms
    }
  }, [isSeries, seriesData, autoplayEnabled, setCurrentPlayingVideo, isSubscribed, isTrailerMode, bookmarkVideo, setShowGuestLoginModal, flatListRef, setUserManuallyScrolled, progressAnim]);

  useEffect(() => {
    viewableItemsChangedHandlerRef.current = handleViewableItemsChanged;
  }, [handleViewableItemsChanged]);

  // Stable callback for FlatList - must not change reference (FlatList invariant)
  const onViewableItemsChangedStable = useCallback((info) => {
    viewableItemsChangedHandlerRef.current?.(info);
  }, []);

  // UI Visibility Management with safety checks
  const showUIWithTimeout = useCallback(() => {
    if (!isMountedRef.current) return;

    // If a hide animation is in progress, stop it to prevent flicker
    metadataAnimValue.stopAnimation(() => {
      // Ensure immediate visible state for next show
      metadataAnimValue.setValue(1);
    });

    // Only re-show metadata if it was previously hidden
    if (!showMetadataPopupRef.current) {
      setShowMetadataPopup(true);
    }
    setShowUI(true);

    // Clear existing timeout
    if (hideUITimeoutRef.current) {
      clearTimeout(hideUITimeoutRef.current);
      hideUITimeoutRef.current = null;
    }
    // Set new timeout to hide UI and metadata popup after 7 seconds
    hideUITimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setShowUI(false);
        // Hide metadata popup with animation
        Animated.timing(metadataAnimValue, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          if (isMountedRef.current) {
            setShowMetadataPopup(false);
            metadataAnimValue.setValue(1); // Reset for next show
          }
        });
      }
    }, 7000);
  }, [metadataAnimValue]);

  useEffect(() => {
    showUIWithTimeoutRef.current = showUIWithTimeout;
  }, [showUIWithTimeout]);

  const handleScreenTap = useCallback(() => {
    if (showUI) {
      // If UI is visible, hide it immediately
      setShowUI(false);
      // Also hide metadata popup immediately
      setShowMetadataPopup(false);
      if (hideUITimeoutRef.current) {
        clearTimeout(hideUITimeoutRef.current);
        hideUITimeoutRef.current = null;
      }
    } else {
      // If UI is hidden, show it with timeout (metadata popup will also show)
      showUIWithTimeout();
    }
  }, [showUI, showUIWithTimeout]);

  const onCurrentPlayerPlayingChange = useCallback((playing) => {
    currentNativePlayingRef.current = !!playing;
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!isMountedRef.current || isChangingVideoRef.current) return;

    // Check subscription status - prevent playback for non-subscribed users on all pages,
    // except when we are in trailer-only mode (trailer should be watchable by everyone)
    if (!isSubscribed && !isTrailerMode) {
      // Show toast message instead of popup
      setToastMessage('You need to subscribe to watch this content');
      setToastType('error');
      setToastVisible(true);
      return;
    }

    const shouldPlay = !currentNativePlayingRef.current;
    setIsPlaying(shouldPlay);
    showUIWithTimeout();
    if (shouldPlay) {
      safePlayCurrentVideo();
    } else {
      safePauseCurrentVideo();
    }
  }, [showUIWithTimeout, isSubscribed, isTrailerMode, safePlayCurrentVideo, safePauseCurrentVideo]);

  // Handle playback status updates
  const handlePlaybackStatusUpdate = useCallback((status, videoId) => {
    if (!status || !isMountedRef.current) return;


    // Update current time and duration
    if (status.positionMillis !== undefined) {
      const currentTimeInSeconds = status.positionMillis / 1000;
      currentTimeSecondsRef.current = currentTimeInSeconds; // ✅ always latest

      // Throttle state updates for digital time display to avoid excessive re-renders
      const roundedTime = Math.floor(currentTimeInSeconds);
      if (currentTimeRef.current !== roundedTime) {
        currentTimeRef.current = roundedTime;
        setCurrentTime(roundedTime);
        setCurrentTimePlayed(roundedTime);
      }

      // Save video position every 5 seconds to avoid too frequent saves
      if (videoId && roundedTime % 5 === 0 && currentTimeInSeconds % 1 < 0.2) {
        saveVideoPosition(videoId, roundedTime);
      }
    }
    if (status.durationMillis !== undefined && !isNaN(status.durationMillis) && status.durationMillis > 0) {
      // Floor ms→seconds: native/exo often reports e.g. 88500ms; Math.round would show 89s for an 88s asset.
      const vidDuration = Math.floor(status.durationMillis / 1000);
      if (durationRef.current !== vidDuration) {
        setDuration(vidDuration);
        durationRef.current = vidDuration;
      }
      if (videoId != null && String(videoId).length > 0) {
        videoDurationSecondsByIdRef.current.set(String(videoId), vidDuration);
      }
    }

    // Check if video has just started playing
    if (status.isPlaying && status.positionMillis !== undefined && status.positionMillis < 1000) {
      // Show metadata popup when video starts playing (will hide with main UI)
      setShowMetadataPopup(true);
      showUIWithTimeout();
      // Fire stream_started once per video
      const currentVideo = videoData?.[currentIndexRef.current];
      const vid = currentVideo?.id || currentVideo?.path;
      if (vid && !startStreamFiredRef.current.has(vid)) {
        startStreamFiredRef.current.add(vid);
        handleStartStreamEvent(vid);
      }
    }

    // Check if video has finished playing (scrubber reaches the end)
    const durationMs = status.durationMillis;
    const positionMs = status.positionMillis;
    const isAtEndIosFallback =
      Platform.OS === 'ios' &&
      typeof durationMs === 'number' &&
      typeof positionMs === 'number' &&
      durationMs > 0 &&
      positionMs >= durationMs * 0.98;

    if (status.didJustFinish || isAtEndIosFallback) {
      // Prevent repeated handling for the same index while player stays at the end.
      // We only guard when autoplay is actually enabled; when it's disabled we don't
      // want to permanently block future auto-next once the user re-enables it.
      const idx = currentIndexRef.current;
      if (autoplayEnabled && autoNextHandledForIndexRef.current === idx) {
        return;
      }

      if (autoplayEnabled) {
        autoNextHandledForIndexRef.current = idx;
      } else {
        // Autoplay is off – make sure we don't leave a stale guard value around
        // that would block auto-next the next time this episode finishes.
        autoNextHandledForIndexRef.current = null;
      }

      // Bookmark video at the end using stable ref
      bookmarkVideo(currentIndexRef.current);

      // Clear saved position when video finishes
      if (videoId) {
        clearVideoPosition(videoId);

      }
      // ✅ EndStream ONCE (finish)
      fireEndStreamOnceRef.current?.("auto_end");

      // ✅ then scroll / next
      // No need to check for coin deduction when video finishes since we deduct immediately when it starts

      // Trigger autoplay to next episode or series
      handleAutoplayNext();
    }

    // Update progress animation (skip while user is scrubbing or in post-scrub cooldown on iOS)
    const inScrubCooldown = lastScrubReleaseTimeRef.current > 0 && (Date.now() - lastScrubReleaseTimeRef.current) < SCRUB_COOLDOWN_MS;

    // Only update progress animation when NOT seeking or in cooldown
    if (!isSeekingRef.current && !inScrubCooldown && status.positionMillis !== undefined) {
      const currentDurationVal = (status.durationMillis && !isNaN(status.durationMillis))
        ? status.durationMillis
        : (durationRef.current * 1000);

      if (currentDurationVal > 0 && isFinite(currentDurationVal)) {
        const progress = Math.min(Math.max(0, status.positionMillis / currentDurationVal), 1);
        if (progressAnim && typeof progressAnim.setValue === 'function') {
          progressAnim.setValue(progress);
        }
      }
    }
  }, [handleAutoplayNext, saveVideoPosition, clearVideoPosition, user, path, isSubscribed, bookmarkVideo, showUIWithTimeout]);

  // Handle Watch Now button press for For You page
  const handleWatchNow = useCallback(() => {
    const idx = currentIndexRef.current;
    const data = videoDataRef.current;
    if (isForYouPage && isSeries && seriesData && data && idx < data.length) {
      const currentItem = data[idx];

      // Animate button press
      Animated.sequence([
        Animated.timing(watchNowAnimValue, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(watchNowAnimValue, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Check subscription status
      if (!isSubscribed) {
        // Show subscription offer modal
        setLockedEpisode({
          ...currentItem,
          isSeries: true,
          seriesData: {
            title: currentItem.seriesTitle || currentItem.title,
            id: currentItem.assetGroupId?.toString() || currentItem.seriesId,
            description: currentItem.description
          }
        });
        setSubscriptionOfferVisible(true);
        return;
      }

      // User is subscribed, proceed with navigation
      // Show toast notification
      setToastMessage(`Loading "${currentItem.seriesTitle || 'series'}" episodes...`);
      setToastType('info');
      setToastVisible(true);

      // Navigate to Reels with path parameter to fetch all episodes from API
      navigation.navigate('Reels', {
        path: currentItem.assetGroupId?.toString() || currentItem.path,
        isForYouPage: false, // This is now a regular series view
        playback_source: 'watch_series_button',
        seriesData: {
          title: currentItem.seriesTitle || currentItem.title,
          id: currentItem.assetGroupId?.toString() || currentItem.seriesId,
          description: currentItem.description
        },
        isSeries: true,
        skipApiCall: false, // Enable API call to fetch all episodes
      });
    }
  }, [isForYouPage, isSeries, seriesData, navigation, watchNowAnimValue, isSubscribed]);

  // Handle "Watch Series" button press when starting from trailer-only mode
  const handleWatchSeries = useCallback(() => {
    // If user is not subscribed, send them to subscription flow
    if (!isSubscribed) {
      if (Platform.OS === 'ios') {
        navigation.navigate('Subscription');
      } else {
        navigation.navigate('SubscriptionWebView');
      }
      try {
        const idx = currentIndexRef.current;
        const currentVideo = videoDataRef.current[idx];
        if (!currentVideo) {
          return;
        }
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
          content_id: currentVideo.id || '',
          content_title: seriesData?.title || currentVideo.title || 'Unknown',
          content_type: 'series',
          episode_number: idx + 1 || 1,
          season_number: 1,
          total_episodes: (videoData && videoData.length > 0) ? videoData.length : (currentVideo?.totalEpisodes || 1),
          episode_title: currentVideo.title || '',
          page_name: "Reels",
          access_type: "paid_subscription",
          subscription_tier: subscriptionTierEvent,
          is_first_episode: currentIndex === 0,
          button_name: "Subscribe to Watch",
          button_location: "player_screen",
          playback_source: "watch_series_button",
          previous_page: "trailer_mode",
          user_id: userIdEvent,
          distinct_id: userIdEvent,
          subscription_plan_name: subscriptionPlanName,
          is_logged_in: isLoggedIn,
          language: languageEvent,
        }
        analyticsService.logWatchActionClicked(currentVideo.id, properties);
      } catch (error) {
        // Error logged
        return;
      }
      return;
    }
    // If episodes are already loaded, just exit trailer mode
    if (episodesLoaded || apiDataLoaded) {
      try {
        const idx = currentIndexRef.current;
        const currentVideo = videoDataRef.current[idx];
        if (currentVideo) {
          const analyticsService = require('../services/analytics').default;
          const subscriptionTier = isSubscribed ? 'premium' : 'free';
          const totalEps = (videoDataRef.current && videoDataRef.current.length > 0) ? videoDataRef.current.length : (currentVideo?.totalEpisodes || 1);
          analyticsService.logWatchActionClicked(currentVideo.id, {
            content_id: currentVideo.id || '',
            content_title: seriesData?.title || currentVideo.title || 'Unknown',
            content_type: 'series',
            episode_number: idx + 1,
            episode_title: currentVideo.title || '',
            season_number: 1,
            total_episodes: totalEps,
            subscription_tier: subscriptionTier,
            access_type: 'paid_subscription',
            button_name: 'Watch Show',
            button_location: 'player_screen',
            is_first_episode: currentIndex === 0,
            playback_source: 'watch_series_button',
            previous_page: isForYouPage ? 'for_you' : 'trailer_mode',
            page_name: 'Reels',
          });
        }
      } catch (e) {
        // ignore
      }
      setIsTrailerMode(false);
      return;
    }

    // Trigger asset listing API to load episodes and start normal playback
    if (!isApiLoading) {
      try {
        const currentVideo = videoData[currentIndex];
        if (currentVideo) {
          const analyticsService = require('../services/analytics').default;
          const subscriptionTier = isSubscribed ? 'premium' : 'free';
          const totalEps = (videoData && videoData.length > 0) ? videoData.length : (currentVideo?.totalEpisodes || 1);
          analyticsService.logWatchActionClicked(currentVideo.id, {
            content_id: currentVideo.id || '',
            content_title: seriesData?.title || currentVideo.title || 'Unknown',
            content_type: 'series',
            episode_number: currentIndex + 1,
            episode_title: currentVideo.title || '',
            season_number: 1,
            total_episodes: totalEps,
            subscription_tier: subscriptionTier,
            access_type: 'paid_subscription',
            button_name: 'Watch Show',
            button_location: 'player_screen',
            is_first_episode: currentIndex === 0,
            playback_source: 'watch_series_button',
            previous_page: isForYouPage ? 'for_you' : 'trailer_mode',
            page_name: 'Reels',
          });
        }
      } catch (e) {
        // ignore
      }
      callAssetListingAPI();
    }
  }, [isSubscribed, navigation, episodesLoaded, apiDataLoaded, isApiLoading, callAssetListingAPI, seriesData, isForYouPage]);

  useEffect(() => {
    videoDurationSecondsByIdRef.current.clear();
  }, [path]);

  // Format time for display
  const formatTime = useCallback((seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);


  const durationToSeconds = (duration) => {
    if (!duration || typeof duration !== "string") return 0;

    const parts = duration.split(":").map(Number);

    // mm:ss or hh:mm:ss support
    if (parts.length === 2) {
      const [m, s] = parts;
      return m * 60 + s;
    }

    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + s;
    }

    return 0;
  };

  /** Length in seconds for analytics: prefer measured player duration, then API string/number, then live ref fallback. */
  const getEffectiveVideoDurationSeconds = (video, liveDurationFallbackSec = 0) => {
    if (!video) return 0;
    const key = video.id != null ? String(video.id) : video.path != null ? String(video.path) : '';
    if (key) {
      const stored = videoDurationSecondsByIdRef.current.get(key);
      if (typeof stored === 'number' && stored > 0) return stored;
    }
    if (typeof video.duration === 'number' && !Number.isNaN(video.duration) && video.duration > 0) {
      return Math.floor(video.duration);
    }
    if (typeof video.duration === 'string' && video.duration.trim()) {
      const parsed = durationToSeconds(video.duration);
      if (parsed > 0) return parsed;
    }
    if (typeof liveDurationFallbackSec === 'number' && liveDurationFallbackSec > 0) {
      return Math.floor(liveDurationFallbackSec);
    }
    return 0;
  };

  // handleStartStreamEvent 

  const handleStartStreamEvent = async (videoId) => {
    try {
      if (seriesData == null || seriesData == undefined) {
        return;
      }
      const currentVideo = videoData[currentIndex];
      if (!currentVideo) {
        return;
      }
      // Get user profile ID from auth context
      const profileId = user?.profileId || user?.userId || user?.uid || 529;
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
      // content_title = show/series name when series, else episode/reel title; episode_title = episode name when series only
      const contentTitleForEvent = (isSeries && seriesData?.title) ? seriesData.title : (currentVideo.title || 'Unknown');
      const episodeTitleForEvent = isSeries ? (currentVideo.title || currentVideo.label || '') : '';
      const contentGenreStartRaw = seriesData?.geners || currentVideo?.geners || formatGenresForDisplay(currentVideo?.genre) || formatGenresForDisplay(currentVideo?.seriesGenres) || '';
      const contentGenreStart = (Array.isArray(contentGenreStartRaw) ? contentGenreStartRaw.join(' · ') : String(contentGenreStartRaw || '')).trim() || 'Uncategorized';
      const keywordsValStart = seriesData?.keywords || currentVideo?.keywords || '';
      var properties = {
        userId: profileId,
        content_id: videoId,
        content_title: contentTitleForEvent,
        content_type: isSeries ? 'episode' : 'reel',

        original_show_name: seriesData?.title || currentVideo?.seriesTitle || '',
        original_show_id: seriesData?.id || currentVideo?.seriesId || '',
        episode_number: isSeries ? (currentIndex + 1 || 0) : 0,
        season_number: isSeries ? 1 : 0,
        episode_title: episodeTitleForEvent,
        content_genre: contentGenreStart,
        age_rating: seriesData?.age_rating || currentVideo?.age_rating || '',
        release_date: seriesData?.release_date || currentVideo?.release_date || '',
        year_of_release: seriesData?.year_of_release || currentVideo?.year_of_release || '',
        actor: seriesData?.actor || currentVideo?.actor || '',
        keyword: keywordsValStart,
        keywords: keywordsValStart,
        length: getEffectiveVideoDurationSeconds(currentVideo, 0),
        playback_source: playbackSource,
        video_quality: videoQuality || '',
        connection_type: (await getNetworkTypeOnce()).type || '',
        consumption_type: 'Online',
        page_name: "Reels",
        Audio_on: true,
        user_id: userIdEvent,
        distinct_id: userIdEvent,
        subscription_tier: subscriptionTierEvent,
        subscription_plan_name: subscriptionPlanName,
        is_logged_in: isLoggedIn,
        language: languageEvent,
        // Cliffhanger & Opening Hook analytics
        opening_hook_strength: currentVideo?.openingHookStrength || null,
        opening_hook_effectiveness_score: currentVideo?.openingHookEffectiveness != null ? parseInt(currentVideo.openingHookEffectiveness, 10) : null,
        opening_hook_start_seconds: currentVideo?.openingHookStart ? durationToSeconds(currentVideo.openingHookStart) : null,
        opening_hook_end_seconds: currentVideo?.openingHookEnd ? durationToSeconds(currentVideo.openingHookEnd) : null,
        opening_hook_tags: currentVideo?.openingHookKeywords ? String(currentVideo.openingHookKeywords).split('||').map(s => s.trim()).filter(Boolean) : null,
        cliffhanger_strength: currentVideo?.cliffhangerStrength || null,
        cliffhanger_effectiveness_score: currentVideo?.cliffhangerEffectiveness != null ? parseInt(currentVideo.cliffhangerEffectiveness, 10) : null,
        cliffhanger_start_seconds: currentVideo?.cliffhangerStart ? durationToSeconds(currentVideo.cliffhangerStart) : null,
        cliffhanger_end_seconds: currentVideo?.cliffhangerEnd ? durationToSeconds(currentVideo.cliffhangerEnd) : null,
        cliffhanger_tags: currentVideo?.cliffhangerKeywords ? String(currentVideo.cliffhangerKeywords).split('||').map(s => s.trim()).filter(Boolean) : null,
        tropes: currentVideo?.tropesName ? String(currentVideo.tropesName).split('||').map(s => s.trim()).filter(Boolean) : null,
      }
      analyticsService.logStartStream(videoId, contentTitleForEvent, properties);
    } catch (error) {
      console.error('Error tracking handleStartStreamEvent:', error);
    }
  }
  const handleEndStreamEvent = async () => {
    const raw = endReasonRef.current;
    const endReason =
      raw === 'user_scroll' || raw === 'auto_end' || raw === 'user_exit'
        ? raw
        : 'unknown';
    try {

      const currentVideo = videoData[currentIndex];
      if (!currentVideo) {
        return;
      }
      var playedSeconds = Math.floor(currentTimeSecondsRef.current || 0);
      const totalSeconds = getEffectiveVideoDurationSeconds(currentVideo, durationRef.current);
      if (playedSeconds === 0 && totalSeconds > 0) {
        playedSeconds = totalSeconds;
      }
      // Get user profile ID from auth context
      const profileId = user?.profileId || user?.userId || user?.uid || 529;
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
      // content_title = show/series name when series, else video title; episode_title = episode name only when series
      const contentTitleForEvent = (isSeries && seriesData?.title) ? seriesData.title : (currentVideo.title || 'Unknown');
      const episodeTitleForEvent = isSeries ? (currentVideo.title || currentVideo.label || '') : '';
      // Merge metadata from seriesData (route) and currentVideo (API-loaded) so stream_finished has non-empty values
      const contentGenreRaw = seriesData?.geners || currentVideo?.geners || formatGenresForDisplay(currentVideo?.genre) || formatGenresForDisplay(currentVideo?.seriesGenres) || '';
      const contentGenre = (Array.isArray(contentGenreRaw) ? contentGenreRaw.join(' · ') : String(contentGenreRaw || '')).trim() || 'Uncategorized';
      const ageRating = seriesData?.age_rating || currentVideo?.age_rating || '';
      const releaseDate = seriesData?.release_date || currentVideo?.release_date || '';
      const yearOfRelease = seriesData?.year_of_release || currentVideo?.year_of_release || '';
      const actor = seriesData?.actor || currentVideo?.actor || '';
      const keywordsVal = seriesData?.keywords || currentVideo?.keywords || '';
      const contentLanguage = (seriesData?.language || currentVideo?.language || user?.languagePreference || languageEvent || 'en').trim() || 'en';
      var properties = {
        userId: profileId,
        content_id: currentVideo.id,
        content_title: contentTitleForEvent,
        content_type: isSeries ? 'episode' : 'reel',

        original_show_name: seriesData?.title || currentVideo?.seriesTitle || '',
        original_show_id: seriesData?.id || currentVideo?.seriesId || '',
        episode_number: isSeries ? (currentIndex + 1 || 0) : 0,
        season_number: isSeries ? 1 : 0,
        episode_title: episodeTitleForEvent,
        content_genre: contentGenre,
        age_rating: ageRating,
        release_date: releaseDate,
        year_of_release: yearOfRelease,
        actor,
        keyword: keywordsVal,
        keywords: keywordsVal,
        length: totalSeconds,

        // ✅ Accurate final numbers (no state race)
        watch_duration: playedSeconds,
        completion_percentage: totalSeconds > 0
          ? Math.min(100, Math.round((playedSeconds / totalSeconds) * 100))
          : 0,
        is_completed: totalSeconds > 0 ? playedSeconds >= totalSeconds : false,
        playback_source: playbackSource,
        video_quality: videoQuality || '',
        connection_type: (await getNetworkTypeOnce()).type || '',
        consumption_type: 'Online',
        user_subscribed: isSubscribed,
        user_saved: (() => {
          const seriesId = String(seriesData?.id || path || '');
          return seriesId ? isSeriesInMyList(seriesId) : false;
        })(),
        user_shared: sharedContentIdsRef.current.has(String(currentVideo.id)),
        reaction: likedVideos.has(currentVideo.id) ? 'Like' : 'None',
        User_scrolled: userManuallyScrolled,
        content_language: contentLanguage,
        subtitle_language: seriesData?.subtitleLanguage || currentVideo?.subtitleLanguage || 'None',
        subtitle_on: false,
        Audio_on: true,
        end_reason: endReason,
        user_id: userIdEvent,
        distinct_id: userIdEvent,
        subscription_tier: subscriptionTierEvent,
        subscription_plan_name: subscriptionPlanName,
        is_logged_in: isLoggedIn,
        language: languageEvent,
        // Cliffhanger & Opening Hook analytics
        opening_hook_strength: currentVideo?.openingHookStrength || null,
        opening_hook_effectiveness_score: currentVideo?.openingHookEffectiveness != null ? parseInt(currentVideo.openingHookEffectiveness, 10) : null,
        opening_hook_start_seconds: currentVideo?.openingHookStart ? durationToSeconds(currentVideo.openingHookStart) : null,
        opening_hook_end_seconds: currentVideo?.openingHookEnd ? durationToSeconds(currentVideo.openingHookEnd) : null,
        opening_hook_tags: currentVideo?.openingHookKeywords ? String(currentVideo.openingHookKeywords).split('||').map(s => s.trim()).filter(Boolean) : null,
        cliffhanger_strength: currentVideo?.cliffhangerStrength || null,
        cliffhanger_effectiveness_score: currentVideo?.cliffhangerEffectiveness != null ? parseInt(currentVideo.cliffhangerEffectiveness, 10) : null,
        cliffhanger_start_seconds: currentVideo?.cliffhangerStart ? durationToSeconds(currentVideo.cliffhangerStart) : null,
        cliffhanger_end_seconds: currentVideo?.cliffhangerEnd ? durationToSeconds(currentVideo.cliffhangerEnd) : null,
        cliffhanger_tags: currentVideo?.cliffhangerKeywords ? String(currentVideo.cliffhangerKeywords).split('||').map(s => s.trim()).filter(Boolean) : null,
        tropes: currentVideo?.tropesName ? String(currentVideo.tropesName).split('||').map(s => s.trim()).filter(Boolean) : null,
      }
      analyticsService.logEndStream(currentVideo.id, contentTitleForEvent, properties);
    } catch (error) {
      console.error('Error tracking handleEndStreamEvent:', error);
    } finally {
      endReasonRef.current = null; // ✅ reset
    }
  }
  const fireEndStreamOnce = useCallback(
    (reason) => {
      const idx = currentIndexRef.current;
      const currentVideo = videoData?.[idx];
      if (!currentVideo) return;

      const key = String(currentVideo.id ?? idx);

      // ✅ Deduplicate: fire end stream only once for this video
      if (endStreamFiredRef.current.has(key)) return;

      endStreamFiredRef.current.add(key);

      // optional: prevent unbounded growth
      if (endStreamFiredRef.current.size > MAX_END_GUARD_SIZE) {
        // keep it simple: reset if it grows too large
        endStreamFiredRef.current.clear();
        endStreamFiredRef.current.add(key);
      }

      endReasonRef.current = reason;
      // ✅ set time played from ref (accurate)
      const playedSeconds = Math.floor(currentTimeSecondsRef.current || 0);
      setCurrentTimePlayed(playedSeconds);

      // ✅ your analytics end stream
      handleEndStreamEvent();
    },
    [videoData, handleEndStreamEvent, setCurrentTimePlayed]
  );

  useEffect(() => {
    fireEndStreamOnceRef.current = fireEndStreamOnce;
  }, [fireEndStreamOnce]);

  maybeFireEndStreamUserExitRef.current = () => {
    const idx = currentIndexRef.current;
    const currentVideo = videoDataRef.current?.[idx];
    if (!currentVideo) return;
    const startVid = currentVideo.id || currentVideo.path;
    if (startVid == null || startVid === '') return;
    const started =
      startStreamFiredRef.current.has(startVid) ||
      startStreamFiredRef.current.has(String(startVid));
    if (!started) return;
    fireEndStreamOnceRef.current?.('user_exit');
  };

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', () => {
      maybeFireEndStreamUserExitRef.current?.();
    });
    return sub;
  }, [navigation]);

  const handleFailedStreamEvent = async (videoId, error) => {
    try {
      const currentVideo = videoData[currentIndex];
      if (!currentVideo) {
        return;
      }
      // Get user profile ID from auth context
      const profileId = user?.profileId || user?.userId || user?.uid || 529;
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
      const contentTitleForEvent = (isSeries && seriesData?.title) ? seriesData.title : (currentVideo.title || 'Unknown');
      const episodeTitleForEvent = isSeries ? (currentVideo.title || currentVideo.label || '') : '';
      const contentGenreFail = (seriesData?.geners || currentVideo?.geners || formatGenresForDisplay(currentVideo?.genre) || formatGenresForDisplay(currentVideo?.seriesGenres) || '').trim() || 'Uncategorized';
      const keywordsValFail = seriesData?.keywords || currentVideo?.keywords || '';
      var properties = {
        userId: profileId,
        content_id: videoId,
        content_title: contentTitleForEvent,
        content_type: isSeries ? 'episode' : 'reel',

        original_show_name: seriesData?.title || currentVideo?.seriesTitle || '',
        original_show_id: seriesData?.id || currentVideo?.seriesId || '',
        episode_number: isSeries ? (currentIndex + 1 || 0) : 0,
        season_number: isSeries ? 1 : 0,
        episode_title: episodeTitleForEvent,
        content_genre: contentGenreFail,
        age_rating: seriesData?.age_rating || currentVideo?.age_rating || '',
        release_date: seriesData?.release_date || currentVideo?.release_date || '',
        year_of_release: seriesData?.year_of_release || currentVideo?.year_of_release || '',
        actor: seriesData?.actor || currentVideo?.actor || '',
        keyword: keywordsValFail,
        keywords: keywordsValFail,
        length: getEffectiveVideoDurationSeconds(currentVideo, durationRef.current),
        playback_source: playbackSource,
        video_quality: videoQuality || '',
        connection_type: (await getNetworkTypeOnce()).type || '',
        consumption_type: 'Online',
        page_name: "Reels",
        fail_reason: 'Stream Error',
        error_code: error?.code || error,
        time_watched_before_failure: currentTime,
        buffering_events: 0,
        user_id: userIdEvent,
        distinct_id: userIdEvent,
        subscription_tier: subscriptionTierEvent,
        subscription_plan_name: subscriptionPlanName,
        is_logged_in: isLoggedIn,
        language: languageEvent,
      }
      analyticsService.logFailedStream(videoId, contentTitleForEvent, properties);
    } catch (error) {
      console.error('Error tracking handleFailedStreamEvent:', error);
    }
  }
  // Handle like button press with animation and API call
  const handleLike = useCallback(async (videoId) => {
    showUIWithTimeout(); // Show UI for 7 seconds after button press

    // Block like for guest / unauthenticated users, same as watchlist guard
    const userId = user?.userId || user?.uid || null;
    if (isGuestUser || !userId) {
      setToastMessage('Please login in to like videos');
      setToastType('error');
      if (toastVisible) {
        setToastVisible(false);
        setTimeout(() => setToastVisible(true), 10);
      } else {
        setToastVisible(true);
      }
      return;
    }

    // Get current video data using stable ref
    const idx = currentIndexRef.current;
    const currentVideo = videoDataRef.current[idx];
    if (!currentVideo) {
      return;
    }

    // Determine if this is a like or unlike action
    const isCurrentlyLiked = likedVideos.has(videoId);

    // Update UI immediately for instant feedback
    const newLikedVideos = new Set(likedVideos);
    const newLikeCounts = { ...likeCounts };

    if (isCurrentlyLiked) {
      newLikedVideos.delete(videoId);
      const currentCount = parseInt(newLikeCounts[videoId] || '0');
      newLikeCounts[videoId] = Math.max(0, currentCount - 1).toString();
      // setToastMessage('Removed from favorites');
      // setToastType('success');
    } else {
      newLikedVideos.add(videoId);
      const currentCount = parseInt(newLikeCounts[videoId] || '0');
      newLikeCounts[videoId] = (currentCount + 1).toString();
      // setToastMessage('Added to favorites');
      // setToastType('success');

      Animated.sequence([
        Animated.timing(likeAnimValue, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(likeAnimValue, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }

    setLikedVideos(newLikedVideos);
    setLikeCounts(newLikeCounts);
    // setToastVisible(true);

    // Track analytics
    try {
      const analyticsService = require('../services/analytics').default;
      if (isCurrentlyLiked) {
        analyticsService.logUnlikeVideo(videoId, currentVideo.title || 'Unknown');
      } else {
        analyticsService.logLikeVideo(videoId, currentVideo.title || 'Unknown');
      }
    } catch (error) {
      console.error('Error tracking like/unlike analytics:', error);
    }

    // API call in background
    try {
      const assetId = currentVideo.assetId || currentVideo.id;
      if (assetId == null) {
        return;
      }

      if (isCurrentlyLiked) {
        // Unlike
        removeFavourite(assetId);
        await API.deleteAssetFavourite({
          assetId: assetId,
        });
      } else {
        // Like
        addFavourite(assetId);
        await API.assetfavourite({
          assetId: assetId,
          type: 1
        });
      }
    } catch (error) {
      // Revert on error
      if (isCurrentlyLiked) {
        newLikedVideos.add(videoId);
        const currentCount = parseInt(newLikeCounts[videoId] || '0');
        newLikeCounts[videoId] = (currentCount + 1).toString();
      } else {
        newLikedVideos.delete(videoId);
        const currentCount = parseInt(newLikeCounts[videoId] || '0');
        newLikeCounts[videoId] = Math.max(0, currentCount - 1).toString();
      }
      setLikedVideos(newLikedVideos);
      setLikeCounts(newLikeCounts);

      const assetId = currentVideo.assetId || currentVideo.id;
      if (assetId != null) {
        if (isCurrentlyLiked) {
          // We tried to unlike but failed, so ensure it's still in favourites
          addFavourite(assetId);
        } else {
          // We tried to like but failed, so ensure it's removed from favourites
          removeFavourite(assetId);
        }
      }
    }
  }, [showUIWithTimeout, user, isGuestUser, likedVideos, likeCounts, likeAnimValue, removeFavourite, addFavourite, setToastMessage, setToastType, toastVisible, setToastVisible]);

  // Handle save/remove from My List - Clean optimistic implementation
  const handleMyListToggle = useCallback(async (videoId) => {
    showUIWithTimeout();

    const userId = user?.userId || user?.uid || null;
    if (isGuestUser || !userId) {
      setToastMessage('Please login to add to watchlist');
      setToastType('error');
      setToastVisible(true);
      return;
    }

    // Get series ID from current video or seriesData using stable refs
    const idx = currentIndexRef.current;
    const currentVideo = videoDataRef.current[idx];
    const seriesId = String(currentVideo?.seriesId || seriesData?.id || path || '');

    if (!seriesId) {
      console.warn('No series ID found for watchlist toggle');
      return;
    }

    // Check current saved state from context
    const isCurrentlySaved = isSeriesInMyList(seriesId);

    setToastMessage(isCurrentlySaved ? 'Removed from My List' : 'Saved to My List');
    setToastType('success');
    setToastVisible(true);

    // Animation
    Animated.sequence([
      Animated.timing(saveAnimValue, { toValue: 1.2, duration: 100, useNativeDriver: true }),
      Animated.timing(saveAnimValue, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    // Call centralized context functions (they handle API and optimistic updates)
    if (isCurrentlySaved) {
      const result = await removeSeriesFromMyList(seriesId, userId);
      if (!result.success) {
        setToastMessage('Failed to update My List');
        setToastType('error');
        setToastVisible(true);
      }
    } else {
      const result = await addSeriesToMyList(seriesId, userId);
      if (!result.success) {
        setToastMessage('Failed to update My List');
        setToastType('error');
        setToastVisible(true);
      }
    }
  }, [showUIWithTimeout, user, isGuestUser, seriesData, path, isSeriesInMyList, saveAnimValue, removeSeriesFromMyList, addSeriesToMyList, setToastMessage, setToastType, setToastVisible]);


  // Share to specific social media platform
  const shareToSocialMedia = async (video, platform) => {
    showUIWithTimeout();

    safePauseCurrentVideo();

    try {
      const { shareableLink, assetDeepLink } = getShareLinksForVideo(video, isSeries, seriesData);

      const videoTitle = isSeries && seriesData && seriesData.title && video.title
        ? `${seriesData.title} - ${video.title}`
        : (video.title || 'Check out this amazing video!');

      const videoDescription = isSeries && (video.episodeNumber != null || video.totalEpisodes != null)
        ? `Episode ${video.episodeNumber ?? 1} of ${video.totalEpisodes ?? 0} - Amazing content to watch!`
        : (isSeries && seriesData && seriesData.description ? seriesData.description : (video.description || 'Watch this incredible content!'));

      const creatorName = video.creator || 'Series Creator';

      const shareMessage = `${videoTitle} by ${creatorName}\n\n${videoDescription}\n\nWatch on FastTV: ${shareableLink}\n\n#FastTV #ShortVideos #Entertainment`;

      const shareOptions = {
        title: videoTitle,
        message: shareMessage,
        url: Platform.OS === 'ios' ? undefined : shareableLink,
      };

      const result = await Share.share(shareOptions, {
        dialogTitle: `Share to ${platform}`,
      });

      // Removed success toast on share action
      if (result.action === Share.sharedAction) {
        // No toast/alert needed
      }

    } catch (error) {
      console.error(`Share to ${platform} failed:`, error);
      // Fallback to general share
      handleAdvancedShare(video);
    }

    // Resume video after sharing
    setTimeout(() => {
      if (isMountedRef.current && isPlaying) safePlayCurrentVideo();
    }, 500);
  };

  // Direct share function as fallback
  const handleDirectShare = useCallback(async (video) => {
    showUIWithTimeout();

    safePauseCurrentVideo();

    try {
      const { shareableLink, assetDeepLink } = getShareLinksForVideo(video, isSeries, seriesData);

      const videoTitle = isSeries && seriesData && seriesData.title && video.title
        ? `${seriesData.title} - ${video.title}`
        : (video.title || 'Check out this amazing video!');

      const videoDescription = isSeries && (video.episodeNumber != null || video.totalEpisodes != null)
        ? `Episode ${video.episodeNumber ?? 1} of ${video.totalEpisodes ?? 0} - Amazing content to watch!`
        : (isSeries && seriesData && seriesData.description ? seriesData.description : (video.description || 'Watch this incredible content!'));

      const creatorName = video.creator || 'Series Creator';

      const shareMessage = `${videoTitle} by ${creatorName}\n\n${videoDescription}\n\nWatch on FastTV: ${shareableLink}\n\n#FastTV #ShortVideos #Entertainment`;

      const shareOptions = {
        title: videoTitle,
        message: shareMessage,
        url: Platform.OS === 'ios' ? undefined : shareableLink,
      };

      const result = await Share.share(shareOptions, {
        dialogTitle: 'Share this amazing video!',
      });

      if (result?.action === Share.sharedAction) {
        sharedContentIdsRef.current.add(String(video.id));
      }

    } catch (error) {
      console.error('Direct share failed:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to share video. Please try again.');
    }

    // Resume video after sharing
    setTimeout(() => {
      if (isMountedRef.current && isPlaying) safePlayCurrentVideo();
    }, 500);
  }, [showUIWithTimeout, isSeries, seriesData, getShareLinksForVideo, isPlaying, safePauseCurrentVideo, safePlayCurrentVideo]);

  // Track share analytics
  const trackShareAnalytics = async (video, platform) => {
    try {
      const shareData = {
        platform: platform || 'general',
        timestamp: new Date().toISOString(),
        videoId: video.id,
        videoTitle: isSeries && seriesData && seriesData.title && video.title
          ? `${seriesData.title} - ${video.title}`
          : video.title,
        seriesId: isSeries && seriesData && seriesData.id ? seriesData.id : null,
        userId: user?.userId || user?.uid || 'guest',
        isGuestUser: isGuestUser,
      };

      // You can send this data to your analytics service
      // console.log('Share Analytics:', shareData);

      // Example: Send to your API
      // await API.trackShare(shareData);

    } catch (error) {
      // Error logged
    }
  };

  // Enhanced share function with multiple sharing options
  const handleAdvancedShare = async (video) => {
    showUIWithTimeout();

    safePauseCurrentVideo();

    try {
      const { shareableLink, assetDeepLink } = getShareLinksForVideo(video, isSeries, seriesData);

      const videoTitle = isSeries && seriesData && seriesData.title && video.title
        ? `${seriesData.title} - ${video.title}`
        : (video.title || 'Check out this amazing video!');

      const videoDescription = isSeries && (video.episodeNumber != null || video.totalEpisodes != null)
        ? `Episode ${video.episodeNumber ?? 1} of ${video.totalEpisodes ?? 0} - Amazing content to watch!`
        : (isSeries && seriesData && seriesData.description ? seriesData.description : (video.description || 'Watch this incredible content!'));

      const creatorName = video.creator || 'Series Creator';

      const shareMessage = `${videoTitle} by ${creatorName}\n\n${videoDescription}\n\nWatch on FastTV: ${shareableLink}\n\n#FastTV #ShortVideos #Entertainment`;

      const shareOptions = {
        title: videoTitle,
        message: shareMessage,
        url: Platform.OS === 'ios' ? undefined : shareableLink,
      };

      const result = await Share.share(shareOptions, {
        dialogTitle: 'Share this amazing video!',
      });

    } catch (error) {
      console.error('Advanced share failed:', error);
      // Fallback to basic share
      handleShare(video);
    }

    // Resume video after sharing
    setTimeout(() => {
      if (isMountedRef.current && isPlaying) safePlayCurrentVideo();
    }, 500);
  };

  // Handle share functionality with enhanced options
  const handleShare = async (video) => {
    showUIWithTimeout(); // Show UI for 7 seconds after button press
    crashlyticsService.addBreadcrumb('Reels Share started', 'user');

    safePauseCurrentVideo();

    try {
      const { shareableLink, assetDeepLink } = getShareLinksForVideo(video, isSeries, seriesData);

      const videoTitle = isSeries && seriesData && seriesData.title && video.title
        ? `${seriesData.title} - ${video.title}`
        : (video.title || 'Check out this amazing video!');

      const videoDescription = isSeries && (video.episodeNumber != null || video.totalEpisodes != null)
        ? `Episode ${video.episodeNumber ?? 1} of ${video.totalEpisodes ?? 0} - Amazing content to watch!`
        : (isSeries && seriesData && seriesData.description ? seriesData.description : (video.description || 'Watch this incredible content!'));

      const creatorName = video.creator || 'Series Creator';

      const shareMessage = `${videoTitle} by ${creatorName}\n\n${videoDescription}\n\nWatch on FastTV: ${shareableLink}\n\n#FastTV #ShortVideos #Entertainment`;

      const shareAnalytics = {
        platform: Platform.OS,
        timestamp: new Date().toISOString(),
        videoId: video.id,
        videoTitle: videoTitle,
      };

      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        const shareOptions = {
          title: videoTitle,
          message: shareMessage,
          url: Platform.OS === 'ios' ? undefined : shareableLink,
        };

        const result = await Share.share(shareOptions, {
          dialogTitle: 'Share this amazing video!',
        });

      } else {
        // Fallback for web or other platforms using expo-sharing
        await Sharing.shareAsync(shareableLink, {
          mimeType: 'text/plain',
          dialogTitle: 'Share this amazing video!',
        });
      }

      // Resume video after sharing
      setTimeout(() => {
        if (isMountedRef.current && isPlaying) safePlayCurrentVideo();
      }, 500);

    } catch (error) {
      // Error logged

      // If native Share API fails, show error message
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to share video. Please try again.');

      // Resume video if share failed
      setTimeout(() => {
        if (isMountedRef.current && isPlaying) safePlayCurrentVideo();
      }, 500);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      maybeFireEndStreamUserExitRef.current?.();
      isMountedRef.current = false;

      if (hideUITimeoutRef.current) {
        clearTimeout(hideUITimeoutRef.current);
      }

      // On unmount (including dev reload), just clear refs so GC can collect.
      // Heavy async cleanup is handled while the screen is mounted to avoid
      // touching ExoPlayer after the host is being destroyed.
    };
  }, []);

  // Handle hardware back button - navigate back instead of exiting
  useEffect(() => {
    const backAction = () => {
      if (isMountedRef.current) {
        maybeFireEndStreamUserExitRef.current?.();
        // Bookmark the current video before leaving
        bookmarkVideo(currentIndexRef.current);

        safeGoBack(navigation);
        return true; // Prevent default back behavior
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [navigation, bookmarkVideo]);

  // Handle screen focus
  useFocusEffect(
    useCallback(() => {
      if (isMountedRef.current) {
        crashlyticsService.addBreadcrumb('Reels focused', 'navigation');
        setIsPlaying(isSubscribed || isTrailerMode);
        showUIWithTimeout();
      }

      return () => {
        maybeFireEndStreamUserExitRef.current?.();
        if (!isMountedRef.current) return;
        crashlyticsService.addBreadcrumb('Reels lost focus', 'navigation');
        setIsPlaying(false);
      };
    }, [isSubscribed, isTrailerMode, showUIWithTimeout])
  );

  // Pause when OS backgrounds the app. Navigation blur alone does not run on Home press, so isPlaying could stay true.
  // Android: only `background` — `inactive` fires for share sheet etc. (see ForYouScreen). iOS: also `inactive` for control center.
  useEffect(() => {
    const shouldPause = (next) =>
      next === 'background' ||
      (Platform.OS === 'ios' && next === 'inactive');

    const sub = AppState.addEventListener('change', (next) => {
      if (shouldPause(next)) {
        wasPlayingBeforeBackgroundRef.current = isPlayingRef.current;
        setIsPlaying(false);
        safePauseCurrentVideo();
        return;
      }
      if (next === 'active' && isFocused) {
        if (
          wasPlayingBeforeBackgroundRef.current &&
          (isSubscribed || isTrailerMode)
        ) {
          setIsPlaying(true);
        }
      }
    });
    return () => sub.remove();
  }, [isFocused, isSubscribed, isTrailerMode, safePauseCurrentVideo]);

  // Keep screen awake when videos are playing
  useEffect(() => {
    // Only use keep awake on mobile platforms
    if (Platform.OS === 'web') {
      return;
    }

    // Cleanup when component unmounts
    return () => {
      try {
        deactivateKeepAwake();
      } catch (err) {
        // Suppress ExpoKeepAwakeDefaultTag error
      }
    };
  }, [isPlaying]);

  // Handle subscription offer modal actions
  const handleUnlockWithCoins = useCallback(() => {
    // Coin logic removed - all series are now free
    setSubscriptionOfferVisible(false);
    setLockedEpisode(null);
  }, []);

  const handleSubscribe = useCallback(() => {
    setSubscriptionOfferVisible(false);
    setLockedEpisode(null);
    if (Platform.OS === 'ios') {
      navigation.navigate('Subscription');
    } else {
      navigation.navigate('SubscriptionWebView');
    }
  }, [navigation]);

  const handleShowAuthGate = useCallback(() => {
    setSubscriptionOfferVisible(false);
    setLockedEpisode(null);
    // Navigate to auth screen first
    navigation.navigate('Auth');
  }, [navigation]);

  const handleMakeCoins = useCallback(() => {
    setSubscriptionOfferVisible(false);
    setLockedEpisode(null);
  }, [navigation]);

  const handleUnlockPress = useCallback((episode) => {
    // Coin logic removed - all series are now free
    // Continue playing directly
  }, []);

  // Check if user has enough coins when returning from rewards
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Coin logic removed - all series are now free
      setPendingUnlockEpisode(null);
    });

    return unsubscribe;
  }, [navigation, pendingUnlockEpisode]);

  // Check if previousIndex is different from currentIndex
  useEffect(() => {
    const previousIndex = currentIndexRef.current;
    currentIndexRef.current = currentIndex;
    // ✅ allow EndStream for the new current video later
    const newVideo = videoData?.[currentIndex];
    if (newVideo?.id != null) {
      endStreamFiredRef.current.delete(String(newVideo.id));
    }
  }, [currentIndex, videoData]);

  // Check if current episode is accessible and handle automatic unlock
  useEffect(() => {
    try {
      if (videoData && videoData.length > 0 && currentIndex < videoData.length) {
        const currentItem = videoData[currentIndex];
        const seriesId = currentItem.seriesId || currentItem.id;

        // All series are now accessible, no coin checks needed
      }
    } catch (error) {
      // Error logged
      // Don't show modal on error, just continue
    }
  }, [currentIndex, videoData]);



  //callToSubscribe function
  const callToSubscribe = useCallback(async () => {
    if (isGuestUser) {
      navigation.navigate('Auth');
      return;
    }

    if (Platform.OS === 'ios') {
      navigation.navigate('Subscription');
    } else {
      navigation.navigate('SubscriptionWebView');
    }
    try {
      const currentVideo = videoData[currentIndex];
      if (!currentVideo) {
        return;
      }
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
        content_id: currentVideo.id || '',
        content_title: currentVideo.title || 'Unknown',
        content_type: 'episode',
        season_number: 1,
        total_episodes: (videoData && videoData.length > 0)
          ? videoData.length
          : (currentVideo?.totalEpisodes || 1),
        page_name: "Reels",
        button_name: "Subscribe to Watch",
        button_location: "player_screen",
        action_type: "subscription_required",
        reason_for_prompt: "premium_content_access",
        conversion_step: "subscription_prompt"
      }
      analyticsService.logSubscriptionButtonClicked(currentVideo.id, properties);
    } catch (error) {
      // Error logged
      return;
    }

  }, [isGuestUser, navigation, videoData, currentIndex, user, isSubscribed]);

  // Consolidated stable render function
  const renderItem = useCallback(({ item, index }) => {
    if (!item) return null;

    try {
      const seriesId = String(item.seriesId || seriesData?.id || '');
      const assetId = String(item.assetId || item.id || '');
      // Check both keys: ReelsScreen saves by series id, ExpandedItemOverlay saves by asset id.
      // We must match whichever was used, without requiring both to be present.
      const isSaved =
        (seriesId ? isSeriesInMyList(seriesId) : false) ||
        (assetId && assetId !== seriesId ? isSeriesInMyList(assetId) : false) ||
        savedVideos.has(item.id);

      return (
        <ReelItem
          ref={(r) => {
            if (r) videoRefs.current.set(index, r);
            else videoRefs.current.delete(index);
          }}
          item={item}
          index={index}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          isSubscribed={isSubscribed}
          videoResizeMode={videoResizeMode}
          handleScreenTap={handleScreenTap}
          handlePlayPause={handlePlayPause}
          handleLike={handleLike}
          handleMyListToggle={handleMyListToggle}
          handleDirectShare={handleDirectShare}
          navigation={navigation}
          insets={insets}
          videoDataLength={safeVideoData.length}
          allEpisodesData={safeVideoData}
          detectedIsSeries={isSeries}
          effectiveSeriesTitle={effectiveSeriesTitle}
          isTrailerMode={isTrailerMode}
          handleWatchSeries={handleWatchSeries}
          isGuestUser={isGuestUser}
          callToSubscribe={callToSubscribe}
          measureScrubBar={measureScrubBar}
          scrubPanResponder={scrubPanResponder}
          scrubberTrackRef={scrubberTrackRef}
          progressAnim={progressAnim}
          scrubBarHeightAnim={scrubBarHeightAnim}
          isSeeking={isSeeking}
          pinchPanResponder={pinchPanResponder}
          scaleAnim={scaleAnim}
          showUI={showUI}
          showMetadataPopup={showMetadataPopup}
          metadataAnimValue={metadataAnimValue}
          likedVideos={likedVideos}
          isSaved={isSaved}
          poster={seriesData?.poster}
          genres={seriesGenresDisplay}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          subtitles={item.subtitle}
          selectedSubtitleLang={index === currentIndex ? currentSubtitleLang : SUBTITLE_OFF}
          onOpenSubtitleMenu={openSubtitleSheet}
          showSubtitleMenuButton={index === currentIndex}
          onCurrentPlayerPlayingChange={onCurrentPlayerPlayingChange}
          interactiveGraph={interactiveGraph}
          isInteractiveEnabled={isInteractiveEnabled}
          showId={interactiveShowId}
        />
      );
    } catch (err) {
      // Error logged
      return null;
    }
  }, [
    currentIndex,
    currentSubtitleLang,
    openSubtitleSheet,
    isPlaying,
    isSubscribed,
    videoResizeMode,
    handleScreenTap,
    handlePlayPause,
    handleLike,
    handleMyListToggle,
    handleDirectShare,
    navigation,
    insets,
    safeVideoData,
    isSeries,
    seriesData,
    effectiveSeriesTitle,
    seriesGenresDisplay,
    isTrailerMode,
    handleWatchSeries,
    isGuestUser,
    callToSubscribe,
    interactiveGraph,
    isInteractiveEnabled,
    interactiveShowId,
    measureScrubBar,
    scrubPanResponder,
    progressAnim,
    scrubBarHeightAnim,
    isSeeking,
    pinchPanResponder,
    scaleAnim,
    showUI,
    showMetadataPopup,
    metadataAnimValue,
    likedVideos,
    isSeriesInMyList,
    savedVideos,
    handlePlaybackStatusUpdate,
    onCurrentPlayerPlayingChange,
  ]);

  // Defensive: Fallback UI if no videos
  if (safeVideoData.length === 0) {
    // Show loading state if we have a path but no data yet and not skipping API call
    if (path && (isApiLoading || !apiDataLoaded) && !skipApiCall) {
      return (
        <View style={styles.loadingContainer}>
          <LottieLoader size="large" />
        </View>
      );
    }

    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="videocam-outline" size={64} color="#666" />
        <Text style={styles.loadingText}>No videos available</Text>
        <Text style={styles.loadingSubtext}>Try refreshing or check back later</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            bookmarkVideo(currentIndexRef.current);
            safeGoBack(navigation);
          }}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: 0, paddingBottom: 0 }
      ]}
    >
      <AppStatusBar />

      {/* Error Boundary Wrapper - on iOS absolutely positioned so video extends under status bar */}
      <View
        style={[
          styles.errorBoundaryContainer
        ]}
      >
        {/* Fallback UI if no video data */}
        {(!safeVideoData || safeVideoData.length === 0) && (
          <View style={styles.loadingContainer}>
            {path && (isApiLoading || !apiDataLoaded) && !skipApiCall ? (
              <>
                <LottieLoader size="large" />
              </>
            ) : (
              <>
                <Ionicons name="videocam-outline" size={64} color="#666" />
                <Text style={styles.loadingText}>No videos available</Text>
                <Text style={styles.loadingSubtext}>Try refreshing or check back later</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => safeGoBack(navigation)}
                >
                  <Text style={styles.retryButtonText}>Go Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Main FlatList for videos */}
        {safeVideoData.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="videocam-outline" size={64} color="#666" />
            <Text style={styles.loadingText}>No videos to display</Text>
            <Text style={styles.loadingSubtext}>Check back later for new content</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            key={`reels-flatlist-${safeVideoData.length}`}
            data={safeVideoData}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            keyExtractor={(item, index) => (item?.id ? item.id.toString() : index.toString())}
            renderItem={renderItem}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChangedStable}
            viewabilityConfig={viewabilityConfigRef.current}
            initialScrollIndex={Math.max(0, Math.min(currentIndex, safeVideoData.length - 1))}
            getItemLayout={(data, index) => ({
              length: Platform.OS === 'ios' ? screenHeight + 1 : screenHeight,
              offset: Platform.OS === 'ios' ? (screenHeight + 1) * index : screenHeight * index,
              index,
            })}
            removeClippedSubviews={true}
            maxToRenderPerBatch={Platform.OS === 'android' ? 2 : 4}
            windowSize={Platform.OS === 'android' ? 3 : 7}
            initialNumToRender={Platform.OS === 'android' ? 2 : 3}
            updateCellsBatchingPeriod={50}
            decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.998}
            snapToInterval={Platform.OS === 'ios' ? screenHeight + 1 : screenHeight}
            snapToAlignment="start"
            disableIntervalMomentum={true}
            scrollEventThrottle={16}
            contentContainerStyle={{ padding: 0, margin: 0 }}
            style={{ padding: 0, margin: 0 }}
            onScrollToIndexFailed={(info) => {
              const wait = new Promise(resolve => setTimeout(resolve, 500));
              wait.then(() => {
                if (flatListRef.current && info.index < safeVideoData.length) {
                  flatListRef.current.scrollToIndex({
                    index: Math.max(0, Math.min(info.index, safeVideoData.length - 1)),
                    animated: false
                  });
                }
              });
            }}
            ListEmptyComponent={
              path && (isApiLoading || !apiDataLoaded) && !skipApiCall ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <LottieLoader size="large" />
                  <Text style={{ color: 'white', fontSize: 18, marginTop: 20 }}>Loading videos...</Text>
                </View>
              ) : (
                <Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>No videos to display.</Text>
              )
            }
          />
        )}
      </View>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />

      {/* Small zoom status toast at top of screen */}
      {zoomToast && (
        <View style={styles.zoomToastContainer}>
          <Text style={styles.zoomToastText}>{zoomToast}</Text>
        </View>
      )}

      {/* Subscription Offer Modal */}
      <SubscriptionOfferModal
        visible={subscriptionOfferVisible}
        episode={lockedEpisode}
        onClose={() => {
          setSubscriptionOfferVisible(false);
          setLockedEpisode(null);
        }}
        onUnlockWithCoins={handleUnlockWithCoins}
        onSubscribe={handleSubscribe}
        onShowAuthGate={handleShowAuthGate}
      />

      {/* Guest Login Modal */}
      <GuestLoginModal
        visible={showGuestLoginModal}
        onClose={() => setShowGuestLoginModal(false)}
        onLogin={() => {
          setShowGuestLoginModal(false);
          navigation.navigate('Auth');
        }}
        onContinueAsGuest={() => {
          setShowGuestLoginModal(false);
        }}
      />

      <SubtitlesBottomSheet
        visible={subtitleSheetOpen}
        onClose={() => setSubtitleSheetOpen(false)}
        subtitleTracks={safeVideoData[currentIndex]?.subtitle || []}
        selectedLanguage={currentSubtitleLang}
        onSelectLanguage={handleSubtitleLanguagePicked}
      />

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 0,
    margin: 0,
  },
  zoomToastContainer: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 20,
  },
  zoomToastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  videoContainer: {
    width: screenWidth,
    height: Platform.OS === 'ios' ? screenHeight + 1 : screenHeight,
    position: 'relative',
    overflow: 'hidden',
    flex: 1,
  },
  pinchWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
    flex: 1,
    minHeight: Platform.OS === 'ios' ? screenHeight + 1 : screenHeight,
  },
  touchableVideoArea: {
    width: '100%',
    height: '100%',
    flex: 1,
    minHeight: Platform.OS === 'ios' ? screenHeight + 1 : screenHeight,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  playPauseButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -35 }, { translateY: -35 }],
    zIndex: 999,
  },
  playPauseIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 35,
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
  backButton: {
    marginTop: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 50,
    padding: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  resizeModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginTop: 0,
  },
  resizeModeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  rightActions: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
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
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'visible',
  },
  likedIconContainer: {
    backgroundColor: 'rgba(255,48,64,0.95)',
    borderColor: 'rgba(255,48,64,0.8)',
  },
  savedIconContainer: {
    backgroundColor: 'rgba(255,215,0,0.95)',
    borderColor: 'rgba(255,215,0,0.8)',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  metadataContainer: {
    position: 'absolute',
    bottom: 120, // Positioned just above the seek bar (seek bar is at bottom: 80)
    left: 0,
    right: 120, // Leave space for right-side action buttons
    paddingHorizontal: 20,
  },
  metadataContent: {
    backgroundColor: 'transparent', // No background
    borderRadius: 12,
    marginRight: 20, // Additional margin from right edge
    borderWidth: 0, // Remove border
    position: 'relative',
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 16, // Reduced from 18
    fontWeight: '700',
    marginBottom: 8, // Reduced margin
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 20, // Adjusted line height
    letterSpacing: 0.3,
  },
  videoGenres: {
    color: '#E0E0E0',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  videoDescription: {
    color: '#E0E0E0',
    fontSize: 13, // Reduced from 15
    lineHeight: 18, // Reduced line height
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    marginTop: 4, // Reduced margin
    letterSpacing: 0.2,
  },

  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 8,
    zIndex: 1001,
  },



  timeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  episodeNumberText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  seriesNameText: {
    color: '#ffffff79',
    fontSize: 15,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  episodeBadge: {
    position: 'absolute',
    top: -6, // Reduced from -8
    left: -6, // Reduced from -8
    backgroundColor: '#FFFFFF',
    borderRadius: 10, // Reduced from 12
    paddingHorizontal: 6, // Reduced from 8
    paddingVertical: 3, // Reduced from 4
    borderWidth: 1, // Reduced from 2
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, // Reduced from 2
    shadowOpacity: 0.2, // Reduced from 0.3
    shadowRadius: 3, // Reduced from 4
    elevation: 3, // Reduced from 4
  },
  episodeBadgeText: {
    color: '#000000',
    fontSize: 10, // Reduced from 11
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  genreTagsContainer: {
    flexDirection: 'row',
    marginBottom: 8, // Reduced from 12
    flexWrap: 'wrap',
  },
  genreTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12, // Reduced from 16
    paddingHorizontal: 8, // Reduced from 10
    paddingVertical: 4, // Reduced from 6
    marginRight: 6, // Reduced from 8
    marginBottom: 3, // Reduced from 4
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  genreTagText: {
    color: '#FFFFFF',
    fontSize: 11, // Reduced from 12
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  autoplayStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6, // Reduced from 8
    paddingHorizontal: 6, // Reduced from 8
    paddingVertical: 3, // Reduced from 4
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10, // Reduced from 12
    alignSelf: 'flex-start',
  },
  autoplayStatusText: {
    fontSize: 11, // Reduced from 12
    fontWeight: '600',
    marginLeft: 3, // Reduced from 4
    letterSpacing: 0.3,
  },

  // Inline Watch Now Button Styles
  inlineWatchNowButton: {
    marginTop: 10,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'flex-start',
    zIndex: 1000,
  },
  inlineWatchNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 232,
    minHeight: 50
  },
  inlineWatchNowIconContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  inlineWatchNowText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    textAlign: 'center',
    marginHorizontal: 4,
  },
  inlineWatchNowArrow: {
    marginLeft: 4,
    opacity: 0.7,
  },
  seriesProgressText: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 8,
    color: '#E0E0E0',
    letterSpacing: 0.2,
  },
  episodeProgressContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  episodeProgressText: {
    color: '#E0E0E0',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 2,
  },


  refreshIcon: {
    marginLeft: 8,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  lockContent: {
    alignItems: 'center',
    padding: 20,
  },
  lockTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  lockSubtitle: {
    color: '#E0E0E0',
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  unlockButton: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  unlockGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  unlockText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  titleSection: {
    marginBottom: 8,
  },
  creatorName: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },

  // Enhanced Scrubber Bar Styles
  scrubberContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  scrubberTrack: {
    width: '100%',
    justifyContent: 'center',
    paddingHorizontal: 12,
    position: 'relative',
    paddingVertical: 2,
  },
  scrubberTrackContainer: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    minHeight: 15,
  },
  scrubberBackground: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
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

  // Loading UI Styles
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    margin: 0,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  loadingSubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  retryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },

  errorBoundaryContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    margin: 0,
  },
  errorBoundaryText: {
    color: '#FFFFFF',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  errorBoundaryButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  errorBoundaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },

  // Video Error UI Styles
  videoErrorContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    margin: 0,
  },
  videoErrorText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  videoErrorSubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
  },

  guestUserIndicator: {
    position: 'absolute',
    top: 35,
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  guestUserContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestUserText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

});

export default ReelsScreen;
