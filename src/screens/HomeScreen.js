import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
  Platform,
  BackHandler,
  Animated,
  Dimensions,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AppStatusBar from '../components/AppStatusBar';
import HomeSkeleton from '../components/HomeSkeleton';
import FeaturedCarousel, { prewarmHeroPalettes } from '../components/FeaturedCarousel';
import HeroBackgroundGradient from '../components/HeroBackgroundGradient';
import Slider from '../components/Slider';
import FeedGrid from '../components/FeedGrid';
import ExpandedItemOverlay from '../components/ExpandedItemOverlay';
import SubscriptionOfferModal from '../components/SubscriptionOfferModal';
import ExitConfirmModal from '../components/ExitConfirmModal';
import Toast from '../components/Toast';
import MotionPreviewManager from '../services/MotionPreviewManager';
import { useSubscription } from '../context/SubscriptionContext';
import { useSubscriptionCtaConfig } from '../hooks/useSubscriptionCtaConfig';
import { useDataCache } from '../context/DataCacheContext';
import { useMyList } from '../context/MyListContext';
import { useAuth } from '../context/AuthContext';
import ViewportContext, { updateViewport, ScrollViewRefProvider, updateTouchX } from '../context/ViewportContext';
import API from '../services/api';
import { redirectGuestToLogin } from '../utils/guestUtils';
import Svg, { Path } from 'react-native-svg';
import { AppLogo } from '../components/Icons';
import GenreList from '../components/GenreList';
import { isAllowlisted } from '../config/interactiveAllowlist';

// Raw interactive bucket injected at index 0 for allowlisted users (not stored in API cache)
const INTERACTIVE_BUCKET_RAW = require('../../interactive_show_bucket.json');

function buildInteractiveBucket() {
  const raw = INTERACTIVE_BUCKET_RAW?.pageCategoryListing?.[0];
  if (!raw) return null;
  return {
    bucketId: 'interactive-shows',
    id: 'interactive-shows-bucket',
    path: raw.path,
    title: 'FastME',
    label: 'FastME',
    description: raw.description,
    displayType: '3', // force horizontal Slider, not FeedGrid
    displayIndexing: raw.displayIndexing,
    type: raw.type,
    subMenuIds: raw.subMenuIds || raw.subMenu || [],
    data: (() => {
      const items = raw.data || [];
      const reordered = items.length > 1 ? [items[items.length - 1], ...items.slice(0, -1)] : items;
      return reordered;
    })().map((item, idx) => ({
      id: item.path?.toString(),
      path: item.path,
      agdlmId: item.agdlmId,
      asset_group_id: String(item.agdlmId),
      assetGroupId: String(item.agdlmId),
      pageCategoryId: item.pageCategoryId,
      previewUrl: item.preview_url || item.asset_group_preview_url,
      preview_url: item.preview_url || item.asset_group_preview_url,
      asset_group_preview_url: item.asset_group_preview_url,
      trailer_url: item.trailer_url || item.asset_group_trailer_url,
      hlsUrl: item.hlsUrl,
      title: item.title,
      label: item.label,
      tile_label: 'FastMe Show',
      description: item.description,
      geners: item.geners,
      genre: item.geners,
      is_interactive: item.is_interactive,
      total_episodes: item.total_episodes,
      totalEpisodes: item.total_episodes,
      assetCount: item.total_episodes,
      episodeCount: item.total_episodes,
      horizontalFilePath: item.horizontalFilePath,
      verticalFilePath: item.verticalFilePath,
      thumbFilePath: item.thumbFilePath,
      posterFilePath: item.posterFilePath,
      vodOrLivePosterImageFilePath: item.posterFilePath,
      thumbnail: item.horizontalFilePath || item.thumbFilePath,
      imageUrl: item.horizontalFilePath || item.thumbFilePath,
      posterImage: item.posterFilePath,
      release_date: item.release_date,
      year_of_release: item.year_of_release,
      age_rating: item.age_rating,
      actor: item.actor,
      keywords: item.keywords,
      isPremium: item.isPremium ?? 0,
      isActive: item.isActive ?? 1,
      type: item.type,
    })),
  };
}

// Build once at module level (static JSON — no need to rebuild each render)
const INTERACTIVE_BUCKET = buildInteractiveBucket();

// Single category row: FeedGrid, Slider, or FeaturedCarousel. Used so main FlatList can virtualize by section.
const HomeSingleCategory = React.memo(function HomeSingleCategory({
  category,
  index,
  handleVideoPress,
  handleLongPress,
  handleUnlockPress,
  callArtworkClickEvents,
  callSliderScrollEvents,
  isScreenFocused,
  styles,
}) {
  if (String(category?.displayType) === '1') {
    return (
      <View
        style={[
          styles.feedSection,
          Platform.OS === 'android' && index === 0 && styles.feedFirstRailAndroidOnly,
        ]}
      >
        <Text style={styles.sectionTitle}>{String(category.label || 'Feed')}</Text>
        <FeedGrid
          feedData={category?.data || []}
          onItemPress={(item, itemIndex) => {
            callArtworkClickEvents(item, category, itemIndex, String(category.label || 'Feed'));
            handleVideoPress(item);
          }}
          onUnlockPress={handleUnlockPress}
          onLongPress={handleLongPress}
          bucketId={category.bucketId}
          isScreenFocused={isScreenFocused}
          showInteractiveChip={false}
          disablePreview={category.bucketId === 'interactive-shows'}
          onScrollMetrics={(metrics, { bucketId }) =>
            callSliderScrollEvents(metrics, bucketId, category, 'feed grid')
          }
        />
      </View>
    );
  }
  if (category?.displayType === '5') {
    return (
      <FeaturedCarousel
        data={category?.data || []}
        onItemPress={(item, itemIndex) => {
          callArtworkClickEvents(item, category, itemIndex, String(category.label || 'Featured'));
          handleVideoPress(item);
        }}
        onUnlockPress={handleUnlockPress}
        isPageCategory={true}
        showPreview={false}
        label={category?.label}
        bucketId={category.bucketId}
        onScrollMetrics={(metrics, { bucketId }) =>
          callSliderScrollEvents(metrics, bucketId, category, 'featured carousel')
        }
      />
    );
  }
  return (
    <Slider
      category={category}
      videos={category?.data || []}
      onVideoPress={(video, videoIndex) => {
        callArtworkClickEvents(video, category, videoIndex, String(category.label || category.title || 'Category'));
        handleVideoPress(video);
      }}
      onUnlockPress={handleUnlockPress}
      onLongPress={handleLongPress}
      keyPrefix="trending"
      bucketId={category.bucketId}
      isScreenFocused={isScreenFocused}
      showFastMeChip={category.bucketId !== 'interactive-shows'}
      onScrollMetrics={(metrics, { bucketId, category: cat }) =>
        callSliderScrollEvents(metrics, bucketId, cat, 'horizontal list')
      }
    />
  );
});

// Memoized category swimlanes (fallback when not using section virtualization)
const HomeCategorySwimlanes = React.memo(function HomeCategorySwimlanes({
  pageCategoryDataFiltered,
  isLoadingCategoryData,
  handleVideoPress,
  handleLongPress,
  handleUnlockPress,
  callArtworkClickEvents,
  callSliderScrollEvents,
  isScreenFocused,
  styles,
}) {
  if (isLoadingCategoryData || !pageCategoryDataFiltered?.length) return null;
  const categoriesToRender = pageCategoryDataFiltered;
  return (
    <View>
      {categoriesToRender.map((category, index) => (
        <HomeSingleCategory
          key={`category-${category.id || category.title || index}-${index}`}
          category={category}
          index={index}
          handleVideoPress={handleVideoPress}
          handleLongPress={handleLongPress}
          handleUnlockPress={handleUnlockPress}
          callArtworkClickEvents={callArtworkClickEvents}
          callSliderScrollEvents={callSliderScrollEvents}
          isScreenFocused={isScreenFocused}
          styles={styles}
        />
      ))}
    </View>
  );
});

