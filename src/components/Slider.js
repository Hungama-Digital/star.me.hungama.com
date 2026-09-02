/**
 * Slider — Horizontal rail component with inline motion preview support.
 *
 * Architecture:
 * - FlatList uses onViewableItemsChanged (60% visible, min 300ms) to detect card visibility
 * - Visible cards call MotionPreviewManager.requestPreview() with an 800ms delay
 * - MotionPreviewManager ensures only ONE preview is active at a time globally
 * - Each PreviewEnabled card stores start/stop callbacks in a stable ref map
 * - Cards without a previewUrl fall back to the plain VideoThumbnail (zero regression)
 * - isScreenFocused prop stops all previews when the screen blurs
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LazyImage from './LazyImage';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  FlatList,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VideoThumbnail from './VideoThumbnail';

const INTERACTIVE_ICON = require('../../assets/ic_interactive.png');
import MotionPreviewCard from './MotionPreviewCard';
import MotionPreviewManager from '../services/MotionPreviewManager';
import API, { API_CONFIG } from '../services/api';
import { subscribeToViewport, getViewport } from '../context/ViewportContext';
import FastMeChip from './FastMeChip';
import { useInteractiveEnabled } from '../context/InteractiveShowContext';

const isIpad = Platform.OS === 'ios' && Platform.isPad;
const { width: screenWidth } = Dimensions.get('window');

const getWidthFactorByBucketId = (bucketId) => {
  let factor = 2.7;
  if (bucketId === '6') factor = 2.7;
  else if (bucketId === '3') factor = 2.2;
  else if (bucketId === '4') factor = 2.23;
  else if (bucketId === 'interactive-shows') factor = 2.2;
  return isIpad ? factor * 2.2 : factor; // iPads fit roughly twice as many items
};

const getCardWidthForBucket = (bucketId, widthOverrides) => {
  const currentWidth = widthOverrides || screenWidth;
  const THUMBNAIL_WIDTH = (currentWidth - 60) / getWidthFactorByBucketId(bucketId);
  return THUMBNAIL_WIDTH + 12;
};

const formatViews = (num) => {
  if (!num) return '0';
  if (typeof num === 'string' && (num.includes('M') || num.includes('K'))) return num;
  const n = parseInt(num, 10) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
};

/** Extract preview URL from item using all known field names */
const getPreviewUrl = (item) => {
  if (!item) return null;
  const url =
    item.previewUrl ||
    item.preview_url ||
    item.asset_group_preview_url ||
    item.trailerUrl ||
    item.trailer_url ||
    null;
  return url && typeof url === 'string' && url.startsWith('http') ? url : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// PreviewSliderItem — card that supports inline motion preview
// ─────────────────────────────────────────────────────────────────────────────
const PreviewSliderItem = React.memo(({
  item,
  index,
  onVideoPress,
  onLongPress,
  rank,
  bucketId,
  isScreenFocused,
  cardId,
  previewUrl,
  isInteractiveEnabled,
  // Registry callback so Slider can notify visibility changes
  onMount,
  onUnmount,
}) => {
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const mountedRef = useRef(true);
  const touchableRef = useRef(null);

  const startPreview = useCallback(() => {
    if (mountedRef.current) setIsPreviewActive(true);
  }, []);

  const stopPreview = useCallback(() => {
    if (mountedRef.current) setIsPreviewActive(false);
  }, []);

  // Register callbacks with parent Slider so it can call them on visibility change
  useEffect(() => {
    console.log('[Slider] PreviewSliderItem mounted, registering cardId:', cardId);
    onMount?.(cardId, startPreview, stopPreview);
    return () => {
      mountedRef.current = false;
      onUnmount?.(cardId);
      MotionPreviewManager.cancelPreview(cardId);
    };
  }, [cardId, startPreview, stopPreview, onMount, onUnmount]);

  // Pause when screen loses focus
  useEffect(() => {
    if (!isScreenFocused && isPreviewActive) {
      setIsPreviewActive(false);
    }
  }, [isScreenFocused, isPreviewActive]);

  const { width: currentScreenWidth } = useWindowDimensions();

  const getWidthFactor = () => {
    let factor = 2.7;
    if (bucketId === '6') factor = 2.7;
    else if (bucketId === '3') factor = 2.2;
    else if (bucketId === '4') factor = 2.23;
    else if (bucketId === 'interactive-shows') factor = 2.2;
    return isIpad ? factor * 1.5 : factor;
  };
  const THUMBNAIL_WIDTH = (currentScreenWidth - 60) / getWidthFactor();

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    if (touchableRef.current) {
      touchableRef.current.measure((x, y, width, height, pageX, pageY) => {
        onLongPress(item, { x, y, width, height, pageX, pageY });
      });
    } else {
      onLongPress(item, null);
    }
  }, [item, onLongPress]);

  const handlePress = useCallback(() => {
    // Stop any active preview immediately on tap
    MotionPreviewManager.cancelPreview(cardId);
    setIsPreviewActive(false);
    onVideoPress?.(item, index);
  }, [item, index, onVideoPress, cardId]);

  const imageSource = useMemo(() => {
    if (!item) return null;
    const path = [
      item.verticalFilePath, item.horizontalFilePath, item.uploadHorizontalImage,
      item.uploadVerticalImage, item.thumbnail, item.imageUrl, item.image,
      item.coverImage, item.posterImage, item.thumb, item.thumbUrl,
      item.thumbnailUrl, item.cover, item.poster,
    ].find(p => p && typeof p === 'string' && p.startsWith('http'));
    return path ? { uri: path } : null;
  }, [item]);

  const containerStyle = useMemo(() => [
    styles.previewCardContainer,
    { width: THUMBNAIL_WIDTH },
    rank ? { paddingLeft: 23 } : {},
  ], [THUMBNAIL_WIDTH, rank]);

  return (
    <TouchableOpacity
      ref={touchableRef}
      style={containerStyle}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={500}
      activeOpacity={0.85}
    >
      <View style={styles.posterWrapper}>
        <View style={styles.thumbnailAspect}>
          {/* Static thumbnail */}
          {imageSource ? (
            <LazyImage
              source={imageSource}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
          )}

          {/* Badges */}
          {item?.tile_label ? (
            bucketId === 'interactive-shows' ? (
              <View style={styles.tileLabelWrapper}>
                <LinearGradient
                  colors={['#FF6A41', '#C044FD']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.tileLabelContainer}
                >
                  <Image source={INTERACTIVE_ICON} style={styles.tileLabelIcon} resizeMode="contain" />
                  <Text style={styles.tileLabelText}>{item.tile_label}</Text>
                </LinearGradient>
              </View>
            ) : (
              <View style={styles.tileLabelBlue}>
                <Text style={styles.tileLabelBlueText}>{item.tile_label}</Text>
              </View>
            )
          ) : null}
          {item?.duration ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{item.duration}</Text>
            </View>
          ) : null}

          {/* View count — only on FastME bucket */}
          {bucketId === 'interactive-shows' ? (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.viewCountGradient}
            >
              <View style={styles.viewCountRow}>
                <Ionicons name="play" size={9} color="#FFFFFF" />
                <Text style={styles.viewCountText}>
                  {item?.views ? formatViews(item.views) : '4.5M'}
                </Text>
              </View>
            </LinearGradient>
          ) : null}

          {/* Motion preview video layer — absolutely positioned over thumbnail */}
          <MotionPreviewCard
            previewUrl={previewUrl}
            cardId={cardId}
            isPreviewActive={isPreviewActive}
            isScreenFocused={isScreenFocused}
          />
        </View>

        {rank ? (
          <View style={styles.rankContainer}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.videoInfo, rank ? { marginLeft: -30 } : {}]}>
        <Text style={styles.videoTitle} numberOfLines={2}>{item?.title}</Text>
        <Text style={styles.videoCreator} numberOfLines={1}>{item?.creator}</Text>
      </View>
    </TouchableOpacity>
  );
});

