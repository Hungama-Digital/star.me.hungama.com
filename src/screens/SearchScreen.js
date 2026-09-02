import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AppStatusBar from '../components/AppStatusBar';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,

  TouchableOpacity,
  Platform,
  Dimensions,
  BackHandler,
} from 'react-native';
import LazyImage from '../components/LazyImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieLoader from '../components/LottieLoader';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SearchResultCard from '../components/SearchResultCard';
import RecentSearchIcon from '../components/RecentSearchIcon';
import Slider from '../components/Slider';
import API, { API_CONFIG } from '../services/api';
import { useSubscription } from '../context/SubscriptionContext';
import { debounce } from 'lodash';
import { SearchIcon } from '../components/Icons';
import MotionPreviewManager from '../services/MotionPreviewManager';

const isIpad = Platform.OS === 'ios' && Platform.isPad;
const { width: screenWidth } = Dimensions.get('window');
// Genre video width: iPad shows more items (smaller width per item), similar to Slider.js logic
// Slider uses factor * 2.2 for iPad, so we scale down width accordingly
// 2.7 * 1.5 this values are picked from VideoThumbnail to match the default width of VideoThumbnail
const GENRE_VIDEO_WIDTH = isIpad ? (screenWidth - 60) / (2.7 * 1.5) : screenWidth * 0.35; // iPad: ~16% (more items), Phone: ~35%
// Search grid: iPad shows 4 columns (like FeedGrid), Phone shows 2 columns
// Calculate width based on column count: container has paddingHorizontal: 16, so inner width is screenWidth - 32
// Gap between items: 16px, so: columns * itemWidth + (columns - 1) * 16px gap = screenWidth - 32
// Therefore: itemWidth = (screenWidth - 32 - (columns - 1) * 16) / columns
const SEARCH_GRID_COLUMNS = isIpad ? 4 : 2;
const SEARCH_GRID_ITEM_WIDTH = (screenWidth - 32 - (SEARCH_GRID_COLUMNS - 1) * 16) / SEARCH_GRID_COLUMNS;
const PLACEHOLDER_IMAGE_URL = 'https://images1.hungama.com/tr:n-a_23_m/c/1/fd0/eb8/124478131/124478131_1200X1800.jpg?version=16_14';

const SearchScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { isSubscribed } = useSubscription();
  const [searchQuery, setSearchQuery] = useState('');

  // Track navigation focus so previews stop the instant we navigate away
  const isNavFocused = useIsFocused();

  // Stop all motion previews when this screen loses navigation focus
  // (e.g. user taps a card → ReelsScreen opens, or EpisodeDrawer opens)
  useFocusEffect(
    useCallback(() => {
      return () => {
        MotionPreviewManager.stopAll();
      };
    }, [])
  );

  useEffect(() => {
    const backAction = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiResults, setApiResults] = useState([]);
  const [error, setError] = useState(null);
  const [showSearchResultsView, setShowSearchResultsView] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [selectedGenreData, setSelectedGenreData] = useState(null);
  const [isLoadingGenres, setIsLoadingGenres] = useState(true);
  const [genreVideos, setGenreVideos] = useState([]);
  const [isLoadingGenreVideos, setIsLoadingGenreVideos] = useState(false);
  const [imageErrors, setImageErrors] = useState({});
  const [forYouData, setForYouData] = useState([]);
  const [isLoadingForYou, setIsLoadingForYou] = useState(false);
  const hasAutoSelectedGenre = useRef(false);
  const sectionLayoutsRef = useRef([]); // For vertical scroll analytics
  const currentSectionIndexRef = useRef(null);
  const isNavigatingToDetailsRef = useRef(false); // Guard to prevent multiple video player launches on rapid taps
  const searchInputRef = useRef(null);

  // When search field is blank, always show search launch screen (handles backspace clear, etc.)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setShowSearchResultsView(false);
    }
  }, [searchQuery]);

  // Load genres on component mount
  useEffect(() => {
    loadGenres();
    loadRecentSearches();
    loadForYouData();
  }, []);


  // Load genres from API
  const loadGenres = async () => {
    try {
      setIsLoadingGenres(true);
      const response = await API.getGenres({
        filter: {
          languageId: "2"
        }
      });

      // Extract genre data from response
      // Response structure: { success: true, data: { data: [...] } }
      let genreData = [];

      if (response && typeof response === 'object') {
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
          genreData = response.data.data;
        } else if (response.data && Array.isArray(response.data)) {
          genreData = response.data;
        } else if (Array.isArray(response)) {
          genreData = response;
        }
      }

      if (Array.isArray(genreData) && genreData.length > 0) {
        setGenres(genreData);
      }
    } catch (error) {
      console.error('Error loading genres:', error);
      setGenres([]);
    } finally {
      setIsLoadingGenres(false);
    }
  };

  // Reload recent searches and refocus search input (keyboard) when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadRecentSearches();
      // Refocus search field and open keyboard when returning to search tab (same as first launch)
      const id = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(id);
    }, [])
  );

  // Load recent searches from AsyncStorage
  const loadRecentSearches = async () => {
    try {
      const searches = await AsyncStorage.getItem('recentSearches');
      if (searches) {
        const loadedSearches = JSON.parse(searches);

        // Clean up existing searches to remove only single letters
        const cleanedSearches = loadedSearches.filter(search => {
          const trimmed = search.trim();
          if (trimmed.length < 2) return false;

          // Only filter out single letters, keep all other searches
          if (trimmed.length === 1 && /^[a-zA-Z]$/.test(trimmed)) return false;

          return true;
        });

        setRecentSearches(cleanedSearches);
        // Save the cleaned searches back to storage
        if (cleanedSearches.length !== loadedSearches.length) {
          await AsyncStorage.setItem('recentSearches', JSON.stringify(cleanedSearches));
        }
      }
    } catch (error) {
      console.error('Error loading recent searches:', error);
    }
  };

  // Save search to recent searches (read from AsyncStorage so we never lose previous searches due to stale state)
  const saveRecentSearch = async (query) => {
    if (!query.trim()) return;

    const trimmedQuery = query.trim();

    // Don't save if query is too short (less than 2 characters)
    if (trimmedQuery.length < 2) return;

    // Don't save if it's just a single letter
    if (trimmedQuery.length === 1 && /^[a-zA-Z]$/.test(trimmedQuery)) return;

    try {
      const stored = await AsyncStorage.getItem('recentSearches');
      const currentSearches = stored ? JSON.parse(stored) : [];
      const updatedSearches = [
        trimmedQuery,
        ...currentSearches.filter(search => String(search).trim().toLowerCase() !== trimmedQuery.toLowerCase())
      ].slice(0, 3); // Keep last 10 searches

      setRecentSearches(updatedSearches);
      await AsyncStorage.setItem('recentSearches', JSON.stringify(updatedSearches));
    } catch (error) {
      console.error('Error saving recent search:', error);
    }
  };

  // Remove search from recent searches
  const removeRecentSearch = async (queryToRemove) => {
    try {
      const updatedSearches = recentSearches.filter(search => search !== queryToRemove);
      setRecentSearches(updatedSearches);
      await AsyncStorage.setItem('recentSearches', JSON.stringify(updatedSearches));
    } catch (error) {
      console.error('Error removing recent search:', error);
    }
  };

  // Clear all recent searches
  const clearRecentSearches = async () => {
    try {
      setRecentSearches([]);
      await AsyncStorage.removeItem('recentSearches');
    } catch (error) {
      console.error('Error clearing recent searches:', error);
    }
  };


  // Run search API and update results (used by debounced typing and by submit).
  // NOTE: We do NOT fire search_query_submitted here — that would trigger on every debounced
  // keystroke. search_query_submitted is fired only in:
  // Case 1: when user selects a suggestion (tile/artwork) — see handleItemPress.
  // Case 2: when user presses Enter/search without selecting a tile — see handleSearchSubmit / handleRecentSearchSelect.
  const runSearchQuery = useCallback(async (query) => {
    if (!query.trim()) {
      setApiResults([]);
      setIsLoading(false);
      return 0;
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length >= 2) {
      saveRecentSearch(trimmedQuery);
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await API.search(trimmedQuery);
      const decoded = API.decodeJwtToken(data);

      let count = 0;
      if (decoded && decoded?.success && Array.isArray(decoded?.data)) {
        setApiResults(decoded?.data);
        count = decoded.data.length;
      } else {
        setApiResults([]);
      }
      return count;
    } catch (e) {
      console.error('Search error:', e);
      setApiResults([]);
      setError('Search failed. Please try again.');
      return 0;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fire search_query_submitted only when the user has "submitted" a search:
  // - Case 1: user selected a suggestion (tile/artwork) — trigger = 'suggestion_selected'
  // - Case 2: user pressed Enter/search (or selected recent search) — trigger = 'submit'
  const fireSearchQuerySubmitted = useCallback((query, resultsCount, trigger) => {
    const trimmed = (query && String(query).trim()) ? String(query).trim() : '';
    if (!trimmed) return;
    try {
      const analyticsService = require('../services/analytics').default;
      const properties = {
        query_length: trimmed.length,
        search_query: trimmed,
        search_type: 'text',
        results_count: resultsCount ?? 0,
        search_source: 'search_screen',
        page_name: 'Search Screen',
        trigger, // for debugging: 'suggestion_selected' | 'submit'
      };
      analyticsService.logSearchQuerySubmitted(trimmed, properties);
    } catch (error) {
      console.error('Error logging search_query_submitted:', error);
    }
  }, []);

  // Debounced API search: only switch to results view when this runs (user finished typing)
  const debouncedApiSearch = useCallback(
    debounce((query) => {
      if (!query.trim()) return;
      setShowSearchResultsView(true);
      runSearchQuery(query);
    }, 500),
    [runSearchQuery]
  );

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim()) {
      // When user types a search: hide genre section and run search
      setSelectedGenre(null);
      setSelectedGenreData(null);
      setGenreVideos([]);
      debouncedApiSearch(query);
    } else {
      // When user clears search: cancel any pending debounced search so it doesn't switch back to results view
      debouncedApiSearch.cancel();
      setShowSearchResultsView(false);
      setApiResults([]);
      setError(null);
      // Restore genre UI: if we had a selection before search, it was cleared above when query became non-empty.
      // So after clear we have no selectedGenre. Re-apply first genre so secondary menu data shows again.
      if (genres.length > 0 && !selectedGenre) {
        const firstGenre = genres[0];
        const genreId = firstGenre.path || firstGenre.title;
        setSelectedGenre(genreId);
        setSelectedGenreData(genres[0]);
        // Refetch genre videos for first genre so the list shows
        API.getGenreVideo({
          start: 0,
          limit: 24,
          filter: {
            genreId: genreId.toString(),
            deviceTypeId: API_CONFIG.deviceTypeId.toString(),
            languageId: '2',
          },
        })
          .then((response) => {
            let genreData = null;
            let videoData = [];
            if (response?.data && Array.isArray(response.data)) {
              genreData = response.data.find(
                (item) =>
                  (item.path && item.path.toString() === genreId.toString()) ||
                  (item.title && item.title === firstGenre.title)
              ) || response.data[0];
              if (genreData) videoData = genreData.data || [];
            }
            setSelectedGenreData(genreData);
            setGenreVideos(videoData);
          })
          .catch(() => setGenreVideos([]));
      }
    }
  };

  // Handle recent search selection — treat as Case 2 (submitted query).
  const handleRecentSearchSelect = async (query) => {
    setSearchQuery(query);
    setShowSearchResultsView(true);
    saveRecentSearch(query);
    
    // We already have results in apiResults if user paused to look at them 
    // but a brand new submission forces a runSearchQuery
    const count = await runSearchQuery(query);
    fireSearchQuerySubmitted(query, count, 'submit');
  };

  // Handle search submission (when user presses Enter or search button).
  // Case 2: User typed something and did not select a suggestion — fire search_query_submitted with the entered string.
  const handleSearchSubmit = async () => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      setShowSearchResultsView(true);
      saveRecentSearch(trimmed);
      const count = await runSearchQuery(trimmed);
      fireSearchQuerySubmitted(trimmed, count, 'submit');
    }
  };

  const handleBack = () => navigation.goBack();

  // Use only API results, no mock data
  const resultsToShow = useMemo(() => {
    return apiResults;
  }, [apiResults]);

  const handleItemPress = (item) => {
    if (isNavigatingToDetailsRef.current) {
      return;
    }
    // Case 1: User got suggestions and chose a tile/artwork — fire search_query_submitted with whatever they typed.
    fireSearchQuerySubmitted(searchQuery, apiResults.length, 'suggestion_selected');

    isNavigatingToDetailsRef.current = true;
    const resetGuard = () => {
      setTimeout(() => {
        isNavigatingToDetailsRef.current = false;
      }, 500);
    };
    try {
      const title = item.title || item.label || item.seriesTitle || 'Search Result';
      const asset = {
        ...item,
        path: item.path || item.id,
        title,
        label: item.label || item.title || item.seriesTitle || title,
        seriesTitle: item.seriesTitle || item.title || item.label || title,
        trailer_url: item.trailer_url || item.trailerUrl,
        trailerUrl: item.trailer_url || item.trailerUrl,
        preview_url: item.preview_url || item.previewUrl,
        previewUrl: item.preview_url || item.previewUrl,
        hlsUrl: item.hlsUrl,
        videoUrl: item.videoUrl,
        verticalFilePath: item.verticalFilePath || item.horizontalFilePath || item.thumbnail || item.vodOrLivePosterImageFilePath,
        horizontalFilePath: item.horizontalFilePath || item.verticalFilePath || item.thumbnail || item.vodOrLivePosterImageFilePath,
        seriesId: item.agdlmId?.toString() || item.assetGroupId?.toString() || item.path?.toString() || item.id,
        assetGroupId: item.agdlmId || item.assetGroupId,
        geners: item.content_genre,
        release_date : item.release_date,
        year_of_release : item.year_of_release,
        age_rating: item.age_rating,
        actor: item.actor,
        keywords: item.keywords,
      };
      const path = asset.path ?? asset.id;
      const seriesData = {
        title: asset.title,
        id: asset.id ?? asset.path,
        poster: asset.thumbFilePath,
          geners: asset.geners,
              release_date : asset.release_date,
              year_of_release : asset.year_of_release,
              age_rating: asset.age_rating,
              actor: asset.actor,
              keywords: asset.keywords,
      };
      const reelsParams = {
        initialIndex: 0,
        isSeries: true,
        isForYouPage: false,
        skipApiCall: false,
        playback_source: 'search',
        path,
        seriesData,
      };
      if (isSubscribed) {
        if (navigation.push) {
          navigation.push('Reels', reelsParams);
        } else {
          navigation.navigate('Reels', reelsParams);
        }
      } else {
        if (navigation.push) {
          navigation.push('TileDetails', { asset });
        } else {
          navigation.navigate('TileDetails', { asset });
        }
      }
    } catch (error) {
      console.error('Error navigating from search:', error);
      navigation.navigate('VideoPlayer', {
        video: item,
        videoId: item.id,
        title: item.title,
        source: 'search'
      });
    } finally {
      resetGuard();
    }
  };

  const handleBookmarkPress = (item, isBookmarked) => {
    // TODO: Implement bookmark functionality
    console.log('Bookmark pressed for:', item.title, 'Bookmarked:', isBookmarked);
  };

  // Handler for video press from swimlanes
  const handleVideoPress = useCallback((video) => {
    handleItemPress(video);
  }, [navigation]);

  // Handler for unlock press (placeholder for now)
  const handleUnlockPress = useCallback((episode) => {
    handleItemPress(episode);
  }, [navigation]);

  // Handler for long press (placeholder for now)
  const handleLongPress = useCallback((item, layout) => {
    // TODO: Implement long press functionality if needed
    console.log('Long press on item:', item);
  }, []);

  // Handle genre selection and fetch videos for that genre
  const handleGenrePress = async (genre, autoSelect = false) => {
    var lastGenreIndex = genres.findIndex(g => (g.path || g.title) === selectedGenre);
    var lastSelectedGenre = lastGenreIndex !== -1 ? genres[lastGenreIndex].title : "None";
    const genreId = genre.path || genre.title;
    setSelectedGenre(genreId);
    setImageErrors({}); // Clear image errors when selecting new genre

    try {
      setIsLoadingGenreVideos(true);
      const response = await API.getGenreVideo({
        start: 0,
        limit: 24,
        filter: {
          genreId: genreId.toString(),
          deviceTypeId: API_CONFIG.deviceTypeId.toString(),
          languageId: "2"
        }
      });

      // Extract genre data from response
      // Response structure: { data: [{ path: 222, title: "Love", data: [...] }] }
      let genreData = null;
      let videoData = [];

      if (response && typeof response === 'object') {
        if (response.data && Array.isArray(response.data)) {
          // Find the genre object that matches the selected genre
          genreData = response.data.find(item =>
            (item.path && item.path.toString() === genreId.toString()) ||
            (item.title && item.title === genre.title)
          ) || response.data[0]; // Fallback to first item if not found

          if (genreData) {
            // Extract videos from the genre's data property
            videoData = genreData.data || [];
          }
        }
      }

      setSelectedGenreData(genreData);
      setGenreVideos(videoData);
      try {
        const analyticsService = require('../services/analytics').default;
        const searchQueryForEvent = (searchQuery && String(searchQuery).trim()) ? String(searchQuery).trim() : 'none';
        var properties = {
          page_name: "Search Screen",
          filter_name: genre.title,
          filter_type: "genre",
          previous_filter: lastSelectedGenre,
          search_query: searchQueryForEvent,
          results_count: videoData.length || 0
        }
        analyticsService.logSearchFilterApplied(genre.title, properties);
      } catch (error) {
        // Error logged
        return;
      }
      // Only clear search query and results if not auto-selecting (user interaction)
      if (!autoSelect) {
        setSearchQuery('');
        setApiResults([]);
      }
    } catch (error) {
      console.error('Error loading genre videos:', error);
      setGenreVideos([]);
      setSelectedGenreData(null);
    } finally {
      setIsLoadingGenreVideos(false);
    }
  };

  const registerSectionLayout = (index, name) => (event) => {
    const { y, height } = event.nativeEvent.layout;
    sectionLayoutsRef.current[index] = { y, height, name };
  };

  const callSliderScrollEvents = (metrics, bucketId, category, bucket_type) => {
    try {
      const analyticsService = require('../services/analytics').default;
      const properties = {
        page_name: 'Search Screen',
        cards_scrolled: metrics.cards_scrolled,
        total_cards_in_bucket: metrics.total_cards_in_bucket,
        scroll_percentage: metrics.scroll_percentage,
        reached_end_of_bucket: metrics.reached_end_of_bucket,
        bucket_name: category?.title || category?.label || 'Unknown',
        bucket_position: bucketId,
        bucket_type: bucket_type,
      };
      analyticsService.logBucketScrolled(category?.title || 'Search Bucket', properties);
    } catch (error) {
      // Error logged
      return;
    }
  };

  const callPageScrollEvents = (from_section, to_section, section_sequence, scroll_direction) => {
    try {
      const analyticsService = require('../services/analytics').default;
      const properties = {
        page_name: 'Search Screen',
        from_section,
        to_section,
        section_sequence,
        scroll_direction,
      };
      analyticsService.logPageScrolled('Search Screen', properties);
    } catch (error) {
      // Error logged
      return;
    }
  };

  const handleVerticalScroll = (event) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent || {};
    const offsetY = contentOffset?.y ?? 0;
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
      const sectionSequence = activeIndex + 1;
      callPageScrollEvents(fromSection, toSection, sectionSequence, scrollDirection);
    }
  };

  const handleGenreHorizontalScroll = (event) => {
    if (!genreVideos || genreVideos.length === 0 || !selectedGenreData) {
      return;
    }

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offsetX = contentOffset?.x || 0;
    const totalWidth = contentSize?.width || 0;
    const visibleWidth = layoutMeasurement?.width || 0;

    const totalCardsInBucket = genreVideos.length;

    const LEFT_PADDING = 20; // from styles.genreVideoScrollView.paddingLeft
    const CARD_WIDTH = GENRE_VIDEO_WIDTH + 16; // item width + marginRight

    const rawCardsScrolled = (offsetX - LEFT_PADDING) / CARD_WIDTH;
    const cardsScrolled = Math.max(
      0,
      Math.min(totalCardsInBucket, Math.round(rawCardsScrolled)),
    );

    const maxScrollableOffset = Math.max(0, totalWidth - visibleWidth);
    const scrollPercentage =
      maxScrollableOffset > 0
        ? Math.min(
          100,
          Math.max(0, (offsetX / maxScrollableOffset) * 100),
        )
        : 0;

    const reachedEndOfBucket = offsetX >= maxScrollableOffset - 5;

    const metrics = {
      cards_scrolled: cardsScrolled,
      total_cards_in_bucket: totalCardsInBucket,
      scroll_percentage: scrollPercentage,
      reached_end_of_bucket: reachedEndOfBucket,
    };

    callSliderScrollEvents(
      metrics,
      `genre_${selectedGenreData?.path || selectedGenre}`,
      {
        title: selectedGenreData?.title || selectedGenreData?.confTitle || 'Genre',
      },
      'genre horizontal list',
    );
  };

  // Load Feeds data (formerly "For You")
  const loadForYouData = async () => {
    try {
      setIsLoadingForYou(true);
      const response = await API.getForYou({
        start: 0,
        limit: 50,
        filter: {
          deviceTypeId: API_CONFIG.deviceTypeId,
          languageId: 1
        },
        type: 'search'
      });

      // Decode the JWT response
      const decodedResponse = API.decodeJwtToken(response);

      if (decodedResponse?.success && decodedResponse?.data?.data) {
        // Feeds API now returns series (asset_group); map for Slider/tile details
        const transformedData = decodedResponse.data.data.map((item, index) => ({
          id: item.agdlmId?.toString() || item.path?.toString() || `feeds_${index}`,
          path: item.path,
          title: item.title || item.label || `Series ${item.path}`,
          verticalFilePath: item.verticalFilePath || item.horizontalFilePath || item.vodOrLivePosterImageFilePath,
          horizontalFilePath: item.horizontalFilePath || item.vodOrLivePosterImageFilePath,
          vodOrLivePosterImageFilePath: item.vodOrLivePosterImageFilePath,
          hlsUrl: item.hlsUrl,
          assetGroupId: item.agdlmId,
          agdlmId: item.agdlmId,
          assetCount: item.assetCount,
          ...item
        }));

        setForYouData(transformedData);
      } else {
        console.error('SearchScreen: Invalid Feeds API response structure:', decodedResponse);
        setForYouData([]);
      }
    } catch (error) {
      console.error('SearchScreen: Error loading Feeds data:', error);
      setForYouData([]);
    } finally {
      setIsLoadingForYou(false);
    }
  };

  // Auto-select first genre when genres are loaded (only once on initial load)
  useEffect(() => {
    if (genres.length > 0 && !selectedGenre && !isLoadingGenres && !hasAutoSelectedGenre.current) {
      const firstGenre = genres[0];
      // Auto-select first genre without clearing recent searches
      hasAutoSelectedGenre.current = true;
      handleGenrePress(firstGenre, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres.length, isLoadingGenres]);

  return (
    <SafeAreaView style={styles.container}>
      <AppStatusBar />
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <View style={styles.searchIcon}>
            <SearchIcon opacity={0.3} />
          </View>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search for shows"
            placeholderTextColor="#666666"
            value={searchQuery}
            onChangeText={handleSearch}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color="#666666" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* Results */}
      <ScrollView
        style={styles.resultsScroll}
        contentContainerStyle={[
          showSearchResultsView && resultsToShow.length > 0
          ? styles.searchResultsContainer
          : styles.resultsContainer,
          { paddingBottom: 60 + (insets.bottom || 0) + 10 + 20 }
        ]}
        onScroll={handleVerticalScroll}
        scrollEventThrottle={16}
        >
        {/* Recent Searches - Shown on main page while user is typing */}
        {!showSearchResultsView && recentSearches.length > 0 && (
          <View style={styles.recentSearchesContainer}>
            <View style={styles.recentSearchesHeader}>
              <Text style={styles.recentSearchesTitle}>Recent searches</Text>
              <TouchableOpacity onPress={clearRecentSearches} style={styles.clearAllButton}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            {recentSearches.map((search, index) => (
              <TouchableOpacity
                key={`recent-${index}`}
                style={styles.recentSearchItem}
                onPress={() => handleRecentSearchSelect(search)}
                activeOpacity={0.7}
              >
                <View style={styles.recentSearchContent}>
                  <View style={styles.recentSearchIconContainer}>
                    <RecentSearchIcon size={24} color="#FFFFFF" />
                  </View>
                  <Text style={styles.recentSearchText}>{search}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {/* Genre Buttons - Visible on main page */}
        {!showSearchResultsView && !isLoadingGenres && genres.length > 0 && (
          <View style={styles.genreContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.genreScrollContainer}
              style={styles.genreScrollView}
            >
              {genres.map((genre) => {
                const isSelected = selectedGenre === (genre.path || genre.title);
                return (
                  <TouchableOpacity
                    key={genre.path || genre.title}
                    style={[
                      styles.genreButton,
                      isSelected && styles.genreButtonSelected
                    ]}
                    onPress={() => handleGenrePress(genre)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.genreButtonText,
                        isSelected && styles.genreButtonTextSelected
                      ]}
                    >
                      {genre.title || genre.confTitle}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        {isLoadingGenreVideos && !showSearchResultsView ? (
          <View style={styles.loadingContainer}>
            <LottieLoader size="large" />
            <Text style={styles.loadingText}>Loading videos…</Text>
          </View>
        ) : genreVideos.length > 0 && selectedGenre && !showSearchResultsView ? (
          <View
            style={styles.genreContentContainer}
            onLayout={registerSectionLayout(0, 'Genre Videos')}
          >
            {/* Genre Title */}
            {selectedGenreData && (
              <Text style={styles.genreTitle}>
                {selectedGenreData.title || selectedGenreData.confTitle || 'Genre'}
              </Text>
            )}
            {/* Horizontal Video Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.genreVideoScrollContainer}
              style={styles.genreVideoScrollView}
              onScroll={handleGenreHorizontalScroll}
              scrollEventThrottle={16}
            >
              {genreVideos.map((video, index) => {
                const videoKey = `genre-video-${video.path || video.adlmId || index}`;
                const imageUri = video.verticalFilePath || video.vodOrLivePosterImageFilePath || video.horizontalFilePath;
                const hasImageError = imageErrors[videoKey];
                const displayImageUri = (imageUri && !hasImageError) ? imageUri : PLACEHOLDER_IMAGE_URL;

                return (
                  <View key={videoKey} style={styles.genreVideoItem}>
                    <TouchableOpacity
                      onPress={() => handleItemPress(video)}
                      activeOpacity={0.8}
                      style={styles.genreVideoThumbnail}
                    >
                      <LazyImage
                        source={{ uri: displayImageUri }}
                        style={styles.genreVideoImage}
                        resizeMode="cover"
                        onError={() => {
                          setImageErrors(prev => ({ ...prev, [videoKey]: true }));
                        }}
                      />
                    </TouchableOpacity>
                    {video.title ? (
                      <Text style={styles.genreVideoTitle} numberOfLines={2}>
                        {video.title}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        {/* Feeds Swimlanes - Show on main page */}
        {!showSearchResultsView && !isLoadingForYou && forYouData.length > 0 && (
          <View
            style={styles.forYouSection}
            onLayout={registerSectionLayout(1, 'For You Only')}
          >
            <Slider
              category={{
                label: 'For You Only',
                title: 'For You Only'
              }}
              videos={forYouData}
              onVideoPress={handleVideoPress}
              onUnlockPress={handleUnlockPress}
              onLongPress={handleLongPress}
              keyPrefix="for-you"
              bucketId="search_for_you"
              isScreenFocused={isNavFocused}
              onScrollMetrics={(metrics, { bucketId, category }) =>
                callSliderScrollEvents(metrics, bucketId, category, 'horizontal list')
              }
            />
          </View>
        )}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <LottieLoader size="large" />
            <Text style={styles.loadingText}>Searching…</Text>
          </View>
        ) : resultsToShow.length === 0 && showSearchResultsView ? (
          <View
            style={styles.noResultsContainer}
            onLayout={registerSectionLayout(2, 'No Results')}
          >
            <Ionicons name="search" size={48} color="#666666" />
            <Text style={styles.noResultsTitle}>No shows found</Text>
            <Text style={styles.noResultsText}>
              Try searching with a different title or keyword
            </Text>
          </View>
        ) : null}
        {/* Show search results in grid after user completed typing or submitted */}
        {showSearchResultsView && resultsToShow.length > 0 ? (
          <View
            style={styles.searchGridContainer}
            onLayout={registerSectionLayout(2, 'Search Results')}
          >
            {resultsToShow.map((item, index) => {
              const imageUri = item.verticalFilePath || item.horizontalFilePath || item.vodOrLivePosterImageFilePath || item.thumbnail;
              // iPad: 4 columns, Phone: 2 columns - check if item is last in its row
              const isLastInRow = (index + 1) % SEARCH_GRID_COLUMNS === 0;
              // Ensure unique key by always including index, even if id/path exists
              const searchItemKey = `search-${item.id || item.path || 'item'}-${index}`;
              const hasImageError = imageErrors[searchItemKey];
              const displayImageUri = (imageUri && !hasImageError) ? imageUri : PLACEHOLDER_IMAGE_URL;

              return (
                <TouchableOpacity
                  key={searchItemKey}
                  style={[
                    styles.searchGridItem,
                    !isLastInRow && styles.searchGridItemWithMargin
                  ]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.searchGridImageContainer}>
                    <LazyImage
                      source={{ uri: displayImageUri }}
                      style={styles.searchGridImage}
                      resizeMode="cover"
                      onError={() => {
                        setImageErrors(prev => ({ ...prev, [searchItemKey]: true }));
                      }}
                    />
                  </View>
                  <Text style={styles.searchGridTitle} numberOfLines={2}>
                    {item.title || item.label || 'Untitled'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  searchContainer: {
    paddingTop: Platform.OS === 'ios' ? 30 : 60,
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 8,
    backgroundColor: '#000000',
  },
  searchBar: {
    // width: 343,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 245, 245, 0.1)', // #F5F5F51A
    borderRadius: 8,
    paddingLeft: 20,
    paddingRight: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)', // #FFFFFF1A
  },
  searchIcon: {
    marginRight: 12, // gap: 12px between icon and text
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  resultsScroll: {
    flex: 1,
    backgroundColor: '#000',
  },
  resultsContainer: {
    paddingTop: 8,
  },
  searchResultsContainer: {
    padding: 0, // No padding for search grid, let the grid container handle its own padding
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#FFF',
    marginTop: 10,
    fontSize: 16,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noResultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  noResultsText: {
    fontSize: 14,
    color: '#AAAAAA',
    textAlign: 'center',
  },
  errorText: {
    color: '#FF6B6B',
    marginTop: 20,
    textAlign: 'center',
  },
  recentSearchesContainer: {
    paddingHorizontal: 16,
  },
  recentSearchesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentSearchesTitle: {
    fontFamily: Platform.select({
      ios: 'Product Sans',
      android: 'Product Sans',
      default: 'System',
    }),
    fontWeight: '700',
    fontSize: 21,
    lineHeight: 21, // 100% of font size
    letterSpacing: 0,
    color: '#FFFFFF',
    textAlignVertical: 'center',
  },
  clearAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearAllText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  recentSearchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recentSearchIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recentSearchIcon: {
    marginRight: 12,
  },
  recentSearchText: {
    fontFamily: Platform.select({
      ios: 'Product Sans',
      android: 'Product Sans',
      default: 'System',
    }),
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 15, // 100% of font size
    letterSpacing: 0,
    color: '#FFFFFF',
  },
  removeRecentButton: {
    padding: 4,
  },
  genreContainer: {
    paddingVertical: 12,
    backgroundColor: '#000000',
  },
  genreScrollView: {
    flexGrow: 0,
    paddingLeft: 16,
  },
  genreScrollContainer: {
    paddingRight: 20,
  },
  genreButton: {
    minHeight: 40,
    paddingVertical: 8,
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
  genreButtonSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF', // White border when selected
  },
  genreButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: Platform.OS === 'android' ? false : undefined, // Android: removes extra padding for better centering
  },
  genreButtonTextSelected: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: Platform.OS === 'android' ? false : undefined,
  },
  genreContentContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  genreTitle: {
    fontFamily: Platform.select({
      ios: 'Product Sans',
      android: 'Product Sans',
      default: 'System',
    }),
    fontWeight: '700',
    fontSize: 21,
    lineHeight: 21, // 100% of font size
    letterSpacing: 0,
    color: '#FFFFFF',
    marginLeft: 20,
    marginBottom: 20,
    textAlignVertical: 'center',
  },
  genreVideoScrollView: {
    paddingLeft: 20,
  },
  genreVideoScrollContainer: {
    paddingRight: 20,
  },
  genreVideoItem: {
    width: GENRE_VIDEO_WIDTH,
    marginRight: 16,
  },
  genreVideoThumbnail: {
    width: '100%',
    aspectRatio: 0.67, // Portrait aspect ratio (2:3)
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 8,
  },
  genreVideoImage: {
    width: '100%',
    height: '100%',
  },
  genreVideoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'left',
  },
  genreVideoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  searchGridItem: {
    width: SEARCH_GRID_ITEM_WIDTH,
    marginBottom: 20,
  },
  searchGridItemWithMargin: {
    marginRight: 16, // Gap between items in the same row
  },
  searchGridImageContainer: {
    width: '100%',
    aspectRatio: 0.67, // Portrait aspect ratio (2:3)
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 8,
  },
  searchGridImage: {
    width: '100%',
    height: '100%',
  },
  searchGridPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchGridTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'left',
    lineHeight: 18,
  },
  forYouSection: {
    marginBottom: 20,
  },
});

export default SearchScreen; 