const HomeScreen = ({ navigation }) => {
  const heroBgGradientRef = useRef(null);

  const scrollY = useRef(new Animated.Value(0)).current;

  const insets = useSafeAreaInsets();
  const isIpad = Platform.OS === 'ios' && Platform.isPad;
  const [refreshing, setRefreshing] = useState(false);
  const [subscriptionOfferVisible, setSubscriptionOfferVisible] = useState(false);
  const [lockedEpisode, setLockedEpisode] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null); // State for long-pressed item
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const carouselInViewRef = useRef(true);
  const [carouselData, setCarouselData] = useState([]); // Initialize with mock data
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [pageCategoryData, setPageCategoryData] = useState([]);  // Initialize as empty array
  const [pageCategoryDataFiltered, setPageCategoryDataFiltered] = useState([]); // Initialize as empty array
  const [isLoadingCategoryData, setIsLoadingCategoryData] = useState(false); // Loading state for category data
  const [initialLoadTriggered, setInitialLoadTriggered] = useState(false); // True once first fetch has been triggered (so we show skeleton until data exists)
  const skeletonHideTimeoutRef = useRef(null); // Defer hiding skeleton until content/images have time to load
  // Carousel top color for status bar (matches carousel background with 0.5 opacity)
  const [carouselBgTopColor, setCarouselBgTopColor] = useState('rgba(0, 0, 0, 0.5)');
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const [apiCache, setApiCache] = useState({}); // Cache for API responses
  const isNavigatingToDetailsRef = useRef(false); // Guard to prevent double navigation to TileDetails
  const sectionLayoutsRef = useRef([]); // Track vertical sections for scroll analytics
  const currentSectionIndexRef = useRef(null);
  const apiCacheRef = useRef({}); // Ref to access current cache state
  const hasInitialDataLoaded = useRef(false); // Flag to prevent multiple initial loads
  const expandedItemRequestId = useRef(0);
  /** Set when long-press overlay already logged trailer_watched at 100% (first loop complete); skip duplicate on dismiss. */
  const overlayFullTrailerLoggedRef = useRef(false);
  const sharedContentIdsRef = useRef(new Set());
  const mainScrollViewRef = useRef(null);
  const personalisedRailsInjectedRef = useRef(false); // Guard: inject once per data load, reset when data clears
  const fixedGenreScrollViewRef = useRef(null);
  const inlineGenreScrollViewRef = useRef(null);
  const genreButtonWidths = useRef({});
  const currentScrollY = useRef(0);
  // Carousel in view: false when user has scrolled so genre tabs are visible (carousel off-screen). Used to pause hero carousel preview.
  const [carouselInView, setCarouselInView] = useState(true);
  // Visibility flags for genre tabs (inline vs floating) so both are never visible at once
  const [showInlineGenres, setShowInlineGenres] = useState(true);
  const showInlineGenresRef = useRef(true);

  // Screen focus: when false, carousel video preview is paused (e.g. user switched tab or navigated away)
  const isNavFocused = useIsFocused();
  const isScreenFocused = isNavFocused && !expandedItem;

  // Stop all motion previews when the app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        MotionPreviewManager.stopAll();
      }
    });
    return () => sub.remove();
  }, []);

  // Stop all motion previews when this screen loses navigation focus
  useFocusEffect(
    useCallback(() => {
      return () => {
        MotionPreviewManager.stopAll();
      };
    }, [])
  );

  const { getCachedData, setCachedData } = useDataCache();
  const { addSeriesToMyList, removeSeriesFromMyList, isSeriesInMyList } = useMyList();
  const { user, isGuestUser, signOut } = useAuth();

  // Handle back button press when Home is focused - show exit confirmation (register on focus so we run before nav)
  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        setExitModalVisible(true);
        return true; // Consume back so GO_BACK is not dispatched
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => sub.remove();
    }, [])
  );

  const memoizedFilteredCategories = React.useMemo(() => {
    return pageCategoryDataFiltered;
  }, [pageCategoryDataFiltered]);

  const memoizedCarouselData = React.useMemo(
    () => carouselData,
    [carouselData]
  );
  // Pass all carousel data; FeaturedCarousel uses a render window to avoid OOM (only loads content for items near current index)
  const memoizedCarouselDataForRender = React.useMemo(
    () => carouselData,
    [carouselData]
  );

  // Cache expiration time (30 minutes)
  const CACHE_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes in milliseconds

  // Update ref when cache changes
  useEffect(() => {
    apiCacheRef.current = apiCache;
  }, [apiCache]);

  const {
    isSubscribed,
    checkSubscriptionStatus,
    isEligibleForSubscription,
  } = useSubscription();
  const { subscriptionCta } = useSubscriptionCtaConfig();


  useFocusEffect(
    useCallback(() => {
      checkSubscriptionStatus().catch((error) => {
        console.error('Error checking subscription status:', error);
      });
    }, [checkSubscriptionStatus])
  );

  // Genre change – also run when pageCategoryData updates (e.g. after API/cache load) so swimlanes stay in sync
  useEffect(() => {
    let data;
    if (!selectedGenre || selectedGenre === 'All') {
      data = pageCategoryData;
    } else {
      const genreId = Number(selectedGenre);
      data = pageCategoryData.filter(item =>
        Array.isArray(item.subMenuIds) &&
        item.subMenuIds.includes(genreId)
      );
    }

    // Inject interactive shows bucket at index 0 for allowlisted users.
    // Done here (not in the fetch) so it never pollutes the API cache and
    // existing buckets are never removed or reordered.
    const mobile = user?.phoneNumber || user?.mobile || '';
    if (isAllowlisted(mobile) && INTERACTIVE_BUCKET && data.length > 0) {
      const alreadyPresent = data.some((d) => d.id === 'interactive-shows-bucket');
      if (!alreadyPresent) {
        data = [INTERACTIVE_BUCKET, ...data];
      }
    }

    setPageCategoryDataFiltered(data);
  }, [selectedGenre, pageCategoryData, user]);

  // Personalised rails — fire-and-forget after home data loads. Silent fail.
  useEffect(() => {
    if (pageCategoryData.length === 0) {
      personalisedRailsInjectedRef.current = false;
      return;
    }
    if (genres.length === 0) return;
    if (personalisedRailsInjectedRef.current) return;
    personalisedRailsInjectedRef.current = true;

    const userId = user?.userId || user?.uid;
    if (!userId) return;
    const allSubMenuIds = genres
      .map((genre) => Number(genre?.path ?? genre?.id))
      .filter((id) => Number.isFinite(id));

    API.getPersonalisedRails(userId).then(railsResponse => {
      if (!railsResponse?.rails?.length) return;
      setPageCategoryData(prev => {
        if (!prev.length) return prev;
        const result = [...prev];
        const sorted = [...railsResponse.rails].sort(
          (a, b) => b.inject_after_position - a.inject_after_position,
        );
        for (const rail of sorted) {
          const insertAt = Math.min(rail.inject_after_position + 1, result.length);
          const personalisedDisplayType = rail?.displayType != null
            ? String(rail.displayType)
            : '0';
          result.splice(insertAt, 0, {
            bucketId: `personalised_${rail.slot_key}`,
            id: `personalised_${rail.slot_key}`,
            title: rail.title,
            label: rail.title,
            displayType: personalisedDisplayType,
            subMenuIds: allSubMenuIds,
            data: rail.data.map(item => ({
              id: String(item.path),
              path: item.path,
              previewUrl: item.asset_group_preview_url ?? item.preview_url ?? null,
              title: item.title,
              description: item.description,
              geners: item.geners,
              total_episodes: item.total_episodes,
              totalEpisodes: item.total_episodes ?? item.total_sessions,
              assetCount: item.total_episodes ?? item.total_sessions,
              episodeCount: item.total_episodes ?? item.total_sessions,
              horizontalFilePath: item.horizontalFilePath,
              verticalFilePath: item.verticalFilePath,
              vodOrLivePosterImageFilePath: item.posterFilePath,
              thumbnail: item.horizontalFilePath || item.posterFilePath,
              imageUrl: item.horizontalFilePath || item.posterFilePath,
              posterImage: item.posterFilePath,
              age_rating: item.age_rating,
              actor: item.actor,
              release_date: item.release_date,
              isPremium: item.isPremium ?? 0,
              isActive: item.isActive ?? 1,
              type: item.type ?? 'asset_group',
            })),
          });
        }
        return result;
      });
    }).catch(() => {});
  }, [pageCategoryData.length, user, genres]);

  // Function to clean expired cache entries
  const cleanExpiredCache = useCallback(() => {
    const now = Date.now();
    setApiCache(prevCache => {
      const cleanedCache = {};
      Object.keys(prevCache).forEach(key => {
        const cacheEntry = prevCache[key];
        if (now - cacheEntry.timestamp < CACHE_EXPIRATION_TIME) {
          cleanedCache[key] = cacheEntry;
        }
      });
      return cleanedCache;
    });
  }, []);

  // Clean expired cache entries periodically
  useEffect(() => {
    const interval = setInterval(cleanExpiredCache, 5 * 60 * 1000); // Clean every 5 minutes
    return () => clearInterval(interval);
  }, [cleanExpiredCache]);


  // Track if we've already triggered the initial API call
  const initialApiCallTriggered = useRef(false);

  // Track ongoing API calls to prevent duplicates (moved outside component)
  const ongoingApiCalls = useRef(new Set());
  const lastApiCallTime = useRef({});

  // Function to fetch data for selected menu category
  const fetchDataForCategory = useCallback(async (selectedTab) => {
    if (!selectedTab) return;

    const isFeedType = selectedTab.menuCategoryType?.toLowerCase() === 'feed';
    const apiType = isFeedType ? 'listing' : 'pagecategory';
    const cacheKey = `${apiType}-${selectedTab.title?.toLowerCase()}-${selectedTab.path}`;

    // Check if API call is already in progress for this cache key
    if (ongoingApiCalls.current.has(cacheKey)) return;

    // Check if we recently made an API call for this cache key (within 2 seconds)
    const now = Date.now();
    const lastCallTime = lastApiCallTime.current[cacheKey] || 0;
    if (now - lastCallTime < 2000) return;

    // Clear any pending skeleton-hide timeout from a previous run
    if (skeletonHideTimeoutRef.current) {
      clearTimeout(skeletonHideTimeoutRef.current);
      skeletonHideTimeoutRef.current = null;
    }
    setIsLoadingCategoryData(true);

    // Check cache first
    if (apiCacheRef.current[cacheKey]) {
      const cachedData = apiCacheRef.current[cacheKey];
      if (cachedData.carouselApplicable) {
        setCarouselData(cachedData.carouselData);
        prewarmHeroPalettes(cachedData.carouselData);
      } else {
        setCarouselData([]);
      }
      setPageCategoryData(cachedData.pageCategoryData || []);
      skeletonHideTimeoutRef.current = setTimeout(() => {
        skeletonHideTimeoutRef.current = null;
        setIsLoadingCategoryData(false);
      }, 300);
      return;
    }

    // Mark this API call as in progress
    ongoingApiCalls.current.add(cacheKey);
    lastApiCallTime.current[cacheKey] = now;

    let carouselDataResult = [];
    let pageCategoryDataResult = [];

    // Use new unified API to fetch both carousel and page category data
    try {
      // Check if home screen data is cached
      const homeDataCacheKey = `homeData_52_${selectedTab.path}_${selectedTab.type}`;
      const cachedHomeData = getCachedData(homeDataCacheKey);

      if (cachedHomeData) {
        carouselDataResult = cachedHomeData.carouselData || [];
        pageCategoryDataResult = cachedHomeData.pageCategoryData || [];
        setCarouselData(carouselDataResult);
        prewarmHeroPalettes(carouselDataResult);
        setPageCategoryData(pageCategoryDataResult);
        if (Array.isArray(cachedHomeData.subMenu) && cachedHomeData.subMenu.length > 0) {
          setGenres(cachedHomeData.subMenu);
          setSelectedGenre(cachedHomeData.subMenu[0].path ?? cachedHomeData.subMenu[0].name ?? null);
        } else {
          setGenres([]);
        }
        skeletonHideTimeoutRef.current = setTimeout(() => {
          skeletonHideTimeoutRef.current = null;
          setIsLoadingCategoryData(false);
        }, 300);
        ongoingApiCalls.current.delete(cacheKey);
        return;
      }

      setIsLoadingCategoryData(true);

      const pageId = 51;
      const languageCode = 'en';

      const homeScreenData = await API.getHomeScreenData({
        languageCode: languageCode,
        pageId: pageId
      });

      // Map carousel data
      if (homeScreenData.carousel && Array.isArray(homeScreenData.carousel)) {
        carouselDataResult = homeScreenData.carousel
          .filter(item => item.isActive === 1)
          .map(item => ({
            path: item.path,
            title: item.title,
            description: item.description,
            previewUrl: item.preview_url,
            filePath: item.filePath,
            fileName: item.fileName,
            label: item.label,
            carouselType: item.carouselType,
            type: item.type,
            // Map to expected structure
            id: item.path,
            imageUrl: item.filePath,
            backgroundImage: item.filePath,
            trailer_url: item.trailer_url,
            genre: item.genre || item.content_genre,
            genres: item.genres || item.content_genre,
            content_genre: item.content_genre,
            clickThrough: item.clickThrough,
            isButtonRequired: item.isButtonRequired,
            thumbFilePath: item.thumbFilePath,
            // Align with pageCategoryListing tile map so Reels stream_started / stream_finished get metadata from carousel
            geners: item.geners,
            release_date: item.release_date ?? item.releaseDate ?? item.airStartDate,
            year_of_release: item.year_of_release ?? item.yearOfRelease ?? item.productionyear,
            age_rating: item.age_rating ?? item.ageRating,
            actor: item.actor,
            keywords: item.keywords,
            verticalFilePath: item.verticalFilePath,
            horizontalFilePath: item.horizontalFilePath,
            vodOrLivePosterImageFilePath: item.vodOrLivePosterImageFilePath,
          }));

        if (selectedTab.carouselApplicable) {
          setCarouselData(carouselDataResult);
          prewarmHeroPalettes(carouselDataResult);
        } else {
          setCarouselData([]);
        }
      } else {
        setCarouselData([]);
      }

      // Map page category listing data
      if (homeScreenData.pageCategoryListing && Array.isArray(homeScreenData.pageCategoryListing)) {
        pageCategoryDataResult = homeScreenData.pageCategoryListing
          .filter(category => category.isActive === 1)
          .map((category, index) => ({
            bucketId: category.displayType,
            id: category.path?.toString(),
            path: category.path,
            title: category.title,
            label: category.label,
            description: category.description,
            displayType: category.displayType,
            displayIndexing: category.displayIndexing,
            orderBy: category.orderBy,
            type: category.type,
            subMenuIds: category.subMenuIds || category.subMenu,
            // Map data array to expected structure
            data: (category.data || []).map(item => ({
              id: item.path?.toString(),
              path: item.path,
              pageCategoryId: item.pageCategoryId,
              previewUrl: item.preview_url,
              title: item.title,
              label: item.label,
              tile_label: item.tile_label,
              geners: item.geners,
              genre: item.genre,
              release_date: item.release_date,
              year_of_release: item.year_of_release,
              age_rating: item.age_rating,
              actor: item.actor,
              keywords: item.keywords,
              seriesGenre: item.seriesGenre,
              total_episodes: item.total_episodes,
              totalEpisodes: item.total_episodes ?? item.total_sessions ?? item.totalEpisodes ?? item.assetCount ?? item.episodeCount,
              description: item.description,
              contentType: item.contentType,
              assetType: item.assetType,
              vodOrLivePosterImageFilePath: item.vodOrLivePosterImageFilePath,
              horizontalFilePath: item.horizontalFilePath,
              verticalFilePath: item.verticalFilePath,
              watchedCount: item.watchedCount,
              isUserWatched: item.isUserWatched,
              type: item.type,
              isLatest: item.isLatest,
              isActive: item.isActive,
              assetCount: item.total_episodes ?? item.total_sessions ?? item.assetCount ?? item.totalEpisodes ?? item.episodeCount,
              episodeCount: item.total_episodes ?? item.total_sessions ?? item.episodeCount ?? item.assetCount ?? item.totalEpisodes,
              // Map to expected video structure
              thumbnail: item.horizontalFilePath || item.vodOrLivePosterImageFilePath,
              imageUrl: item.horizontalFilePath || item.vodOrLivePosterImageFilePath,
              posterImage: item.vodOrLivePosterImageFilePath,
              thumbFilePath: item.thumbFilePath,
              trailer_url: item.trailer_url,
            }))
          }));

        setPageCategoryData(pageCategoryDataResult);
      } else {
        setPageCategoryData([]);
      }

      if (Array.isArray(homeScreenData?.subMenu)) {
        setGenres(homeScreenData.subMenu);
        setSelectedGenre(homeScreenData.subMenu?.[0].path);
        // pageCategoryDataFiltered is synced by the genre effect when pageCategoryData updates (avoid stale state here)
      } else {
        setGenres([]);
      }

      // Cache the home screen data (include subMenu so secondary menu / genre tabs show when loading from cache)
      setCachedData(homeDataCacheKey, {
        carouselData: carouselDataResult,
        pageCategoryData: pageCategoryDataResult,
        subMenu: homeScreenData?.subMenu || []
      });

      // Defer hiding skeleton so content and images have time to render and load (min ~700ms)
      skeletonHideTimeoutRef.current = setTimeout(() => {
        skeletonHideTimeoutRef.current = null;
        setIsLoadingCategoryData(false);
      }, 700);

    } catch (error) {
      console.error('Failed to fetch home screen data:', error);
      setCarouselData([]);
      setPageCategoryData([]);
      setToastMessage('Failed to load data');
      setToastType('error');
      setToastVisible(true);
      setIsLoadingCategoryData(false);
    } finally {
      if (!skeletonHideTimeoutRef.current) {
        setIsLoadingCategoryData(false);
      }
      // Remove from ongoing API calls
      ongoingApiCalls.current.delete(cacheKey);

      // Clean up old timestamps (older than 10 seconds)
      const cleanupTime = Date.now() - 10000;
      Object.keys(lastApiCallTime.current).forEach(key => {
        if (lastApiCallTime.current[key] < cleanupTime) {
          delete lastApiCallTime.current[key];
        }
      });
    }

    // Cache is already stored in the try block above
    // No need to store again here
  }, [getCachedData, setCachedData]);

  // Fetch initial data on mount (pageId 1)
  useEffect(() => {
    // Prevent multiple calls
    if (hasInitialDataLoaded.current || initialApiCallTriggered.current) return;

    hasInitialDataLoaded.current = true;
    initialApiCallTriggered.current = true;
    setInitialLoadTriggered(true);

    // Create a default category object to trigger the API call
    const defaultCategoryForApi = {
      id: '1',
      title: 'Home',
      path: '1',
      type: 'page',
      menuCategoryType: 'pagecategory',
      carouselApplicable: true
    };

    fetchDataForCategory(defaultCategoryForApi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount



  const handleCarouselItemPress = async (item) => {
    try {
      console.log('INFO ---> item in handleCarouselItemPress;', item);
      if (item.path) {
        // Build a normalized asset object
        const seriesTitle = item.title || item.label || 'Series';
        const seriesId = item.id || 'series_' + item.path;
        const asset = {
          preview_url: item?.previewUrl || null,
          trailer_url: item?.trailer_url || null,
          path: item.path,
          id: item.path || item.id,
          assetId: item.path || item.id,
          seriesTitle,
          geners: item.geners,
          release_date: item.release_date,
          year_of_release: item.year_of_release,
          age_rating: item.age_rating,
          actor: item.actor,
          keywords: item.keywords,
          seriesId,
          title: seriesTitle,
          label: seriesTitle,
          seriesGenres: Array.isArray(item.genre)
            ? item.genre
            : (typeof item.genre === 'string'
              ? item.genre.split(' • ')
              : []),
          genre: typeof item.genre === 'string' ? item.genre : (Array.isArray(item.genre) ? item.genre.join(' · ') : ''),
          description: item.description || `Trailer for ${seriesTitle}`,
          thumbnail: item.verticalFilePath || item.horizontalFilePath || item.vodOrLivePosterImageFilePath || item.imageUrl,
          verticalFilePath: item.verticalFilePath,
          horizontalFilePath: item.horizontalFilePath,
          vodOrLivePosterImageFilePath: item.vodOrLivePosterImageFilePath,
          poster: item.poster,
          imageUrl: item.imageUrl,
          isUserLikes: item.isUserLikes || 0,
          creator: item.creator || item.author || 'Series Creator',
          thumbFilePath: item.thumbFilePath,
        };
        // For subscribed users, open Reels; otherwise TileDetails
        if (!isNavigatingToDetailsRef.current) {
          isNavigatingToDetailsRef.current = true;
          if (navigation.push) {
            if (isSubscribed) {
              navigation.push('Reels', {
                initialIndex: 0,
                isSeries: true,
                isForYouPage: false,
                skipApiCall: false,
                path: asset.path ?? asset.assetId ?? asset.id,
                seriesData: {
                  title: asset.title,
                  id: asset.id ?? asset.assetId,
                  poster: asset.thumbFilePath,
                  geners: asset.geners,
                  genre: asset.genre,
                  release_date: asset.release_date,
                  year_of_release: asset.year_of_release,
                  age_rating: asset.age_rating,
                  actor: asset.actor,
                  keywords: asset.keywords,
                },
              });
            } else {
              navigation.push('TileDetails', { asset });
            }
          } else {
            if (isSubscribed) {
              navigation.navigate('Reels', {
                initialIndex: 0,
                isSeries: true,
                isForYouPage: false,
                skipApiCall: false,
                playback_source: 'home_carousel',
                path: asset.path ?? asset.assetId ?? asset.id,
                seriesData: {
                  title: asset.title,
                  id: asset.id ?? asset.assetId,
                  poster: asset.thumbFilePath,
                  geners: asset.geners,
                  genre: asset.genre,
                  release_date: asset.release_date,
                  year_of_release: asset.year_of_release,
                  age_rating: asset.age_rating,
                  actor: asset.actor,
                  keywords: asset.keywords,
                },
              });
            } else {
              navigation.navigate('TileDetails', { asset });
            }
          }
          setTimeout(() => {
            isNavigatingToDetailsRef.current = false;
          }, 500);
        }
        return;
      }

      // No path available
      setToastMessage('No video path available');
      setToastType('error');
      setToastVisible(true);
    } catch (error) {
      console.error('Error in handleCarouselItemPress:', error);
      setToastMessage('Error loading videos');
      setToastType('error');
      setToastVisible(true);
    }
  };

  const handleVideoPress = useCallback(async (video) => {
    try {
      // Prevent multiple rapid navigations to TileDetails (double-taps)
      if (isNavigatingToDetailsRef.current) return;

      isNavigatingToDetailsRef.current = true;

      const getGenres = (genres) => {
        return Array.isArray(genres)
          ? genres.join(' · ')
          : (typeof genres === 'string'
            ? genres.split(' • ')
            : undefined);
      }

      // Interactive shows: open dedicated InteractiveReelsScreen (static data, no API)
      if (video.is_interactive) {
        const showId = video.asset_group_id || video.assetGroupId || String(video.agdlmId || '');
        if (showId) {
          const nav = navigation.push || navigation.navigate;
          nav.call(navigation, 'InteractiveReels', { showId, startEpisodeIndex: 0 });
          setTimeout(() => { isNavigatingToDetailsRef.current = false; }, 500);
          return;
        }
      }

      // If video has a path, always open Tile Details (with or without trailer)
      if (video.path) {
        console.log('INFO ---> video in handleVideoPress;', video);
        const seriesTitle = video.title || video.label || 'Video';
        const seriesId = video.id || 'video_' + video.path;
        const asset = {
          preview_url: video.previewUrl || video.trailer_url || null,
          trailer_url: video?.trailer_url || null,
          path: video.path,
          id: video.path || video.id,
          assetId: video.path || video.id,
          seriesTitle,
          seriesId,
          title: seriesTitle,
          label: seriesTitle,
          geners: video.geners,
          release_date: video.release_date,
          year_of_release: video.year_of_release,
          age_rating: video.age_rating,
          actor: video.actor,
          keywords: video.keywords,
          total_episodes: video.total_episodes || video.totalEpisodes || video.assetCount,
          totalEpisodes: video.totalEpisodes || video.total_episodes,
          assetCount: video.assetCount || video.total_episodes,
          seriesGenres: getGenres(video?.genre ?? video?.geners),
          genre: getGenres(video?.genre ?? video?.geners),
          description: video.description || `Trailer for ${seriesTitle}`,
          thumbnail: video.verticalFilePath || video.horizontalFilePath || video.vodOrLivePosterImageFilePath || video.imageUrl,
          verticalFilePath: video.verticalFilePath,
          horizontalFilePath: video.horizontalFilePath,
          thumbFilePath: video.thumbFilePath,
          vodOrLivePosterImageFilePath: video.vodOrLivePosterImageFilePath,
          poster: video.poster,
          imageUrl: video.imageUrl,
          isUserLikes: video.isUserLikes || 0,
          creator: video.creator || video.author || 'Series Creator',
        };
        if (navigation.push) {
          if (isSubscribed) {
            navigation.push('Reels', {
              initialIndex: 0,
              isSeries: true,
              isForYouPage: false,
              skipApiCall: false,
              path: asset.path ?? asset.assetId ?? asset.id,
              seriesData: {
                title: asset.title,
                id: asset.id ?? asset.assetId,
                poster: asset?.thumbFilePath,
                seriesGenre: asset?.seriesGenres || asset?.genre,
                geners: asset.geners,
                release_date: asset.release_date,
                year_of_release: asset.year_of_release,
                age_rating: asset.age_rating,
                actor: asset.actor,
                keywords: asset.keywords,
              },
            })
          } else {
            navigation.push('TileDetails', { asset });
          }
        } else {
          if (isSubscribed) {
            navigation.navigate('Reels', {
              initialIndex: 0,
              isSeries: true,
              isForYouPage: false,
              skipApiCall: false,
              playback_source: 'home_tile',
              path: asset.path ?? asset.assetId ?? asset.id,
              seriesData: {
                title: asset.title,
                id: asset.id ?? asset.assetId,
                poster: asset?.thumbFilePath,
                seriesGenre: asset?.seriesGenres || asset?.genre,
                geners: asset.geners,
                release_date: asset.release_date,
                year_of_release: asset.year_of_release,
                age_rating: asset.age_rating,
                actor: asset.actor,
                keywords: asset.keywords,
              },
            })
          } else {
            navigation.navigate('TileDetails', { asset })
          }
        }
        setTimeout(() => {
          isNavigatingToDetailsRef.current = false;
        }, 500);

        // Fire subscription check in background so UI is snappy
        checkSubscriptionStatus().catch((error) => {
          console.error('Error checking subscription status:', error);
        });
        return;
      }

      // If video has a direct videoUrl but no path, show as tile details (preview then Watch)
      if (video.videoUrl) {
        const asset = {
          ...video,
          path: video.path || video.id,
          preview_url: video.previewUrl || video.videoUrl,
          videoUrl: video.videoUrl,
          hlsUrl: video.hlsUrl || video.videoUrl,
          title: video.title || video.label || 'Video',
          label: video.label || video.title || 'Video',
          verticalFilePath: video.verticalFilePath || video.horizontalFilePath || video.thumbnail,
          horizontalFilePath: video.horizontalFilePath || video.verticalFilePath || video.thumbnail,
        };
        if (navigation.push) {
          navigation.push('TileDetails', { asset });
        } else {
          navigation.navigate('TileDetails', { asset });
        }
        setTimeout(() => {
          isNavigatingToDetailsRef.current = false;
        }, 500);

        // Background subscription check
        checkSubscriptionStatus().catch((error) => {
          console.error('Error checking subscription status:', error);
        });
        return;
      }

      setToastMessage('No video data available');
      setToastType('error');
      setToastVisible(true);

    } catch (error) {
      console.error('Error in handleVideoPress:', error);
      setToastMessage('Error playing video');
      setToastType('error');
      setToastVisible(true);
    } finally {
      // If something failed before navigation, clear the guard quickly
      setTimeout(() => {
        isNavigatingToDetailsRef.current = false;
      }, 300);
    }
  }, [navigation, checkSubscriptionStatus, isSubscribed]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);


  // Handler for subscription offer modal (useCallback for stable ref when memoizing swimlanes)
  const handleUnlockPress = useCallback((episode) => {
    try {
      setToastMessage(`🎉 Series unlocked!`);
      setToastType('success');
      setToastVisible(true);

      // Navigate to TileDetails after unlocking (same as tile click)
      if (episode.seriesData) {
        const asset = {
          ...episode.seriesData,
          path: episode.seriesData.path || episode.seriesData.id,
          title: episode.seriesData.title || episode.seriesData.label,
          label: episode.seriesData.label || episode.seriesData.title,
        };
        if (!isNavigatingToDetailsRef.current) {
          isNavigatingToDetailsRef.current = true;
          if (navigation.push) {
            navigation.push('TileDetails', { asset });
          } else {
            navigation.navigate('TileDetails', { asset });
          }
          setTimeout(() => {
            isNavigatingToDetailsRef.current = false;
          }, 500);
        }
      } else {
        handleVideoPress(episode);
      }
    } catch (error) {
      console.error('Error in handleUnlockPress:', error);
      // Error handling
      setToastMessage('❌ Error occurred!');
      setToastType('error');
      setToastVisible(true);
    }
  }, [navigation, handleVideoPress]);

  const handleSubscribe = async () => {
    if (isGuestUser) {
      await redirectGuestToLogin({
        navigation,
        signOut,
        redirectToSubscriptionFromHome: true,
      });
      return;
    }

    setSubscriptionOfferVisible(false);
    setLockedEpisode(null);
    if (isSubscribed) return;
    if (Platform.OS === "ios") {
      navigation.navigate("Subscription");
    } else {
      navigation.navigate("SubscriptionWebView");
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
      const homeButtonText = isEligibleForSubscription || isGuestUser ? subscriptionCta.home_trial_cta : subscriptionCta.home_subscribe_cta;
      const analyticsService = require('../services/analytics').default;
      var properties = {
        content_id: '',
        content_title: '',
        content_type: 'Home Screen',
        season_number: 1,
        total_episodes: 0,
        page_name: "Home Screen",
        button_name: homeButtonText,
        button_location: "Home Screen Banner",
        action_type: "subscription_required",
        reason_for_prompt: "premium_content_access",
        conversion_step: "subscription_prompt",
        distinct_id: userIdEvent,
        user_id: userIdEvent,
        subscription_tier: subscriptionTierEvent,
        subscription_plan_name: subscriptionPlanName,
        is_logged_in: isLoggedIn,
        language: languageEvent,
      }
      analyticsService.logSubscriptionButtonClicked(homeButtonText, properties);
    } catch (error) {
      // Error logged
      return;
    }
  };

  const handleShowAuthGate = () => {
    setSubscriptionOfferVisible(false);
    setLockedEpisode(null);
    // Navigate to auth screen first
    navigation.navigate('Auth');
  };

  const extractTrailerUrlFromItem = useCallback((item) => {
    if (!item) return null;
    return (
      item.trailer_url ||
      item.trailerUrl ||
      item.preview_url ||
      item.previewUrl ||
      null
    );
  }, []);

  const closeExpandedItem = useCallback((maybeMetrics) => {
    let metrics = maybeMetrics;
    if (
      metrics != null &&
      typeof metrics === 'object' &&
      metrics.nativeEvent != null &&
      typeof metrics.trailerDuration !== 'number' &&
      typeof metrics.watchedDuration !== 'number'
    ) {
      metrics = null;
    }
    const itemToReport = expandedItem?.item;
    expandedItemRequestId.current += 1;
    setExpandedItem(null);
    if (!overlayFullTrailerLoggedRef.current) {
      callTrailerWatchedEvents(itemToReport, 'Artwork Long Press', metrics ?? null, 'Artwork Long Press');
    }
    overlayFullTrailerLoggedRef.current = false;
  }, [expandedItem]);

  // Long press handler
  const handleLongPress = useCallback(async (item, layout) => {
    const requestId = ++expandedItemRequestId.current;
    const directTrailerUrl = extractTrailerUrlFromItem(item);
    overlayFullTrailerLoggedRef.current = false;

    setExpandedItem({
      item: {
        ...item,
        trailerUrl: directTrailerUrl || null,
      },
      layout,
    });

    if (directTrailerUrl) return;

    if (expandedItemRequestId.current !== requestId) return;

  }, [extractTrailerUrlFromItem]);

  // Handle genre selection and fetch videos for that genre
  const handleGenrePress = useCallback(async (genre, index) => {
    const genreId = genre.path || genre.name;
    setSelectedGenre(genreId);

    // Scroll so the first content (categories) is in view at top, not the carousel
    const flatList = mainScrollViewRef.current;
    const scrollReduce = 150; // Slightly less scroll so first content isn't flush to top
    try {
      if (flatList?.scrollToIndex) {
        flatList.scrollToIndex({ index: 2, viewPosition: 0, viewOffset: scrollReduce, animated: true });
      } else if (flatList?.scrollToOffset) {
        const topPadding = Platform.OS === 'android' ? insets.top + 70 : insets.top + 20;
        const carouselAndGenresHeight = 350 - scrollReduce;
        flatList.scrollToOffset({ offset: topPadding + carouselAndGenresHeight, animated: true });
      } else if (flatList?.scrollTo) {
        flatList.scrollTo({ y: 0, animated: true });
      }
    } catch (_) {
      if (flatList?.scrollToOffset) {
        const topPadding = Platform.OS === 'android' ? insets.top + 70 : insets.top + 20;
        flatList.scrollToOffset({ offset: topPadding + 410 - scrollReduce, animated: true });
      }
    }

    // Center the selected genre button in both horizontal lists
    const screenWidth = Dimensions.get('window').width;
    let currentX = 0;
    // Calculate total width of buttons before the selected one
    for (let i = 0; i < index; i++) {
      const g = genres[i];
      currentX += genreButtonWidths.current[g.path || g.name] || 90; // Fallback to approx width
    }
    const buttonWidth = genreButtonWidths.current[genreId] || 90;
    const scrollX = Math.max(0, currentX - (screenWidth / 2) + (buttonWidth / 2));

    fixedGenreScrollViewRef.current?.scrollTo({ x: scrollX, animated: true });
    inlineGenreScrollViewRef.current?.scrollTo({ x: scrollX, animated: true });
    try {
      var lastGenreIndex = genres.findIndex(g => (g.path || g.title) === selectedGenre);
      var lastSelectedGenre = lastGenreIndex !== -1 ? genres[lastGenreIndex].title : "All";
      const analyticsService = require('../services/analytics').default;
      analyticsService.logScreenView(
        "Home Screen",                // page_name / screenName
        genre.title,         // previous_page
        lastSelectedGenre                             // page_category (reserved, can be filled later)
      );
    } catch (error) {
      console.error('Error in handleGenrePress:', error);
    }
  }, [genres, insets]);

  const callSliderScrollEvents = useCallback((metrics, bucketId, category, bucket_type) => {
    try {
      const analyticsService = require('../services/analytics').default;
      var properties = {
        page_name: "Home Screen",
        cards_scrolled: metrics.cards_scrolled,
        total_cards_in_bucket: metrics.total_cards_in_bucket,
        scroll_percentage: metrics.scroll_percentage,
        reached_end_of_bucket: metrics.reached_end_of_bucket,
        bucket_name: category?.title,
        bucket_position: bucketId,
        bucket_type: bucket_type,
      }
      analyticsService.logBucketScrolled(category?.title, properties);
    } catch (error) {
      // Error logged
      return;
    }
  }, []);

  const buildArtworkClickProperties = (item, category, index, sectionName, pageName) => {
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
    const contentId = String(item?.path ?? item?.id ?? '');
    const title = item?.title || item?.label || 'Content';
    // content_type: never null; support type, assetType, contentType
    const contentType = (item?.type || item?.assetType || item?.contentType || 'content');
    // content_genre: never empty; support geners (API), genre, seriesGenre, category label
    const genreSource = item?.genre ?? item?.geners ?? item?.seriesGenre ?? category?.title ?? category?.label;
    const genre = Array.isArray(genreSource)
      ? genreSource.join(' · ')
      : (typeof genreSource === 'string' ? genreSource : '');
    const contentGenre = (genre && String(genre).trim() !== '') ? String(genre).trim() : 'Uncategorized';
    // episode fields: never null; use 0 for missing numbers, '' for missing title
    const seasonNumber = item?.seasonNumber ?? item?.season_number ?? 1;
    const totalEpisodes = item?.totalEpisodes ?? item?.assetCount ?? 0;

    return {
      content_id: contentId,
      content_title: title,
      content_type: contentType,
      content_genre: contentGenre,
      season_number: seasonNumber,
      total_episodes: totalEpisodes,
      section_name: sectionName,
      card_position: (index ?? 0) + 1,
      page_name: pageName,
      original_show_name: item?.originalShowName || item?.seriesTitle || title,
      distinct_id: userIdEvent,
      user_id: userIdEvent,
      subscription_tier: subscriptionTierEvent,
      subscription_plan_name: subscriptionPlanName,
      is_logged_in: isLoggedIn,
      language: languageEvent,
    };
  };

  const callArtworkClickEvents = useCallback((item, category, index, sectionNameOverride) => {
    try {
      const analyticsService = require('../services/analytics').default;
      const sectionName =
        sectionNameOverride ||
        String(category?.label || category?.title || 'Section');
      const pageName = 'Home Screen';

      const properties = buildArtworkClickProperties(
        item,
        category,
        index,
        sectionName,
        pageName,
      );

      analyticsService.logArtworkClicked(properties.content_id, properties);
    } catch (error) {
      // Error logged
      return;
    }
  }, [isGuestUser, user, isSubscribed]);

  /** Trailer length from API when player duration is unknown (milliseconds). */
  const parseTrailerDurationMsFromItem = (it) => {
    if (!it) return null;
    const ms = it.trailerDurationMs ?? it.durationMs ?? it.duration_millis;
    if (typeof ms === 'number' && ms > 0) return ms;
    const td = it.trailerDuration ?? it.trailer_duration;
    if (typeof td === 'number' && td > 0) {
      if (td >= 3600000 || td > 100000) return td;
      return td * 1000;
    }
    const d = it.duration ?? it.duration_seconds;
    if (typeof d === 'number' && d > 0 && d <= 86400) return d * 1000;
    return null;
  };

  const buildTrailerWatchedProperties = (item, sectionName, pageName, metrics = null, action = 'trailer_completed') => {

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
    const contentId = String(item?.path ?? item?.id ?? '');
    const title = item?.title ?? item?.label ?? 'Content';
    const contentType = item?.contentType ?? item?.assetGroupType ?? (item?.type === 'asset_group' ? 'series' : item?.assetType) ?? null;
    let rawGenre = item?.seriesGenres ?? item?.genre ?? item?.geners ?? item?.content_genre ?? '';
    const genre = Array.isArray(rawGenre) ? rawGenre.join(' · ') : rawGenre;
    const episodeTitle = item?.episodeTitle ?? item?.label ?? item?.title ?? title ?? '';
    const watchlistKey = String(item?.path || item?.id || item?.assetGroupId || item?.seriesId || '');
    const userSharedFromItem = item?.user_shared === true || item?.isUserShared === 1;

    let trailerDuration = item?.trailerDuration ?? item?.duration ?? null;
    let watchDuration = null;
    let completionPercentage = null;

    const hasNumericMetrics =
      metrics != null &&
      typeof metrics === 'object' &&
      !(
        metrics.nativeEvent != null &&
        typeof metrics.trailerDuration !== 'number' &&
        typeof metrics.watchedDuration !== 'number'
      ) &&
      (typeof metrics.trailerDuration === 'number' || typeof metrics.watchedDuration === 'number');

    if (hasNumericMetrics) {
      let trailerMs =
        typeof metrics.trailerDuration === 'number' && metrics.trailerDuration > 0
          ? metrics.trailerDuration
          : 0;
      const watchedMs =
        typeof metrics.watchedDuration === 'number' && metrics.watchedDuration >= 0
          ? metrics.watchedDuration
          : 0;

      if (trailerMs <= 0) {
        const fb = parseTrailerDurationMsFromItem(item);
        if (fb != null) trailerMs = fb;
      }

      if (trailerMs > 0) {
        trailerDuration = Math.floor(trailerMs / 1000);
      }
      if (watchedMs >= 0 && trailerMs > 0) {
        watchDuration = Math.floor(watchedMs / 1000);
        completionPercentage = Math.min(100, Math.round((watchedMs / trailerMs) * 100));
      } else if (watchedMs > 0) {
        watchDuration = Math.floor(watchedMs / 1000);
      }
    }

    return {
      content_id: contentId,
      content_title: title,
      content_type: contentType,
      content_genre: genre,
      episode_title: episodeTitle,
      original_show_name: item?.originalShowName || item?.seriesTitle || title,
      original_show_id: item?.seriesId || item?.assetGroupId || item?.id || item?.path || "",
      trailer_duration: trailerDuration,
      trailer_source: pageName,
      watch_duration: watchDuration,
      completion_percentage: completionPercentage,
      is_completed: completionPercentage === 100 ? true : false,
      playback_quality: 'Auto',
      User_did__action: action || 'trailer_completed',
      reaction: 'None',
      user_saved: watchlistKey ? isSeriesInMyList(watchlistKey) : false,
      user_shared: sharedContentIdsRef.current.has(contentId) || userSharedFromItem,
      artwork_long_pressview: true,
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

  const callTrailerWatchedEvents = (item, sectionName, metrics = null, action = 'trailer_completed') => {
    try {
      if (!item) return;
      const analyticsService = require('../services/analytics').default;
      const pageName = 'Home Screen';
      const properties = buildTrailerWatchedProperties(
        item,
        sectionName,
        pageName,
        metrics,
        action
      );
      analyticsService.logTrailerWatched(properties.content_id, properties);
    } catch (error) {
      // Error logged
      return;
    }
  };

  const onLongPressTrailerFirstComplete = (item, metrics) => {
    overlayFullTrailerLoggedRef.current = true;
    callTrailerWatchedEvents(item, 'Artwork Long Press', metrics ?? null, 'trailer_completed');
  };

  const buildHeroBannerProperties = (banner, index, overrides = {}) => {
    var userIdEvent = "", subscriptionTierEvent = "", subscriptionPlanName = "", languageEvent = "";
    let isLoggedIn = false;
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
    const bannerId = banner?.id || banner?.path?.toString() || `banner_${index + 1}`;
    const title = banner?.title || banner?.label || 'Hero Banner';
    const contentId = banner?.path?.toString() || banner?.id || bannerId;
    const hasVideo =
      !!(banner?.previewUrl || banner?.preview_url || banner?.hlsUrl || banner?.videoUrl || banner?.assetUrl);
    const bannerType = hasVideo ? 'video' : 'image';
    const genreSource = banner?.content_genre ?? banner?.genre ?? banner?.genres ?? banner?.seriesGenre;
    const contentGenreRaw = Array.isArray(genreSource)
      ? genreSource.join(' · ')
      : (typeof genreSource === 'string' ? genreSource : '') || '';
    const contentGenre = (contentGenreRaw && String(contentGenreRaw).trim()) ? String(contentGenreRaw).trim() : 'Uncategorized';

    const heroCardSwiped = overrides.hero_card_swiped || 'auto';

    return {
      banner_id: bannerId,
      banner_title: title,
      banner_type: bannerType,
      banner_position: index + 1,
      content_id: contentId,
      content_title: title,
      content_genre: contentGenre,
      original_show_name: banner?.originalShowName || title,
      hero_card_swiped: heroCardSwiped,
      auto_swiped_enabled: heroCardSwiped === 'auto',
      is_muted: overrides.is_muted ?? false,
      cta_clicked: overrides.cta_clicked || 'banner_itself',
      trailer_played: overrides.trailer_played ?? false,
      time_to_click: overrides.time_to_click ?? null,
      action_after_click: overrides.action_after_click || 'navigate_to_detail',
      user_id: userIdEvent,
      distinct_id: userIdEvent,
      subscription_tier: subscriptionTierEvent,
      subscription_plan_name: subscriptionPlanName,
      is_logged_in: isLoggedIn,
      language: languageEvent,
    };
  };

  const callPageScrollEvents = (from_section, to_section, section_sequence, scroll_direction) => {
    try {
      const analyticsService = require('../services/analytics').default;
      var properties = {
        page_name: "Home Screen",
        from_section: from_section,
        to_section: to_section,
        section_sequence: section_sequence,
        scroll_direction: scroll_direction,

      }
      analyticsService.logPageScrolled("Home screen", properties);
    } catch (error) {
      // Error logged
      return;
    }
  };

  const heroImpressionTimesRef = useRef({});

  const callHeroBannerViewEvents = (banner, index, hero_card_swiped = 'auto', overrides = {}) => {
    try {
      const analyticsService = require('../services/analytics').default;
      const properties = buildHeroBannerProperties(banner, index, {
        hero_card_swiped,
        ...overrides,
      });

      analyticsService.logHeroBannerViewed('Home Screen', properties);
    } catch (error) {
      // Error logged
      return;
    }
  };

  const callHeroBannerLeaveEvents = (banner, index, viewDurationMs) => {
    try {
      const viewDurationSec = Math.max(0, (viewDurationMs || 0) / 1000);
      callHeroBannerViewEvents(banner, index, 'auto', { view_duration: viewDurationSec });
    } catch (error) {
      return;
    }
  };

  const callHeroBannerClickEvents = (banner, index, overrides = {}) => {
    try {
      const analyticsService = require('../services/analytics').default;

      const bannerId = banner?.id || banner?.path?.toString() || `banner_${index + 1}`;
      const impressionTime = heroImpressionTimesRef.current[bannerId];
      let timeToClick = null;
      if (impressionTime) {
        timeToClick = (Date.now() - impressionTime) / 1000; // seconds
      }

      const properties = buildHeroBannerProperties(banner, index, {
        hero_card_swiped: overrides.hero_card_swiped || 'manual',
        cta_clicked: overrides.cta_clicked || 'banner_itself',
        trailer_played: overrides.trailer_played ?? false,
        time_to_click: overrides.time_to_click ?? timeToClick,
        action_after_click: overrides.action_after_click || 'navigate_to_detail',
        is_muted: overrides.is_muted ?? false,

      });

      analyticsService.logHeroBannerClicked('Home Screen', properties);
    } catch (error) {
      // Error logged
      return;
    }
  };

  const CAROUSEL_IN_THRESHOLD = 350;
  const registerSectionLayout = useCallback((index, name) => (event) => {
    const { y, height } = event.nativeEvent.layout;
    if (!sectionLayoutsRef.current) sectionLayoutsRef.current = [];
    sectionLayoutsRef.current[index] = { y, height, name };
  }, []);
  const handleVerticalScroll = useCallback((event) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent || {};
    const offsetY = contentOffset?.y ?? 0;
    const viewportHeight = layoutMeasurement?.height ?? 0;

    // Control visibility of inline vs floating genre tabs based on scroll position.
    // Use simple thresholds so that only ONE of them is rendered at any time.
    const INLINE_HIDE_Y = 350;  // above this, inline bar hides
    const shouldShowInline = offsetY < INLINE_HIDE_Y;

    // Calculate total sticky header height based on inline genre visibility
    const iOSGenreBarStickyHeight = 60; // marginTop 10 + button 38 + marginBottom 8
    let stickyTopOffset = Platform.OS === 'android' ? insets.top + + 10 : 10;

    // Logo bar height
    if (Platform.OS === 'android') {
      stickyTopOffset = insets.top + 70;
      if (!shouldShowInline && genres.length > 0) stickyTopOffset += iOSGenreBarStickyHeight;
    } else {
      const baseIOSHeaderHeight = isIpad ? Math.max(insets.top + 20, 70) : (insets.top + 20);
      stickyTopOffset = baseIOSHeaderHeight;
      if (!shouldShowInline && genres.length > 0) stickyTopOffset += iOSGenreBarStickyHeight;
    }

    updateViewport(offsetY, viewportHeight, stickyTopOffset);

    // Keep Animated value in sync in JS as a fallback so interpolations work
    const isCarouselInView = offsetY <= CAROUSEL_IN_THRESHOLD;
    if (isCarouselInView !== carouselInViewRef.current) {
      carouselInViewRef.current = isCarouselInView;
      setCarouselInView(isCarouselInView);
    }

    if (shouldShowInline !== showInlineGenresRef.current) {
      showInlineGenresRef.current = shouldShowInline;
      setShowInlineGenres(shouldShowInline);
    }
    currentScrollY.current = offsetY; // Sync scroll position
    const viewportCenterY = offsetY + (layoutMeasurement?.height ?? 0) / 2;

    const sections = sectionLayoutsRef.current || [];
    if (!sections.length) return;

    // Find section whose vertical range contains the viewport center
    let activeIndex = null;
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section) continue;
      const startY = section.y;
      const endY = section.y + section.height;
      if (viewportCenterY >= startY && viewportCenterY <= endY) {
        activeIndex = i;
        break;
      }
    }

    // Fallback: pick the nearest section by distance to center
    if (activeIndex === null) {
      let minDist = Infinity;
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section) continue;
        const center = section.y + section.height / 2;
        const dist = Math.abs(viewportCenterY - center);
        if (dist < minDist) {
          minDist = dist;
          activeIndex = i;
        }
      }
    }

    if (activeIndex === null) return;

    const prevIndex = currentSectionIndexRef.current;
    if (prevIndex === activeIndex) return;

    const toSection = sections[activeIndex]?.name || `Section ${activeIndex + 1}`;
    const fromSection =
      prevIndex != null && sections[prevIndex]
        ? sections[prevIndex].name
        : null;

    const scrollDirection =
      prevIndex == null
        ? 'none'
        : activeIndex > prevIndex
          ? 'down'
          : 'up';

    currentSectionIndexRef.current = activeIndex;

    if (fromSection && toSection && scrollDirection !== 'none') {
      const fromNum = prevIndex != null ? prevIndex + 1 : 0;
      const toNum = activeIndex + 1;
      const sectionSequence = `section_${fromNum}_to_section_${toNum}`;
      callPageScrollEvents(fromSection, toSection, sectionSequence, scrollDirection);
    }
  }, [
    callPageScrollEvents
  ]);
  // Add to watchlist handler
  const handleAddToWatchList = useCallback(async (item) => {
    try {
      // Check if user is guest - don't allow watchlist for guests
      if (isGuestUser) {
        setToastMessage('Please login in to add to watchlist');
        setToastType('error');
        setToastVisible(true);
        return;
      }

      // Get user ID
      const userId = user?.userId || user?.uid || null;
      if (!userId) {
        setToastMessage('Please login in to add to watchlist');
        setToastType('error');
        setToastVisible(true);
        return;
      }

      // Get the series/asset ID from the item
      const seriesId = String(item.path || item.id || item.assetGroupId || '');
      if (!seriesId) {
        setToastMessage('Invalid item - cannot add to watchlist');
        setToastType('error');
        setToastVisible(true);
        return;
      }

      // Check if already in watchlist
      const isInWatchlist = isSeriesInMyList(seriesId);

      if (isInWatchlist) {
        // Remove from watchlist
        // MyListContext handles both optimistic update AND API call internally
        try {
          const result = await removeSeriesFromMyList(seriesId, userId);

          if (result?.success === false) {
            setToastMessage('Failed to remove from watchlist');
            setToastType('error');
            setToastVisible(true);
          } else {
            setToastMessage('Removed from watchlist');
            setToastType('success');
            setToastVisible(true);
          }
        } catch (error) {
          console.error('Error removing from watchlist:', error);
          setToastMessage('Failed to remove from watchlist');
          setToastType('error');
          setToastVisible(true);
        }
      } else {
        // Add to watchlist
        // MyListContext handles both optimistic update AND API call internally
        try {
          const result = await addSeriesToMyList(seriesId, userId);

          if (result?.success === false) {
            setToastMessage('Failed to add to watchlist');
            setToastType('error');
            setToastVisible(true);
          } else {
            setToastMessage('Added to watchlist');
            setToastType('success');
            setToastVisible(true);
          }
        } catch (error) {
          console.error('Error adding to watchlist:', error);
          setToastMessage('Failed to add to watchlist');
          setToastType('error');
          setToastVisible(true);
        }
      }
    } catch (error) {
      console.error('Error in handleAddToWatchList:', error);
      setToastMessage('An error occurred');
      setToastType('error');
      setToastVisible(true);
    }
  }, [user, isGuestUser, addSeriesToMyList, removeSeriesFromMyList, isSeriesInMyList]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (lockedEpisode) {
        setSubscriptionOfferVisible(false);
        setLockedEpisode(null);
        if (lockedEpisode.seriesData) {
          const asset = {
            ...lockedEpisode.seriesData,
            path: lockedEpisode.seriesData.path || lockedEpisode.seriesData.id,
            title: lockedEpisode.seriesData.title || lockedEpisode.seriesData.label,
            label: lockedEpisode.seriesData.label || lockedEpisode.seriesData.title,
          };
          if (navigation.push) {
            navigation.push('TileDetails', { asset });
          } else {
            navigation.navigate('TileDetails', { asset });
          }
        } else {
          handleVideoPress(lockedEpisode);
        }
      }
    });

    return unsubscribe;
  }, [navigation, lockedEpisode, handleVideoPress]);

  const MemoHeroBackgroundGradient = React.memo(HeroBackgroundGradient);

  // One FlatList item per section so we virtualize by section (fewer mounted views, less OOM)
  const homeSections = React.useMemo(() => {
    const cats = memoizedFilteredCategories || [];
    return [
      { type: 'featured' },
      { type: 'genres' },
      { type: 'starme' },
      ...cats.map((category, index) => ({ type: 'category', category, index })),
      { type: 'bottom' },
    ];
  }, [memoizedFilteredCategories]);

  // Show skeleton until we have data AND (when loading from API) until content/images have had time to load
  const hasAnyContent = (pageCategoryData?.length ?? 0) > 0 || (carouselData?.length ?? 0) > 0;
  const showSkeleton = isLoadingCategoryData || (initialLoadTriggered && !hasAnyContent);

  // Clear skeleton-hide timeout on unmount
  useEffect(() => {
    return () => {
      if (skeletonHideTimeoutRef.current) {
        clearTimeout(skeletonHideTimeoutRef.current);
        skeletonHideTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* iOS: status bar matches header – carousel at top, transitions to black in sync with app logo container (scroll 0–50) */}
      {Platform.OS === 'ios' && !showSkeleton && insets.top > 0 && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.statusBarCarouselStrip,
              {
                height: insets.top,
                backgroundColor: carouselBgTopColor,
                opacity: scrollY.interpolate({
                  inputRange: [0, 50],
                  outputRange: [1, 0],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.statusBarCarouselStrip,
              {
                height: insets.top,
                opacity: scrollY.interpolate({
                  inputRange: [0, 50],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            {Platform.OS === 'android' ? (
              // Android: Use a darker semi-transparent overlay to better hide content behind
              // This simulates the blur effect since native blur doesn't work well on Android
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.88)' }]} />
            ) : (
              <BlurView
                intensity={84}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
            )}
          </Animated.View>
        </>
      )}
      <ScrollViewRefProvider scrollViewRef={mainScrollViewRef}>
        <SafeAreaView style={styles.container}>
          {/* Plant main content behind skeleton when we have data so it mounts and images load while skeleton is visible */}
          {hasAnyContent && (
            <View
              style={styles.containerMain}
              pointerEvents={showSkeleton ? 'none' : 'auto'}
              collapsable={false}
            >


            <Animated.View
              style={[
                styles.containerAll,
                {
                  opacity: scrollY.interpolate({
                    inputRange: [0, 500],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              <MemoHeroBackgroundGradient ref={heroBgGradientRef} />
            </Animated.View>
            <AppStatusBar />

            {/* Sticky Top Bar (Logo & Button). iOS: expand height when genre bar is sticky so one blur covers both */}
            {(() => {
              const iOSGenreBarStickyHeight = 60; // marginTop 10 + button 38 + marginBottom 8
              const baseIOSHeaderHeight = isIpad ? Math.max(insets.top + 20, 70) : (insets.top + 20);
              const headerHeight =
                Platform.OS === 'android'
                  ? insets.top + 70
                  : baseIOSHeaderHeight + (!showInlineGenres && genres.length > 0 ? iOSGenreBarStickyHeight : 0);
              return (
                <View
                  style={[
                    styles.fixedHeader,
                    {
                      paddingTop: Platform.OS === "android" ? insets.top + 10 : 10,
                      height: headerHeight,
                    },
                  ]}
                  pointerEvents="box-none"
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        opacity: scrollY.interpolate({
                          inputRange: [0, 50],
                          outputRange: [0, 1],
                          extrapolate: "clamp",
                        }),
                      },
                    ]}
                  >
                    {Platform.OS === 'android' ? (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.88)', marginBottom: -2 }]} />
                    ) : (
                      <BlurView
                        intensity={84}
                        tint="dark"
                        style={[StyleSheet.absoluteFill, { marginBottom: -2 }]}
                      />
                    )}
                  </Animated.View>
                  <View style={styles.headerContainer}>
                    <TouchableOpacity
                      activeOpacity={1}
                      style={styles.headerLogoTouchable}
                    >
                      <AppLogo />
                    </TouchableOpacity>
                    {!isSubscribed && <TouchableOpacity
                      onPress={handleSubscribe}
                      activeOpacity={0.8}
                      disabled={isSubscribed}
                    >
                      <LinearGradient
                        colors={['rgba(11, 42, 54, 1)', 'rgba(17, 66, 85, 1)', 'rgba(11, 42, 54, 1)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.trialButton}
                      >
                        <Svg width="15" height="11" viewBox="0 0 15 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <Path d="M7.37402 0C7.50966 0 7.64388 0.0310355 7.76562 0.0908203C7.88736 0.150628 7.99424 0.237387 8.07715 0.344727L10.5342 3.49512C10.5532 3.51928 10.5797 3.53681 10.6094 3.54492C10.639 3.55301 10.6706 3.55116 10.6992 3.54004L13.5371 2.44727C13.69 2.39087 13.8555 2.37775 14.0156 2.4082C14.1758 2.43869 14.3247 2.51239 14.4463 2.62109C14.5677 2.72979 14.658 2.86965 14.7061 3.02539C14.754 3.18098 14.7587 3.34681 14.7197 3.50488L13.0068 10.0977C12.957 10.2885 12.8454 10.4574 12.6895 10.5781C12.5334 10.6989 12.3418 10.7653 12.1445 10.7656H2.60449C2.40718 10.7653 2.21561 10.6989 2.05957 10.5781C1.90356 10.4574 1.79202 10.2885 1.74219 10.0977L0.0292969 3.50488C-0.0122678 3.34633 -0.00910289 3.17943 0.0380859 3.02246C0.0852921 2.86554 0.174808 2.72454 0.296875 2.61523C0.419167 2.50587 0.570057 2.43183 0.731445 2.40234C0.892668 2.37296 1.05901 2.3883 1.21191 2.44727L4.0498 3.54004C4.07841 3.55109 4.11005 3.55299 4.13965 3.54492C4.16923 3.53679 4.19585 3.51922 4.21484 3.49512L6.67187 0.344727C6.75477 0.237438 6.86171 0.150607 6.9834 0.0908203C7.10498 0.0311495 7.23859 5.70693e-05 7.37402 0ZM7.37305 5.38281C6.64131 5.38281 6.04785 5.97627 6.04785 6.70801C6.04799 7.43962 6.6414 8.03223 7.37305 8.03223C8.10463 8.03214 8.6981 7.43957 8.69824 6.70801C8.69824 5.97632 8.10471 5.3829 7.37305 5.38281Z" fill="white" />
                        </Svg>
                        <View style={[{ height: 11, backgroundColor: 'rgba(255, 255, 255, 0.25)', width: 1 }]} />
                        <Text style={styles.trialButtonText}>
                          {isEligibleForSubscription || isGuestUser
                            ? subscriptionCta.home_trial_cta
                            : subscriptionCta.home_subscribe_cta}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>}
                  </View>
                </View>
              );
            })()}

            {/* Floating/Sticky Genre Bar - docked below TopBar when scrolling. iOS: no background (header expands to cover) */}
            {!showSkeleton && genres.length > 0 && (
              <Animated.View
                style={[
                  styles.fixedGenreContainer,
                  { opacity: showInlineGenres ? 0 : 1 },
                  {
                    top: Platform.OS === "android" ? insets.top + 70 : (isIpad ? Math.max(insets.top + 20, 70) : insets.top + 20), // Docked exactly below TopBar (no overlap)
                    pointerEvents: showInlineGenres ? 'none' : 'auto'
                  }
                ]}
              >
                {Platform.OS === 'android' ? (
                  // Android: Use a darker semi-transparent overlay to better hide content behind
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.88)', marginTop: -2 }]} pointerEvents="none" />
                ) : null}
                {/* iOS: no background here; header container expands when sticky so its blur covers this area */}
                <View style={styles.genreContainer}>
                  <GenreList
                    genres={genres}
                    selectedGenre={selectedGenre}
                    onGenrePress={handleGenrePress}
                    listRef={fixedGenreScrollViewRef}
                  />
                </View>
              </Animated.View>
            )}

            <Animated.FlatList
              ref={mainScrollViewRef}
              data={homeSections}
              keyExtractor={(item, index) => item.type === 'category' ? `category-${item.category?.id ?? item.category?.title ?? index}-${index}` : `${item.type}-${index}`}
              style={styles.mainScrollView}
              onTouchStart={(e) => updateTouchX(e.nativeEvent.pageX)}
              onTouchMove={(e) => updateTouchX(e.nativeEvent.pageX)}
              contentContainerStyle={{ 
                paddingTop: Platform.OS === "android" ? insets.top + 70 : (isIpad ? Math.max(insets.top + 20, 70) : insets.top + 20),
                paddingBottom: 60 + (insets.bottom || 0) + 10
              }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              // Android: clipping + small window caused whole swimlanes to blank then repaint when scrolling
              // (worse with full category/asset lists). iOS keeps default clipping.
              removeClippedSubviews={Platform.OS !== 'android'}
              windowSize={Platform.OS === 'android' ? 7 : 5}
              maxToRenderPerBatch={Platform.OS === 'android' ? 4 : 3}
              initialNumToRender={Platform.OS === 'android' ? 4 : 2}
              scrollEnabled={!expandedItem}
              onLayout={(e) => {
                const height = e.nativeEvent?.layout?.height;
                if (typeof height === 'number' && height > 0) {
                  updateViewport(0, height);
                }
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#000000"
                  colors={['#000000']}
                />
              }
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                {
                  useNativeDriver: true,
                  listener: handleVerticalScroll
                }
              )}
              renderItem={({ item }) => {
                switch (item.type) {

                  case 'starme':
                    // StarME entry moved to the centered bottom-tab button.
                    return null;

                  case 'featured':
                    return (
                      <View
                        onLayout={registerSectionLayout(0, 'Featured')}
                        collapsable={false}
                      >
                        <FeaturedCarousel
                          data={memoizedCarouselDataForRender}
                          onItemPress={handleCarouselItemPress}
                          onUnlockPress={handleUnlockPress}
                          isScreenFocused={isScreenFocused}
                          isCarouselInView={carouselInView}
                          hasExpandedOverlay={!!expandedItem}
                          onHeroBannerView={(banner, index) => {
                            const bannerId =
                              banner?.id ||
                              banner?.path?.toString() ||
                              `banner_${index + 1}`;
                            heroImpressionTimesRef.current[bannerId] = Date.now();
                            callHeroBannerViewEvents(banner, index, 'auto');
                          }}
                          onHeroBannerLeave={(banner, index, viewDurationMs) => {
                            callHeroBannerLeaveEvents(
                              banner,
                              index,
                              viewDurationMs
                            );
                          }}
                          onHeroBannerClick={(banner, index) => {
                            callArtworkClickEvents(
                              banner,
                              null,
                              index,
                              'Featured Carousel'
                            );
                            callHeroBannerClickEvents(banner, index, {
                              hero_card_swiped: 'manual',
                              cta_clicked: 'banner_itself',
                              action_after_click: 'navigate_to_detail',
                            });
                          }}
                          onTrailerWatched={(banner, metrics) => {
                            const action = metrics?.action ?? 'trailer_completed';
                            callTrailerWatchedEvents(banner, 'Featured Carousel', metrics, action);
                          }}
                        />
                      </View>
                    );

                  case 'genres':
                    if (genres.length === 0) return null;
                    return (
                      <Animated.View
                        style={[
                          styles.genreContainer,
                          { opacity: showInlineGenres ? 1 : 0 }
                        ]}
                      >
                        <GenreList
                          genres={genres}
                          selectedGenre={selectedGenre}
                          onGenrePress={handleGenrePress}
                          listRef={inlineGenreScrollViewRef}
                        />
                      </Animated.View>
                    );

                  case 'category':
                    return (
                      <View
                        onLayout={registerSectionLayout(1 + item.index, item.category?.label || 'Category')}
                        collapsable={false}
                      >
                        <HomeSingleCategory
                          category={item.category}
                          index={item.index}
                          handleVideoPress={handleVideoPress}
                          handleLongPress={handleLongPress}
                          handleUnlockPress={handleUnlockPress}
                          callArtworkClickEvents={callArtworkClickEvents}
                          callSliderScrollEvents={callSliderScrollEvents}
                          isScreenFocused={isScreenFocused}
                          styles={styles}
                        />
                      </View>
                    );

                  case 'bottom':
                    return <View style={{ height: 30 }} />;

                  default:
                    return null;
                }
              }}
            />

          </View>
          )}

          {/* Skeleton overlay on top when loading – content is already mounted behind */}
          {showSkeleton && (
            <View style={styles.skeletonOverlay} pointerEvents="auto">
              <HomeSkeleton />
            </View>
          )}
          {/* Exit Confirmation Modal */}
          <ExitConfirmModal
            visible={exitModalVisible}
            onCancel={() => setExitModalVisible(false)}
            onExit={() => {
              setExitModalVisible(false);
              BackHandler.exitApp();
            }}
          />

          {/* Subscription Offer Modal */}
          <SubscriptionOfferModal
            visible={subscriptionOfferVisible}
            episode={lockedEpisode}
            onClose={() => {
              setSubscriptionOfferVisible(false);
              setLockedEpisode(null);
            }}
            onSubscribe={handleSubscribe}
            onShowAuthGate={handleShowAuthGate}
          />
          <Toast
            visible={toastVisible}
            message={toastMessage}
            type={toastType}
            onHide={() => setToastVisible(false)}
          />

          {/* Expanded Item Overlay — only mount with an item so hooks/refs stay consistent */}
          {expandedItem ? (
          <ExpandedItemOverlay
            visible={!!expandedItem}
            item={expandedItem.item}
            layout={expandedItem.layout}
            onClose={closeExpandedItem}
            onWatchSeries={(item, metrics) => {
              closeExpandedItem(metrics);
              handleVideoPress(item);
            }}
            onAddToWatchList={(item, result) => {
              if (result != null) {
                closeExpandedItem(result.playbackMetrics ?? null);
                setToastMessage(result.added ? 'Added to watchlist' : 'Removed from watchlist');
                setToastType('success');
                setToastVisible(true);
              } else {
                handleAddToWatchList(item);
                closeExpandedItem();
              }
            }}
            onTrailerFirstComplete={onLongPressTrailerFirstComplete}
          />
          ) : null}

        </SafeAreaView>
      </ScrollViewRefProvider>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  statusBarCarouselStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  containerMain: {
    flex: 1,
  },
  containerAll: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 600,
    zIndex: -1,
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000, // Higher zIndex to stay above sticky genres
    backgroundColor: 'transparent',
    overflow: 'hidden', // Required for BlurView
  },
  mainScrollView: {
    flex: 1,
    position: `absolute`,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  feedSection: {
    marginBottom: 10,
  },
  /**
   * Android only, first page-category rail (index 0): sits directly under inline genre submenu.
   * Extra padding separates that submenu from this rail’s header (top) and gives room before rail 2’s title (bottom).
   * Other rails unchanged.
   */
  feedFirstRailAndroidOnly: {
    paddingTop: 8,
    paddingBottom: 35,
  },
  sectionTitle: {
    fontFamily: 'Product Sans',
    fontSize: 21,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 15,
    marginTop: 10,
    paddingHorizontal: 20,
  },
  forYouButton: {
    marginLeft: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerContainer: {
    paddingRight: 20,
    paddingLeft: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogoTouchable: {
    padding: 15,
    marginLeft: 5,
  },
  trialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: Platform.OS === 'ios' ? 18 : 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 7,
    borderWidth: 1,
    borderColor: '#FFFFFF17',
    gap: 10,
    minHeight: Platform.OS === 'ios' ? 40 : undefined,
  },
  trialButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flex: 1,
    paddingVertical: 0,
  },
  skeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'flex-start',
    paddingVertical: 0,
  },
  fixedGenreContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingBottom: 5,
    backgroundColor: 'transparent',
    overflow: 'hidden', // Added for BlurView
  },
  genreContainer: {
    marginTop: 10,
    marginBottom: 8,
  },
  genreScrollView: {
    flexGrow: 0,
  },
  genreButton: {
    height: 38,
    paddingHorizontal: 16,
    marginRight: 10, // gap: 10px between buttons
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // #FFFFFF0D
    borderColor: 'rgba(255, 255, 255, 0.1)', // #FFFFFF1A
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  genreButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: Platform.OS === 'android' ? false : undefined, // Android: removes extra padding for better centering
  },
});

export default HomeScreen;