PreviewSliderItem.displayName = 'PreviewSliderItem';

// ─────────────────────────────────────────────────────────────────────────────
// Viewability config — stable reference (must not be recreated on re-render)
// ─────────────────────────────────────────────────────────────────────────────
const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 100,
  minimumViewTime: 300,
};

// ─────────────────────────────────────────────────────────────────────────────
// Slider — Main export
// ─────────────────────────────────────────────────────────────────────────────
const Slider = React.memo(({
  category,
  videos,
  onVideoPress,
  onUnlockPress,
  onLongPress,
  keyPrefix = 'slider',
  bucketId,
  onScrollMetrics,
  isScreenFocused = true,
  showFastMeChip = true,
}) => {
  const isInteractiveEnabled = useInteractiveEnabled();
  const { width: currentScreenWidth } = useWindowDimensions();
  const [categoryVideos, setCategoryVideos] = useState(videos || []);

  // Registry: cardId → { start, stop } callbacks
  const previewCallbacksRef = useRef({});

  const {
    genre, path, langId, assetGroupClassification, label,
  } = category || {};

  /* ─── Fetch fallback ─── */
  const fetchCategoryListing = useCallback(async () => {
    try {
      const genreIds = Array.isArray(genre) ? genre.map((g) => g.path) : [];
      let assetGroupIds = [];
      if (Array.isArray(assetGroupClassification)) {
        assetGroupIds = assetGroupClassification.map((ag) => ag.path);
      } else if (assetGroupClassification?.path) {
        assetGroupIds = [assetGroupClassification.path];
      }
      const data = await API.getPageCategoryListing({
        filter: JSON.stringify({
          assetGroupClassification: assetGroupIds,
          deviceTypeId: API_CONFIG.deviceTypeId,
          genre: genreIds,
          langId,
          path,
        }),
        start: 0,
        limit: 10,
      });
      const decoded = API.decodeJwtToken(data);
      setCategoryVideos(decoded?.data?.[0]?.data || []);
    } catch {
      setCategoryVideos(videos || []);
    }
  }, [genre, path, langId, assetGroupClassification, videos]);

  useEffect(() => {
    if (!videos?.length) {
      fetchCategoryListing();
    } else {
      setCategoryVideos(videos);
    }
  }, [videos, fetchCategoryListing]);

  /* ─── Stop all previews when screen loses focus ─── */
  useEffect(() => {
    if (!isScreenFocused) {
      MotionPreviewManager.stopAll();
    }
  }, [isScreenFocused]);

  /* ─── Callback registry (called by PreviewSliderItem on mount/unmount) ─── */
  const handleItemMount = useCallback((cardId, startFn, stopFn) => {
    previewCallbacksRef.current[cardId] = { start: startFn, stop: stopFn };
  }, []);

  const handleItemUnmount = useCallback((cardId) => {
    delete previewCallbacksRef.current[cardId];
  }, []);

  /* ─── Viewability handler (Horizontal) ─── */
  const handleViewableItemsChangedRef = useRef(null);

  // Track horizontal visibility map
  const horizontallyVisibleRef = useRef({});

  handleViewableItemsChangedRef.current = useCallback(({ changed }) => {
    changed.forEach(({ item, index, isViewable }) => {
      const cardId = `${keyPrefix}-${item?.id || item?.path || index}`;
      horizontallyVisibleRef.current[cardId] = isViewable;
    });
    checkVisibility(); // re-eval with latest vertical state
  }, [keyPrefix]);

  /* ─── Vertical scroll viewability (ViewportContext) ─── */
  const contentYRef = useRef(-1);
  const containerHeightRef = useRef(0);

  const handleLayout = useCallback((e) => {
    e.target.measure((_x, _y, _w, h, _px, pageY) => {
      const v = getViewport();
      // Calculate absolute scroll-content Y once
      contentYRef.current = pageY + v.scrollY;
      containerHeightRef.current = h;
    });
  }, []);

  const checkVisibility = useCallback(() => {
    const v = getViewport();
    // If we don't know our Y position yet, assume visible
    const isVerticallyVisible = (() => {
      if (contentYRef.current === -1) return true;
      const viewportTop = v.scrollY + (v.stickyTopOffset || 0);
      const overlapTop = Math.max(contentYRef.current, viewportTop);
      const overlapBottom = Math.min(contentYRef.current + containerHeightRef.current, v.scrollY + v.viewportHeight);
      const overlapH = Math.max(0, overlapBottom - overlapTop);
      // At least 50% of the slider height must be visible
      return containerHeightRef.current > 0 && (overlapH / containerHeightRef.current) > 0.5;
    })();

    // Apply visibility to all registered items
    Object.keys(horizontallyVisibleRef.current).forEach((cardId) => {
      const cbs = previewCallbacksRef.current[cardId];
      if (!cbs) return;

      const isViewable = horizontallyVisibleRef.current[cardId] && isVerticallyVisible;
      if (isViewable) {
        MotionPreviewManager.requestPreview(cardId, cbs.start, cbs.stop);
      } else {
        MotionPreviewManager.cancelPreview(cardId);
      }
    });
  }, []);

  useEffect(() => {
    const unsub = subscribeToViewport(checkVisibility);
    return () => unsub();
  }, [checkVisibility]);

  // Stable wrapper — FlatList requires this ref to never change identity
  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: VIEWABILITY_CONFIG,
      onViewableItemsChanged: (info) => handleViewableItemsChangedRef.current(info),
    },
  ]);

  /* ─── Scroll Metrics ─── */
  const cardWidth = useMemo(() => getCardWidthForBucket(bucketId, currentScreenWidth), [bucketId, currentScreenWidth]);

  const handleHorizontalScroll = useCallback((event) => {
    if (!categoryVideos?.length) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const offsetX = contentOffset?.x || 0;
    const totalWidth = contentSize?.width || 0;
    const visibleWidth = layoutMeasurement?.width || 0;
    const totalCards = categoryVideos.length;
    const cardsScrolled = Math.max(0, Math.min(totalCards, Math.round((offsetX - 20) / cardWidth)));
    const maxScrollableOffset = Math.max(0, totalWidth - visibleWidth);
    const scrollPercentage = maxScrollableOffset > 0 ? Math.min(100, (offsetX / maxScrollableOffset) * 100) : 0;
    onScrollMetrics?.(
      { cards_scrolled: cardsScrolled, total_cards_in_bucket: totalCards, scroll_percentage: scrollPercentage, reached_end_of_bucket: offsetX >= maxScrollableOffset - 5 },
      { bucketId, category }
    );
  }, [categoryVideos, bucketId, category, cardWidth, onScrollMetrics]);

  /* ─── Render Item ─── */
  const renderItem = useCallback(({ item, index }) => {
    const previewUrl = bucketId === 'interactive-shows' ? null : getPreviewUrl(item);
    const cardId = `${keyPrefix}-${item?.id || item?.path || index}`;

    // DEBUG: log raw URL fields to identify the correct field name
    if (index === 0) {
      console.log('[Slider] first item URL fields:', {
        previewUrl: item?.previewUrl,
        preview_url: item?.preview_url,
        trailerUrl: item?.trailerUrl,
        trailer_url: item?.trailer_url,
        asset_group_preview_url: item?.asset_group_preview_url,
        resolvedPreviewUrl: previewUrl,
      });
    }

    if (previewUrl) {
      return (
        <PreviewSliderItem
          item={item}
          index={index}
          onVideoPress={onVideoPress}
          onLongPress={onLongPress}
          rank={bucketId === '4' ? index + 1 : null}
          bucketId={bucketId}
          isScreenFocused={isScreenFocused}
          cardId={cardId}
          previewUrl={previewUrl}
          isInteractiveEnabled={isInteractiveEnabled}
          onMount={handleItemMount}
          onUnmount={handleItemUnmount}
        />
      );
    }

    // No preview URL — render plain VideoThumbnail (zero regression)
    return (
      <View style={styles.thumbnailWrapper}>
        <VideoThumbnail
          video={item}
          onPress={onVideoPress ? (v) => onVideoPress(v, index) : undefined}
          onUnlockPress={onUnlockPress}
          onLongPress={onLongPress}
          rank={bucketId === '4' ? index + 1 : null}
          bucketId={bucketId}
        />
      </View>
    );
  }, [onVideoPress, onUnlockPress, onLongPress, bucketId, isScreenFocused, keyPrefix, handleItemMount, handleItemUnmount, isInteractiveEnabled]);

  const keyExtractor = useCallback(
    (item, index) => `${keyPrefix}-${item.id || item.title || index}`,
    [keyPrefix]
  );

  if (!categoryVideos?.length) return null;

  const hasInteractiveItems = isInteractiveEnabled && categoryVideos.some(v => v.is_interactive);

  return (
    <View style={styles.videoSection} onLayout={handleLayout}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>
          {typeof label === 'string' ? label : label?.name || 'Category'}
        </Text>
        {hasInteractiveItems && showFastMeChip && <FastMeChip />}
      </View>
      <FlatList
        data={categoryVideos}
        horizontal
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.videoScrollContainer}
        style={styles.videoScrollView}
        onScroll={handleHorizontalScroll}
        scrollEventThrottle={32}
        removeClippedSubviews={Platform.OS !== 'android'}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
      />
    </View>
  );
});

