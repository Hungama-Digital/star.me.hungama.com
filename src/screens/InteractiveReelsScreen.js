import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Platform, PanResponder, BackHandler, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import AppStatusBar from '../components/AppStatusBar';
import Toast from '../components/Toast';
import SubtitlesBottomSheet from '../components/SubtitlesBottomSheet';
import ReelItem from '../components/ReelItem';
import LottieLoader from '../components/LottieLoader';
import BranchLoadingOverlay from '../components/BranchLoadingOverlay';
import { safeGoBack } from '../utils/navigationUtils';
import { SUBTITLE_OFF } from '../utils/subtitleUtils';
import { useAutoplay } from '../context/AutoplayContext';
import { useInteractiveEnabled, useInteractiveShow } from '../context/InteractiveShowContext';
import useInteractiveGraph from '../hooks/useInteractiveGraph';
import { getEpisodesForShow, getSeriesData } from '../data/interactiveShowsData';
import { subscribeEpisodeSelection } from '../utils/episodeSelectionBus';

const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');

const VIEWABILITY_THRESHOLD = 80;
const SCRUB_COOLDOWN_MS = 450;

const InteractiveReelsScreen = ({ navigation, route }) => {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const isInteractiveEnabled = useInteractiveEnabled();
  const { resetShow, currentBranchId } = useInteractiveShow();
  const { autoplayEnabled } = useAutoplay();

  // Route params
  const { showId, startEpisodeIndex = 0 } = route?.params || {};

  // Static data — no API
  const allEpisodesPool = useMemo(() => getEpisodesForShow(showId), [showId]);
  const seriesData = useMemo(() => getSeriesData(showId), [showId]);
  const { graph: interactiveGraph } = useInteractiveGraph(
    isInteractiveEnabled && showId ? String(showId) : null
  );

  // Visible episodes: always 1 intro + 12 story episodes (or placeholders before choice)
  const STORY_EPISODE_COUNT = 12;
  const visibleEpisodes = useMemo(() => {
    const intro = allEpisodesPool[0];
    if (!intro) return [];
    if (!currentBranchId) {
      const placeholders = Array.from({ length: STORY_EPISODE_COUNT }, (_, i) => ({
        id: `placeholder_${i + 2}`,
        episodeNumber: i + 2,
        isPlaceholder: true,
        title: `Episode ${i + 2}`,
      }));
      return [intro, ...placeholders];
    }
    const branches = interactiveGraph?.choice_points?.[0]?.branches ?? [];
    const branchIdx = branches.findIndex(b => b.id === currentBranchId);
    if (branchIdx < 0) return [intro];
    const startIdx = 1 + branchIdx * STORY_EPISODE_COUNT;
    return [intro, ...allEpisodesPool.slice(startIdx, startIdx + STORY_EPISODE_COUNT).map((ep, i) => ({
      ...ep,
      episodeNumber: i + 2,
    }))];
  }, [allEpisodesPool, currentBranchId, interactiveGraph]);

  // ─── State ────────────────────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(startEpisodeIndex, Math.max(0, visibleEpisodes.length - 1)))
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoResizeMode, setVideoResizeMode] = useState('cover');
  const [zoomToast, setZoomToast] = useState(null);
  const [showUI, setShowUI] = useState(true);
  const [showMetadataPopup, setShowMetadataPopup] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [subtitleSheetOpen, setSubtitleSheetOpen] = useState(false);
  const [currentSubtitleLang, setCurrentSubtitleLang] = useState(SUBTITLE_OFF);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('info');
  const [pendingBranch, setPendingBranch] = useState(null);

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const isMountedRef = useRef(true);
  const flatListRef = useRef(null);
  const videoRefs = useRef(new Map());
  const currentIndexRef = useRef(currentIndex);
  const videoDataRef = useRef(visibleEpisodes);
  const isChangingVideoRef = useRef(false);
  const autoNextHandledForIndexRef = useRef(null);
  const currentNativePlayingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const showUIRef = useRef(showUI);
  const showMetadataPopupRef = useRef(showMetadataPopup);
  const hideUITimeoutRef = useRef(null);
  const viewableItemsChangedHandlerRef = useRef(null);

  // Scrub bar refs
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scrubBarHeightAnim = useRef(new Animated.Value(3)).current;
  const scrubberTrackRef = useRef(null);
  const scrubberLayoutRef = useRef({ x: 0, width: 0 });
  const scrubInitialPageXRef = useRef(0);
  const scrubGestureLayoutRef = useRef(null);
  const seekToPageXRef = useRef(() => {});
  const isSeekingRef = useRef(false);
  const lastScrubReleaseTimeRef = useRef(0);
  const durationRef = useRef(0);
  const currentTimeSecondsRef = useRef(0);
  const currentTimeRef = useRef(0);

  // Metadata animation
  const metadataAnimValue = useRef(new Animated.Value(1)).current;

  // Pinch zoom refs
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const scaleRef = useRef(1);
  const pinchBaseScaleRef = useRef(1);
  const pinchInitialDistanceRef = useRef(null);

  const showUIWithTimeoutRef = useRef(null);

  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);
  useEffect(() => { return () => { resetShow(); }; }, [resetShow]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { videoDataRef.current = visibleEpisodes; }, [visibleEpisodes]);

  // True when the episode list still has placeholder slots (no branch chosen yet)
  const hasPlaceholders = useMemo(
    () => visibleEpisodes.some(ep => ep?.isPlaceholder),
    [visibleEpisodes],
  );
  const hasPlaceholdersRef = useRef(hasPlaceholders);
  useEffect(() => { hasPlaceholdersRef.current = hasPlaceholders; }, [hasPlaceholders]);

  // Intercept vertical swipes while pre-choice: show choice modal, don't scroll
  const choiceTrapResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        hasPlaceholdersRef.current && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        videoRefs.current.get(currentIndexRef.current)?.showChoiceModal?.();
      },
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    }),
  ).current;
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { showUIRef.current = showUI; }, [showUI]);
  useEffect(() => { showMetadataPopupRef.current = showMetadataPopup; }, [showMetadataPopup]);
  useEffect(() => { setSubtitleSheetOpen(false); }, [currentIndex]);
  useEffect(() => {
    if (!zoomToast) return;
    const t = setTimeout(() => setZoomToast(null), 1200);
    return () => clearTimeout(t);
  }, [zoomToast]);

  // Handle episode taps from BranchEpisodeSheet
  useEffect(() => {
    const unsubscribe = subscribeEpisodeSelection(({ origin, initialIndex = 0 }) => {
      if (origin !== 'Reels') return;
      const safeIdx = Math.max(0, Math.min(videoDataRef.current.length - 1, initialIndex));
      setTimeout(() => {
        setCurrentIndex(safeIdx);
        setIsPlaying(true);
        progressAnim.setValue(0);
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: safeIdx, animated: false });
        }, 50);
      }, 0);
    });
    return unsubscribe;
  }, [progressAnim]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const safePauseCurrentVideo = useCallback((idx = null) => {
    const i = idx ?? currentIndexRef.current;
    videoRefs.current.get(i)?.pause?.();
  }, []);

  const safePlayCurrentVideo = useCallback((idx = null) => {
    const i = idx ?? currentIndexRef.current;
    videoRefs.current.get(i)?.play?.();
  }, []);

  // ─── UI Visibility ────────────────────────────────────────────────────────
  const showUIWithTimeout = useCallback(() => {
    if (!isMountedRef.current) return;
    metadataAnimValue.stopAnimation(() => metadataAnimValue.setValue(1));
    if (!showMetadataPopupRef.current) setShowMetadataPopup(true);
    setShowUI(true);
    if (hideUITimeoutRef.current) clearTimeout(hideUITimeoutRef.current);
    hideUITimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setShowUI(false);
      Animated.timing(metadataAnimValue, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        if (isMountedRef.current) {
          setShowMetadataPopup(false);
          metadataAnimValue.setValue(1);
        }
      });
    }, 7000);
  }, [metadataAnimValue]);

  useEffect(() => { showUIWithTimeoutRef.current = showUIWithTimeout; }, [showUIWithTimeout]);

  const handleScreenTap = useCallback(() => {
    if (showUI) {
      setShowUI(false);
      setShowMetadataPopup(false);
      if (hideUITimeoutRef.current) clearTimeout(hideUITimeoutRef.current);
    } else {
      showUIWithTimeout();
    }
  }, [showUI, showUIWithTimeout]);

  const onCurrentPlayerPlayingChange = useCallback((playing) => {
    currentNativePlayingRef.current = !!playing;
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!isMountedRef.current || isChangingVideoRef.current) return;
    const shouldPlay = !currentNativePlayingRef.current;
    setIsPlaying(shouldPlay);
    showUIWithTimeout();
    if (shouldPlay) safePlayCurrentVideo();
    else safePauseCurrentVideo();
  }, [showUIWithTimeout, safePlayCurrentVideo, safePauseCurrentVideo]);

  // ─── Scrub Bar ────────────────────────────────────────────────────────────
  const measureScrubBar = useCallback(() => {
    scrubberTrackRef.current?.measureInWindow((x, y, width) => {
      if (width > 0) scrubberLayoutRef.current = { x, width };
    });
  }, []);

  const seekToPageX = useCallback((pageX, shouldSeekVideo = false, layoutOverride = null) => {
    const layout = layoutOverride?.width > 0 ? layoutOverride : scrubberLayoutRef.current;
    if (!layout.width) return;
    const dur = durationRef.current;
    if (!dur || dur <= 0) return;
    const ratio = Math.min(1, Math.max(0, (pageX - layout.x) / layout.width));
    progressAnim.setValue(ratio);
    if (shouldSeekVideo) {
      const ref = videoRefs.current.get(currentIndexRef.current);
      ref?.seek?.(Math.floor(ratio * dur * 1000));
    }
  }, [progressAnim]);

  seekToPageXRef.current = seekToPageX;

  const scrubPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => durationRef.current > 0,
    onStartShouldSetPanResponderCapture: () => durationRef.current > 0,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 5,
    onPanResponderGrant: (evt) => {
      isSeekingRef.current = true;
      setIsSeeking(true);
      scrubInitialPageXRef.current = evt.nativeEvent.pageX;
      scrubGestureLayoutRef.current = { ...scrubberLayoutRef.current };
      seekToPageXRef.current(evt.nativeEvent.pageX, false, scrubGestureLayoutRef.current);
      Animated.timing(scrubBarHeightAnim, { toValue: 11, duration: 200, useNativeDriver: false }).start();
    },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) >= Math.abs(g.dx)) return;
      seekToPageXRef.current(scrubInitialPageXRef.current + g.dx, false, scrubGestureLayoutRef.current);
    },
    onPanResponderRelease: (_, g) => {
      seekToPageXRef.current(scrubInitialPageXRef.current + g.dx, true, scrubGestureLayoutRef.current);
      isSeekingRef.current = false;
      setIsSeeking(false);
      lastScrubReleaseTimeRef.current = Date.now();
      scrubGestureLayoutRef.current = null;
      Animated.timing(scrubBarHeightAnim, { toValue: 3, duration: 200, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => {
      isSeekingRef.current = false;
      setIsSeeking(false);
      lastScrubReleaseTimeRef.current = Date.now();
      scrubGestureLayoutRef.current = null;
      Animated.timing(scrubBarHeightAnim, { toValue: 3, duration: 200, useNativeDriver: false }).start();
    },
  }), [scrubBarHeightAnim]);

  // ─── Pinch Zoom ───────────────────────────────────────────────────────────
  const getDistance = useCallback((t1, t2) =>
    Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY) || 1, []);

  const pinchPanResponder = useMemo(() => {
    const clamp = (s) => Math.min(4, Math.max(0.5, s));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          pinchInitialDistanceRef.current = getDistance(evt.nativeEvent.touches[0], evt.nativeEvent.touches[1]);
          pinchBaseScaleRef.current = scaleRef.current;
        }
      },
      onPanResponderMove: (evt) => {
        if (evt.nativeEvent.touches.length === 2 && pinchInitialDistanceRef.current != null) {
          const d = getDistance(evt.nativeEvent.touches[0], evt.nativeEvent.touches[1]);
          const s = clamp(pinchBaseScaleRef.current * (d / pinchInitialDistanceRef.current));
          scaleRef.current = s;
          scaleAnim.setValue(s);
        }
      },
      onPanResponderRelease: () => {
        if (scaleRef.current > 1.2) { setVideoResizeMode('cover'); setZoomToast('Zoomed to fill'); }
        else if (scaleRef.current < 0.8) { setVideoResizeMode('contain'); setZoomToast('Original'); }
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start(() => { scaleRef.current = 1; });
        pinchInitialDistanceRef.current = null;
      },
    });
  }, [getDistance, scaleAnim]);

  useEffect(() => {
    scaleAnim.setValue(1);
    scaleRef.current = 1;
    pinchInitialDistanceRef.current = null;
  }, [currentIndex, scaleAnim]);

  // ─── Playback Status Update ───────────────────────────────────────────────
  const handlePlaybackStatusUpdate = useCallback((status) => {
    if (!status || !isMountedRef.current) return;

    if (status.positionMillis !== undefined) {
      const secs = status.positionMillis / 1000;
      currentTimeSecondsRef.current = secs;
      const rounded = Math.floor(secs);
      if (currentTimeRef.current !== rounded) {
        currentTimeRef.current = rounded;
        setCurrentTime(rounded);
      }
    }
    if (status.durationMillis !== undefined && !isNaN(status.durationMillis) && status.durationMillis > 0) {
      const dur = Math.floor(status.durationMillis / 1000);
      if (durationRef.current !== dur) {
        setDuration(dur);
        durationRef.current = dur;
      }
    }
    if (status.isPlaying && status.positionMillis !== undefined && status.positionMillis < 1000) {
      setShowMetadataPopup(true);
      showUIWithTimeout();
    }

    const inCooldown = lastScrubReleaseTimeRef.current > 0 &&
      (Date.now() - lastScrubReleaseTimeRef.current) < SCRUB_COOLDOWN_MS;

    if (!isSeekingRef.current && !inCooldown && status.positionMillis !== undefined) {
      const dur = status.durationMillis || durationRef.current * 1000;
      if (dur > 0) progressAnim.setValue(Math.min(1, status.positionMillis / dur));
    }

    // Auto-next on finish
    const isAtEnd = status.didJustFinish ||
      (Platform.OS === 'ios' && status.durationMillis > 0 &&
        status.positionMillis >= status.durationMillis * 0.98);

    if (isAtEnd) {
      const idx = currentIndexRef.current;
      if (autoplayEnabled && autoNextHandledForIndexRef.current === idx) return;
      if (autoplayEnabled) autoNextHandledForIndexRef.current = idx;
      handleAutoplayNext();
    }
  }, [showUIWithTimeout, progressAnim, autoplayEnabled]);

  // ─── Autoplay Next ────────────────────────────────────────────────────────
  const handleAutoplayNext = useCallback(() => {
    if (!isMountedRef.current) { isChangingVideoRef.current = false; return; }
    if (!autoplayEnabled) { isChangingVideoRef.current = false; return; }

    const idx = currentIndexRef.current;
    const data = videoDataRef.current;

    if (idx < data.length - 1) {
      const next = idx + 1;
      if (data[next]?.isPlaceholder) {
        // Next episode is a placeholder — show choice modal instead of advancing
        videoRefs.current.get(idx)?.showChoiceModal?.();
        isChangingVideoRef.current = false;
        return;
      }
      setCurrentIndex(next);
      setIsPlaying(true);
      progressAnim.setValue(0);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      isChangingVideoRef.current = false;
    }
  }, [autoplayEnabled, progressAnim]);

  // ─── Viewability ──────────────────────────────────────────────────────────
  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: VIEWABILITY_THRESHOLD,
    waitForInteraction: false,
    minimumViewTime: 300,
  });

  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (!isMountedRef.current || isChangingVideoRef.current || viewableItems.length === 0) return;
    const visible = viewableItems[0];
    if (visible && visible.index !== currentIndexRef.current) {
      autoNextHandledForIndexRef.current = null;
      isChangingVideoRef.current = true;
      setCurrentIndex(visible.index);
      setIsPlaying(true);
      progressAnim.setValue(0);
      setCurrentTime(0);
      setDuration(0);
      showUIWithTimeoutRef.current?.();
      setTimeout(() => { if (isMountedRef.current) isChangingVideoRef.current = false; }, 50);
    }
  }, [progressAnim]);

  useEffect(() => { viewableItemsChangedHandlerRef.current = handleViewableItemsChanged; }, [handleViewableItemsChanged]);
  const onViewableItemsChangedStable = useCallback((info) => viewableItemsChangedHandlerRef.current?.(info), []);

  // ─── Back Handler ─────────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    const onBack = () => { safeGoBack(navigation); return true; };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [navigation]));

  // Pause on blur, resume on focus
  useFocusEffect(useCallback(() => {
    setIsPlaying(true);
    return () => setIsPlaying(false);
  }, []));

  // ─── Action Handlers (simplified — no API) ────────────────────────────────
  const handleLike = useCallback(() => {}, []);
  const handleMyListToggle = useCallback(() => {}, []);
  const handleDirectShare = useCallback(async (item) => {
    try {
      await Share.share({ message: `Watch "${item?.title || 'FastME Show'}" on FastTV` });
    } catch (_) {}
  }, []);
  const handleWatchSeries = useCallback(() => {}, []);
  const callToSubscribe = useCallback(() => {}, []);

  const handleBranchSelect = useCallback((_assetId, branch) => {
    if (branch) setPendingBranch(branch);
  }, []);

  const handleLoadingComplete = useCallback(() => {
    autoNextHandledForIndexRef.current = null;
    setCurrentIndex(1);
    setIsPlaying(true);
    progressAnim.setValue(0);
    setPendingBranch(null);
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: 1, animated: false });
    }, 150);
  }, [progressAnim]);

  // ─── Subtitle ─────────────────────────────────────────────────────────────
  const openSubtitleSheet = useCallback(() => setSubtitleSheetOpen(true), []);
  const handleSubtitleLanguagePicked = useCallback((lang) => setCurrentSubtitleLang(lang), []);

  // ─── Render Item ──────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item, index }) => {
    if (!item) return null;
    return (
      <ReelItem
        ref={(r) => { if (r) videoRefs.current.set(index, r); else videoRefs.current.delete(index); }}
        item={item}
        index={index}
        currentIndex={currentIndex}
        isPlaying={isPlaying}
        isSubscribed={true}
        videoResizeMode={videoResizeMode}
        handleScreenTap={handleScreenTap}
        handlePlayPause={handlePlayPause}
        handleLike={handleLike}
        handleMyListToggle={handleMyListToggle}
        handleDirectShare={handleDirectShare}
        navigation={navigation}
        insets={insets}
        videoDataLength={visibleEpisodes.length}
        allEpisodesData={visibleEpisodes}
        detectedIsSeries={true}
        effectiveSeriesTitle={seriesData?.title || ''}
        isTrailerMode={false}
        handleWatchSeries={handleWatchSeries}
        isGuestUser={false}
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
        likedVideos={new Set()}
        isSaved={false}
        poster={seriesData?.poster || seriesData?.verticalFilePath || ''}
        genres={seriesData?.geners || ''}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        subtitles={item.subtitle || []}
        selectedSubtitleLang={index === currentIndex ? currentSubtitleLang : SUBTITLE_OFF}
        onOpenSubtitleMenu={openSubtitleSheet}
        showSubtitleMenuButton={index === currentIndex}
        onCurrentPlayerPlayingChange={onCurrentPlayerPlayingChange}
        interactiveGraph={interactiveGraph}
        isInteractiveEnabled={isInteractiveEnabled}
        showId={showId ? String(showId) : null}
        onBranchSelect={handleBranchSelect}
      />
    );
  }, [
    currentIndex, isPlaying, videoResizeMode, handleScreenTap, handlePlayPause,
    handleLike, handleMyListToggle, handleDirectShare, navigation, insets,
    visibleEpisodes, seriesData, handleWatchSeries, callToSubscribe,
    measureScrubBar, scrubPanResponder, progressAnim, scrubBarHeightAnim, isSeeking,
    pinchPanResponder, scaleAnim, showUI, showMetadataPopup, metadataAnimValue,
    handlePlaybackStatusUpdate, currentSubtitleLang, openSubtitleSheet,
    onCurrentPlayerPlayingChange, interactiveGraph, isInteractiveEnabled, showId,
    handleBranchSelect,
  ]);

  // ─── Empty / Loading ──────────────────────────────────────────────────────
  if (allEpisodesPool.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="videocam-outline" size={64} color="#666" />
        <Text style={styles.loadingText}>No episodes available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => safeGoBack(navigation)}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <AppStatusBar />
      <View style={{ flex: 1 }} {...choiceTrapResponder.panHandlers}>
      <FlatList
        ref={flatListRef}
        key={`interactive-reels-${showId || 'default'}`}
        data={visibleEpisodes}
        scrollEnabled={!hasPlaceholders}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        keyExtractor={(item, index) => item?.id ? String(item.id) : String(index)}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChangedStable}
        viewabilityConfig={viewabilityConfigRef.current}
        initialScrollIndex={Math.max(0, Math.min(currentIndex, visibleEpisodes.length - 1))}
        getItemLayout={(_, index) => ({
          length: Platform.OS === 'ios' ? screenHeight + 1 : screenHeight,
          offset: (Platform.OS === 'ios' ? screenHeight + 1 : screenHeight) * index,
          index,
        })}
        removeClippedSubviews
        maxToRenderPerBatch={Platform.OS === 'android' ? 2 : 4}
        windowSize={Platform.OS === 'android' ? 3 : 7}
        initialNumToRender={Platform.OS === 'android' ? 2 : 3}
        updateCellsBatchingPeriod={50}
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.998}
        snapToInterval={Platform.OS === 'ios' ? screenHeight + 1 : screenHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 0, margin: 0 }}
        style={{ padding: 0, margin: 0 }}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            if (flatListRef.current && info.index < videoDataRef.current.length) {
              flatListRef.current.scrollToIndex({
                index: Math.max(0, Math.min(info.index, videoDataRef.current.length - 1)),
                animated: false,
              });
            }
          }, 500);
        }}
      />
      </View>

      {zoomToast ? (
        <View style={styles.zoomToastContainer}>
          <Text style={styles.zoomToastText}>{zoomToast}</Text>
        </View>
      ) : null}

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />

      <SubtitlesBottomSheet
        visible={subtitleSheetOpen}
        onClose={() => setSubtitleSheetOpen(false)}
        subtitleTracks={visibleEpisodes[currentIndex]?.subtitle || []}
        selectedLanguage={currentSubtitleLang}
        onSelectLanguage={handleSubtitleLanguagePicked}
      />

      <BranchLoadingOverlay
        visible={!!pendingBranch}
        branch={pendingBranch}
        durationMs={3500}
        onComplete={handleLoadingComplete}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 0, margin: 0 },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', fontSize: 18, marginTop: 16 },
  retryButton: { marginTop: 20, backgroundColor: '#FF6623', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  zoomToastContainer: {
    position: 'absolute', top: 40, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 6, zIndex: 20,
  },
  zoomToastText: { color: '#fff', fontSize: 12, fontWeight: '500' },
});

export default InteractiveReelsScreen;
