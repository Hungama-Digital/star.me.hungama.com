import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  Animated as RNAnimated,
  Easing as RNEasing,
  InteractionManager,
  useWindowDimensions,
} from 'react-native';
import LazyImage from './LazyImage';
import Carousel from 'react-native-reanimated-carousel';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

import ImageColors from 'react-native-image-colors';
import { makeSafeColor } from "../utils/useBannerGradient"

// Hero banner: show artwork first, then video. Image and audio fade together (delay + ease-in-out).
const HERO_VIDEO_DELAY_MS = 1000;
const HERO_VIDEO_FADE_DURATION_MS = 600;
const HERO_IMAGE_SCALE_END = 1.03;

// Cache for palette results to avoid re-computing
const paletteCache = new Map();

async function getPalette(uri) {
  // Check cache first for instant results
  if (paletteCache.has(uri)) {
    return paletteCache.get(uri);
  }

  const result = await ImageColors.getColors(uri, {
    cache: true,
    key: uri,
    quality: 'low', // Use low quality for faster extraction
  });
  let picked =
    (result.platform === "android" && (result.dominant || result.average)) ||
    (result.platform === "ios" && (result.primary || result.background)) ||
    // web/fallback:
    // @ts-ignore
    result.dominant ||
    "#1C1C1E";

  picked = makeSafeColor(picked);
  const palette = {
    top: picked
  };

  // Cache the result
  paletteCache.set(uri, palette);
  return palette;
}

/** Pre-warm hero palette cache from carousel items (e.g. when Home sets carousel data). Uses same cache as FeaturedCarousel for instant BG when hero mounts. */
export function prewarmHeroPalettes(items, limit = 8) {
  if (!Array.isArray(items) || items.length === 0) return;
  const count = Math.min(limit, items.length);
  for (let i = 0; i < count; i++) {
    const uri = items[i]?.filePath ?? items[i]?.verticalFilePath;
    if (uri && !paletteCache.has(uri)) {
      getPalette(uri).catch(() => { });
    }
  }
}