Slider.displayName = 'Slider';

const styles = StyleSheet.create({
  videoSection: { marginBottom: 15 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 20,
    marginBottom: 15,
    marginTop: 10,
  },
  sectionTitle: {
    fontFamily: 'Product Sans',
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  interactiveChipOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 11,
  },
  videoScrollView: { paddingLeft: 20 },
  videoScrollContainer: { paddingRight: 20 },

  // PreviewSliderItem styles
  previewCardContainer: {
    marginRight: 12,
  },
  posterWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  thumbnailAspect: {
    aspectRatio: 2 / 3,
    borderRadius: 8,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    position: 'relative',
    elevation: 3,
  },
  placeholder: {
    backgroundColor: '#2a2a2a',
  },
  videoInfo: { marginTop: 10, paddingHorizontal: 2 },
  videoTitle: {
    fontFamily: 'Product Sans Medium',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 3,
    opacity: 0.8,
  },
  videoCreator: { color: '#AAAAAA', fontSize: 9, fontWeight: '400' },
  tileLabelWrapper: {
    position: 'absolute', top: 8, left: 0, right: 0, zIndex: 10,
    alignItems: 'center',
  },
  tileLabelContainer: {
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center',
  },
  tileLabelIcon: {
    width: 12, height: 12, marginRight: 4, tintColor: '#FFFFFF',
  },
  tileLabelText: {
    fontFamily: 'Product Sans', fontWeight: '700', fontSize: 10,
    color: '#FFFFFF', includeFontPadding: false,
  },
  tileLabelBlue: {
    position: 'absolute', top: 8, left: 8, zIndex: 10,
    backgroundColor: 'rgba(0, 156, 219, 1)',
    borderWidth: 0.5, borderColor: 'rgba(27, 87, 111, 0.4)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  tileLabelBlueText: {
    fontFamily: 'Product Sans', fontWeight: '700', fontSize: 11,
    lineHeight: 11, color: 'rgba(255, 255, 255, 1)',
  },
  durationBadge: {
    position: 'absolute', top: 6, right: 6, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
  },
  durationText: { color: '#FFFFFF', fontSize: 9, fontWeight: '600' },
  viewCountGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 32, justifyContent: 'flex-end',
    paddingBottom: 5, paddingHorizontal: 7, zIndex: 10,
  },
  viewCountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  viewCountText: {
    color: '#FFFFFF', fontSize: 10, fontWeight: '600', fontFamily: 'Arial',
  },
  rankContainer: {
    position: 'absolute', bottom: -18, left: -30, zIndex: 20, elevation: 10,
  },
  rankText: {
    color: '#FFFFFF', fontSize: 110, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4, fontFamily: 'Product Sans',
    includeFontPadding: false, lineHeight: 110,
  },
});

export default Slider;