const FeaturedCarousel = ({
  data,
  onItemPress,
  isPageCategory,
  label,
  onBgColorsChange,
  onScrollMetrics, // optional callback for scroll analytics
  bucketId,
  onHeroBannerClick,
  onHeroBannerView,
  onHeroBannerLeave,
  onTrailerWatched,
  showPreview = true,
  isScreenFocused = true, // when false, video preview is paused (e.g. user left the screen)
  isCarouselInView = true, // when false, carousel has scrolled out (e.g. genre tabs visible)
  hasExpandedOverlay = false, // when true, long-press expanded overlay is open
}) => {
  const { width, height } = useWindowDimensions();
  const isIpad = Platform.OS === 'ios' && Platform.isPad;

  const baseItemWidth = width * 0.65;
  const baseAspectRatio = isPageCategory ? (2 / 3) : (3 / 4);
  const baseItemHeight = baseItemWidth / baseAspectRatio;

  const ITEM_HEIGHT = isIpad ? height * 0.35 : baseItemHeight;
  // Preserve the intended aspect ratio rather than stretching the image when height is restricted on iPad
  const ITEM_WIDTH = isIpad ? ITEM_HEIGHT * baseAspectRatio : baseItemWidth;

  const [currentIndex, setCurrentIndex] = useState(0);
  // Shared mute state for entire carousel so muting one video mutes all
  const [carouselMuted, setCarouselMuted] = useState(false);

  const carouselRef = useRef(null);
  const progress = useSharedValue(0);
  const heroViewStartTimeRef = useRef({});

  const FOCUSED_SCALE = isPageCategory ? 1 : 1.08;
  const carouselData = data || [];
  // Only load image/video for items within this distance of current index (lazy loading to avoid OOM with many assets)
  const RENDER_WINDOW = 2;

  // Pre-cache palettes for the first N hero items as soon as carousel data is available (on launch / when data loads).
  // This makes the initial hero BG and the first few swipes instant.
  const HERO_PALETTE_PRELOAD_COUNT = 8;
  useEffect(() => {
    if (carouselData.length === 0) return;
    for (let i = 0; i < Math.min(HERO_PALETTE_PRELOAD_COUNT, carouselData.length); i++) {
      const item = carouselData[i];
      const uri = item?.filePath ?? item?.verticalFilePath;
      if (uri && !paletteCache.has(uri)) {
        getPalette(uri).catch(() => { });
      }
    }
  }, [carouselData]);

  // Pre-compute palettes for adjacent items to reduce delay when swiping
  useEffect(() => {
    if (carouselData.length === 0) return;

    const precomputeAdjacent = async () => {
      const indicesToPrecompute = [
        (currentIndex + 1) % carouselData.length,
        (currentIndex - 1 + carouselData.length) % carouselData.length,
      ];

      for (const idx of indicesToPrecompute) {
        const item = carouselData[idx];
        const uri = item?.filePath ?? item?.verticalFilePath;
        if (uri && !paletteCache.has(uri)) {
          // Pre-compute in background without blocking
          getPalette(uri).catch(() => {
            // Ignore errors during pre-computation
          });
        }
      }
    };

    precomputeAdjacent();
  }, [currentIndex, carouselData]);

  // whenever focused item changes, update background immediately (cached) or after palette load
  useLayoutEffect(() => {
    let alive = true;
    const item = carouselData[currentIndex];
    const uri = item?.filePath ?? item?.verticalFilePath;
    if (!uri) return;

    // If palette is cached, update background immediately (same frame, no delay)
    const cached = paletteCache.get(uri);
    if (cached) {
      const next = {
        top: cached.top || '#1e1e1e',
        bottom: '#000000',
      };
      onBgColorsChange?.(next);
    }

    (async () => {
      try {
        const pal = await getPalette(uri);
        if (!alive) return;
        const next = {
          top: pal.top || '#1e1e1e',
          bottom: '#000000',
        };
        onBgColorsChange?.(next);
      } catch (e) {
        // ignore errors, keep old color
      }
    })();

    return () => {
      alive = false;
    };
  }, [currentIndex, carouselData, onBgColorsChange]);

  const lastEndedIndexRef = useRef(null);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const handlePreviewEnd = (endedIndex) => {
    if (endedIndex !== currentIndexRef.current) return;
    if (lastEndedIndexRef.current === endedIndex) return;
    lastEndedIndexRef.current = endedIndex;

    if (!carouselData.length) return;
    const nextIndex = (endedIndex + 1) % carouselData.length;
    // Use next() so we move one slide forward; scrollTo({ index }) in loop mode can
    // take the long way and animate through the whole loop (e.g. second-last -> full loop -> last).
    if (carouselRef.current?.next) {
      carouselRef.current.next({ animated: true });
      setCurrentIndex(nextIndex);
    } else if (carouselRef.current?.scrollTo) {
      carouselRef.current.scrollTo({ index: nextIndex, animated: true });
      setCurrentIndex(nextIndex);
    } else {
      setCurrentIndex(nextIndex);
    }
  };

  useEffect(() => {
    lastEndedIndexRef.current = null;
  }, [currentIndex]);

  const renderItem = ({ item, index, animationValue }) => {
    const length = carouselData.length;
    const dist = length <= 1 ? 0 : Math.min(
      Math.abs(index - currentIndex),
      length - Math.abs(index - currentIndex)
    );
    const inWindow = length <= 2 * RENDER_WINDOW + 1 || dist <= RENDER_WINDOW;
    return (
      <CustomItem
        item={item}
        index={index}
        animationValue={animationValue}
        onItemPress={onItemPress}
        itemWidth={ITEM_WIDTH}
        itemHeight={ITEM_HEIGHT}
        focusedScale={FOCUSED_SCALE}
        isFocused={index === currentIndex}
        onPreviewEnd={handlePreviewEnd}
        onHeroBannerClick={onHeroBannerClick}
        onTrailerWatched={(metrics) => {
          if (typeof onTrailerWatched === 'function') {
            onTrailerWatched(item, metrics);
          }
        }}
        showPreview={showPreview}
        isScreenFocused={isScreenFocused}
        isCarouselInView={isCarouselInView}
        hasExpandedOverlay={hasExpandedOverlay}
        carouselMuted={carouselMuted}
        onCarouselMuteChange={() => setCarouselMuted((prev) => !prev)}
        inRenderWindow={inWindow}
      />
    );
  };

  if (carouselData.length === 0) return null;

  return (
    <View style={[styles.container, isPageCategory ? {} : { paddingTop: 8 }]} dataSet={{ kind: "basic-layouts", name: "parallax" }} >
      {isPageCategory && (
        <Text style={styles.sectionTitle}>
          {typeof label === 'string'
            ? label
            : typeof label === 'object' && label?.name
              ? label.name
              : 'Category'}
        </Text>
      )}

      <Carousel
        ref={carouselRef}
        width={ITEM_WIDTH}
        height={ITEM_HEIGHT}
        data={carouselData}
        renderItem={renderItem}
        loop
        autoPlay={false}
        snapEnabled
        scrollAnimationDuration={1000}
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 0.90,
          parallaxScrollingOffset: isPageCategory ? 25 : 10,
        }}
        onConfigurePanGesture={(panGesture) => {
          // Only activate carousel when the user drags horizontally; let vertical scroll pass to parent ScrollView
          panGesture.activeOffsetX([-12, 12]);
          panGesture.failOffsetY([-18, 18]);
        }}
        onSnapToItem={(index) => {
          const prevIndex = currentIndexRef.current;
          if (prevIndex !== index && typeof onHeroBannerLeave === 'function' && carouselData[prevIndex]) {
            const viewDurationMs = heroViewStartTimeRef.current[prevIndex] != null
              ? Date.now() - heroViewStartTimeRef.current[prevIndex]
              : 0;
            onHeroBannerLeave(carouselData[prevIndex], prevIndex, viewDurationMs);
          }
          if (typeof onHeroBannerView === 'function') {
            const banner = carouselData[index];
            if (banner) {
              heroViewStartTimeRef.current[index] = Date.now();
              onHeroBannerView(banner, index);
            }
          }
          setCurrentIndex(index);

          if (typeof onScrollMetrics === 'function') {
            const totalCardsInBucket = carouselData.length;

            const metrics = {
              cards_scrolled: index,
              total_cards_in_bucket: totalCardsInBucket,
              scroll_percentage:
                totalCardsInBucket > 1
                  ? Math.min(
                    100,
                    Math.max(
                      0,
                      (index / (totalCardsInBucket - 1)) * 100,
                    ),
                  )
                  : 100,
              reached_end_of_bucket:
                totalCardsInBucket > 0 && index === totalCardsInBucket - 1,
            };

            console.log('FeaturedCarousel metrics:', {
              bucketId,
              label,
              ...metrics,
            });

            onScrollMetrics(metrics, {
              bucketId,
              category: { data: carouselData, label },
            });
          }
        }}
        onProgressChange={(_, absoluteProgress) => {
          progress.value = absoluteProgress;
          // Update focused index during scroll so previous item's trailer stops immediately (no wait for snap)
          const length = carouselData.length;
          if (length > 0) {
            const newIndex = ((Math.round(absoluteProgress) % length) + length) % length;
            if (newIndex !== currentIndexRef.current) {
              currentIndexRef.current = newIndex;
              setCurrentIndex(newIndex);
            }
          }
        }}
        style={{
          width: width,
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'visible',
        }}
      />

      {!isPageCategory && carouselData.length > 0 && (
        <View style={styles.paginationContainer}>
          {carouselData.length <= 15 ? (
            carouselData.map((_, index) => (
              <PaginationDot
                key={index}
                index={index}
                progress={progress}
                length={carouselData.length}
              />
            ))
          ) : (
            <Text style={styles.paginationText}>
              {currentIndex + 1} / {carouselData.length}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};


const PaginationDot = ({ index, progress, length }) => {
  const animatedStyle = useAnimatedStyle(() => {
    // Calculate shortest distance in circular buffer
    let currentProgress = progress.value % length;
    if (currentProgress < 0) {
      currentProgress += length;
    }

    const dist = Math.min(
      Math.abs(currentProgress - index),
      Math.abs(currentProgress - index + length),
      Math.abs(currentProgress - index - length)
    );

    const opacity = interpolate(
      dist,
      [0, 1],
      [1, 0.3],
      'clamp'
    );

    const scale = interpolate(
      dist,
      [0, 1],
      [1.2, 0.8],
      'clamp'
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  }, [progress, length]);

  return <Animated.View style={[styles.paginationDot, animatedStyle]} />;
};

const CustomItem = ({ item, index, animationValue, onItemPress, itemWidth, itemHeight, focusedScale, isFocused, onPreviewEnd, onHeroBannerClick, onTrailerWatched, showPreview, isScreenFocused = true, isCarouselInView = true, hasExpandedOverlay = false, carouselMuted = false, onCarouselMuteChange, inRenderWindow = true }) => {
  const videoRef = useRef(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoDelayElapsed, setVideoDelayElapsed] = useState(false);
  const imageOpacity = useSharedValue(1);
  const imageScale = useSharedValue(1);
  const videoDelayTimerRef = useRef(null);

  const imageOpacityRN = useRef(new RNAnimated.Value(1)).current;
  const imageScaleRN = useRef(new RNAnimated.Value(1)).current;
  const volumeAnimRef = useRef(new RNAnimated.Value(0)).current;
  const volumeListenerIdRef = useRef(null);

  // Show static image first; only allow video to load after 1.25s so artwork is visible first
  useEffect(() => {
    if (!isFocused) {
      if (videoDelayTimerRef.current) {
        clearTimeout(videoDelayTimerRef.current);
        videoDelayTimerRef.current = null;
      }
      setVideoDelayElapsed(false);
      imageOpacity.value = 1;
      imageScale.value = 1;
      imageOpacityRN.setValue(1);
      imageScaleRN.setValue(1);
      return;
    }
    videoDelayTimerRef.current = setTimeout(() => {
      videoDelayTimerRef.current = null;
      setVideoDelayElapsed(true);
    }, HERO_VIDEO_DELAY_MS);
    return () => {
      if (videoDelayTimerRef.current) {
        clearTimeout(videoDelayTimerRef.current);
        videoDelayTimerRef.current = null;
      }
    };
  }, [isFocused]);

  const imageSource = useMemo(() => {
    if (item.isLocal && item.backgroundImage) return item.backgroundImage;
    const uri = item.filePath ?? item.verticalFilePath;
    return uri && typeof uri === 'string' ? { uri } : null;
  }, [item]);

  const previewUrl = useMemo(() => {
    return (
      item.trailer_url ||
      item.trailerUrl ||
      item.preview_url ||
      item.previewUrl ||
      null
    );
  }, [item]);
  const hasPreview = !!(previewUrl && typeof previewUrl === 'string' && previewUrl.startsWith('http'));
  const shouldShowPreview = showPreview && isFocused && hasPreview && isScreenFocused && isCarouselInView && !hasExpandedOverlay;
  // Only load/play video after 1.25s delay so static image is visible first
  const shouldShowVideo = shouldShowPreview && videoDelayElapsed;

  // Stop trailer immediately when item loses focus (runs before paint so no overlap with next item)
  useLayoutEffect(() => {
    if (!shouldShowVideo && videoRef.current) {
      videoRef.current.pauseAsync?.();
      videoRef.current.setPositionAsync?.(0);
      videoRef.current.setVolumeAsync?.(0);
    }
  }, [shouldShowVideo]);

  // Auto-scroll when no preview is available: after HERO_VIDEO_DELAY_MS, trigger next item
  const noPreviewAutoScrollTimerRef = useRef(null);
  useEffect(() => {
    if (!isFocused || hasPreview || !isScreenFocused || !isCarouselInView || hasExpandedOverlay) {
      if (noPreviewAutoScrollTimerRef.current) {
        clearTimeout(noPreviewAutoScrollTimerRef.current);
        noPreviewAutoScrollTimerRef.current = null;
      }
      return;
    }
    // No preview available: auto-scroll after the same delay as video fade-in
    noPreviewAutoScrollTimerRef.current = setTimeout(() => {
      noPreviewAutoScrollTimerRef.current = null;
      onPreviewEnd?.(index);
    }, 5000);
    return () => {
      if (noPreviewAutoScrollTimerRef.current) {
        clearTimeout(noPreviewAutoScrollTimerRef.current);
        noPreviewAutoScrollTimerRef.current = null;
      }
    };
  }, [isFocused, hasPreview, isScreenFocused, isCarouselInView, hasExpandedOverlay, index, onPreviewEnd]);

  // Reset videoReady when not showing video or URL changed.
  useEffect(() => {
    if (!shouldShowVideo) {
      setVideoReady(false);
      imageOpacity.value = 1;
      imageScale.value = 1;
      imageOpacityRN.setValue(1);
      imageScaleRN.setValue(1);
      volumeAnimRef.setValue(0);
      if (volumeListenerIdRef.current != null) {
        volumeAnimRef.removeListener(volumeListenerIdRef.current);
        volumeListenerIdRef.current = null;
      }
      videoRef.current?.setVolumeAsync?.(0);
    }
  }, [shouldShowVideo, previewUrl]);

  const heroFadeEasing = { easing: RNEasing.inOut(RNEasing.ease) };

  // Video and audio fade together: delay 1000ms, then 600ms ease-in-out. Skip volume fade when carousel is muted.
  useEffect(() => {
    if (videoReady && shouldShowVideo) {
      if (Platform.OS === 'android') {
        RNAnimated.parallel([
          RNAnimated.timing(imageOpacityRN, {
            toValue: 0,
            duration: HERO_VIDEO_FADE_DURATION_MS,
            useNativeDriver: true,
            ...heroFadeEasing,
          }),
          RNAnimated.timing(imageScaleRN, {
            toValue: HERO_IMAGE_SCALE_END,
            duration: HERO_VIDEO_FADE_DURATION_MS,
            useNativeDriver: true,
            ...heroFadeEasing,
          }),
        ]).start();
      } else {
        const opts = {
          duration: HERO_VIDEO_FADE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
        };
        imageOpacity.value = withTiming(0, opts);
        imageScale.value = withTiming(HERO_IMAGE_SCALE_END, opts);
      }

      // Audio fade in over same duration only when carousel is not muted
      volumeAnimRef.setValue(0);
      if (!carouselMuted) {
        if (volumeListenerIdRef.current != null) {
          volumeAnimRef.removeListener(volumeListenerIdRef.current);
        }
        volumeListenerIdRef.current = volumeAnimRef.addListener(({ value }) => {
          videoRef.current?.setVolumeAsync?.(value);
        });
        const volumeAnim = RNAnimated.timing(volumeAnimRef, {
          toValue: 1,
          duration: HERO_VIDEO_FADE_DURATION_MS,
          useNativeDriver: false,
          ...heroFadeEasing,
        });
        volumeAnim.start(({ finished }) => {
          if (finished && volumeListenerIdRef.current != null) {
            volumeAnimRef.removeListener(volumeListenerIdRef.current);
            volumeListenerIdRef.current = null;
          }
        });
      }
    } else {
      imageOpacity.value = 1;
      imageScale.value = 1;
    }
  }, [videoReady, shouldShowVideo, carouselMuted]);

  // Play/pause and seek only when visibility or source changes (do NOT run when only carouselMuted changes).
  useEffect(() => {
    if (!videoRef.current) return;
    if (shouldShowVideo) {
      videoRef.current.setPositionAsync?.(0);
      videoRef.current.setVolumeAsync?.(carouselMuted ? 0 : 1);
      videoRef.current.playAsync?.();
    } else {
      videoRef.current.pauseAsync?.();
      videoRef.current.setPositionAsync?.(0);
      videoRef.current.setVolumeAsync?.(0);
    }
  }, [shouldShowVideo, previewUrl]);

  // When mute state changes, only update volume — do not seek or restart playback.
  useEffect(() => {
    if (!videoRef.current || !shouldShowVideo) return;
    videoRef.current.setVolumeAsync?.(carouselMuted ? 0 : 1);
  }, [carouselMuted, shouldShowVideo]);

  const trailerDurationRef = useRef(0);
  const watchedDurationRef = useRef(0);
  const hasLoggedWatchRef = useRef(false);

  const handlePlaybackStatusUpdate = (status) => {
    if (status?.isLoaded) {
      setVideoReady(true);
      if (status.durationMillis) trailerDurationRef.current = status.durationMillis;
      if (status.positionMillis > 0 && !status.didJustFinish) {
        watchedDurationRef.current = status.positionMillis;
      }
    }

    if (!shouldShowVideo || !status?.isLoaded) return;
    if (status?.didJustFinish) {
      if (!hasLoggedWatchRef.current && typeof onTrailerWatched === 'function') {
        hasLoggedWatchRef.current = true;
        const duration = status.durationMillis || trailerDurationRef.current;
        onTrailerWatched({ trailerDuration: duration, watchedDuration: duration, action: 'trailer_completed' });
      }
      onPreviewEnd?.(index);
    }
  };

  useEffect(() => {
    if (shouldShowVideo) {
      hasLoggedWatchRef.current = false;
    } else {
      if (watchedDurationRef.current > 0 && trailerDurationRef.current > 0 && !hasLoggedWatchRef.current && typeof onTrailerWatched === 'function') {
        hasLoggedWatchRef.current = true;
        onTrailerWatched({
          trailerDuration: trailerDurationRef.current,
          watchedDuration: watchedDurationRef.current,
          action: 'carousel_swiped',
        });
      }
      watchedDurationRef.current = 0;
      trailerDurationRef.current = 0;
    }
  }, [shouldShowVideo, onTrailerWatched]);

  const imageFadeStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
    transform: [{ scale: imageScale.value }],
  }), []);

  const containerStyle = useAnimatedStyle(() => {
    // Z-index to ensure active item is on top
    const zIndex = interpolate(
      animationValue.value,
      [-1, 0, 1],
      [0, 10, 0]
    );
    const scale = interpolate(
      animationValue.value,
      [-1, 0, 1],
      [1, focusedScale, 1]
    );

    return {
      zIndex,
      transform: [{ scale }],
    };
  }, [animationValue, focusedScale]);

  const overlayStyle = useAnimatedStyle(() => {
    // Opacity of the black overlay
    // 0 at center (active), 0.6 at sides (shadowed)
    const opacity = interpolate(
      animationValue.value,
      [-1, 0, 1],
      [0.2, 0, 0.2]
    );

    return {
      opacity,
    };
  }, [animationValue]);

  return (
    <Animated.View style={[styles.itemContainer, containerStyle]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          if (onHeroBannerClick) {
            onHeroBannerClick(item, index);
          }
          if (onItemPress) {
            console.log('INFO ---> item in FeaturedCarousel;', item);
            onItemPress(item, index);
          }
        }}
        style={[styles.touchableArea, { width: itemWidth }]}
      >
        {/* Wrapper for glass-like border glow effect */}
        <View style={[styles.glassBorderWrapper, { width: itemWidth, height: itemHeight }]}>
          <View style={[styles.carouselCard, { height: itemHeight }]}>
            {inRenderWindow ? (
              <>
            {/* Video layer (bottom): full opacity, no animation – reliable on device */}
            {hasPreview && shouldShowVideo && (
              <View style={[StyleSheet.absoluteFill, styles.cardImage]}>
                <Video
                  ref={videoRef}
                  source={{ uri: previewUrl }}
                  style={[StyleSheet.absoluteFill, styles.cardImage]}
                  resizeMode="cover"
                  shouldPlay={shouldShowVideo}
                  isLooping
                  isMuted={carouselMuted}
                  usePoster={false}
                  onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                />
              </View>
            )}
            {/* Image layer (top): fades out + zooms out over 1s to reveal video – smooth on device */}
            {imageSource ? (
              Platform.OS === 'android' ? (
                <RNAnimated.View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.cardImage,
                    { opacity: imageOpacityRN, transform: [{ scale: imageScaleRN }] },
                  ]}
                  pointerEvents={videoReady && shouldShowVideo ? 'none' : 'auto'}
                >
                  <LazyImage
                    source={imageSource}
                    style={[styles.cardImage, styles.cardImageBg]}
                    resizeMode="cover"
                  />
                </RNAnimated.View>
              ) : (
                <Animated.View
                  style={[StyleSheet.absoluteFill, styles.cardImage, imageFadeStyle]}
                  pointerEvents={videoReady && shouldShowVideo ? 'none' : 'auto'}
                >
                  <LazyImage
                    source={imageSource}
                    style={[styles.cardImage, styles.cardImageBg]}
                    resizeMode="cover"
                  />
                </Animated.View>
              )
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]} />
            )}
            {shouldShowVideo && videoReady && (
              <>
                <TouchableOpacity
                  style={styles.muteIconContainer}
                  onPress={onCarouselMuteChange}
                  activeOpacity={0.8}
                >
                  <View style={styles.muteIconCircle}>
                    <Ionicons
                      name={carouselMuted ? 'volume-mute' : 'volume-high'}
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>
                </TouchableOpacity>
              </>
            )}
            {/* Black Overlay for Shadow Effect */}
            <Animated.View style={[styles.shadowOverlay, overlayStyle]} />
              </>
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.cardImage, styles.cardImagePlaceholder]} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {},
  sectionTitle: {
    fontFamily: 'Product Sans',
    fontSize: 21,
    fontWeight: 700,
    color: '#FFFFFF',
    marginLeft: 20,
    marginTop: 10,
  },
  itemContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselCard: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
    elevation: 8,
    // Glass-like border effect - subtle translucent edge that follows rounded corners
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1.5,
  },
  shadowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 10,
  },
  touchableArea: {
  },
  glassBorderWrapper: {
    borderRadius: 16,
    // Outer glow for glass-like border effect - must have overflow visible to show glow
    overflow: 'visible',
    shadowColor: 'rgba(255, 255, 255, 0.1)',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageBg: {
    backgroundColor: '#1e1e1e',
  },
  cardImagePlaceholder: {
    backgroundColor: '#1e1e1e',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  paginationText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  paginationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 3,
  },
  muteIconContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    zIndex: 20,
  },
  muteIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FeaturedCarousel;