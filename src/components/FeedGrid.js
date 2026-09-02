/**
 * FeedGrid — 2-column vertical grid with inline motion preview.
 *
 * Architecture:
 *  - ONE viewport subscription at the FeedGrid container level (vs. 79 individual ones).
 *  - Each FeedItem uses onLayout + measure() to capture its absolute scroll-content Y once.
 *  - On scroll, the container checks all item positions in pure JS and calls
 *    requestPreview / cancelPreview on the appropriate item.
 *  - Cards without previewUrl render identically to before (zero regression).
 */

import React, {
  useCallback, useRef, useEffect, useState, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, FlatList, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from './LazyImage';
import { Ionicons } from '@expo/vector-icons';
import MotionPreviewCard from './MotionPreviewCard';
import MotionPreviewManager from '../services/MotionPreviewManager';

const INTERACTIVE_ICON = require('../../assets/ic_interactive.png');
import { subscribeToViewport, getViewport } from '../context/ViewportContext';
import InteractiveChip from './InteractiveChip';
import { useInteractiveEnabled } from '../context/InteractiveShowContext';

const isIpad = Platform.OS === 'ios' && Platform.isPad;
const { width: screenWidth } = Dimensions.get('window');
const numColumns = isIpad ? 4 : 2;
const itemWidth = (screenWidth - (isIpad ? 100 : 50)) / numColumns;
const CARD_HEIGHT = itemWidth * 1.5;
const ROW_HEIGHT = CARD_HEIGHT + 10 + 18 + 10; // card + margin + title + margin
const VISIBILITY_THRESHOLD = 0.8; // 50% visible

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
// FeedItem — single card; purely presentational + preview overlay
// ─────────────────────────────────────────────────────────────────────────────
const FeedItem = React.memo(({
  item, index, onItemPress, onLongPress,
  showRemoveIcon, onRemovePress,
  isPreviewActive, isScreenFocused,
  isInteractiveEnabled,
  showInteractiveChip,
  disablePreview,
  onPositionMeasured,
}) => {
  const touchableRef = useRef(null);
  const previewUrl = useMemo(() => disablePreview ? null : getPreviewUrl(item), [item, disablePreview]);
  const cardId = `feedgrid-${item?.agdlmId || item?.id || item?.path || index}`;

  const handleLayout = useCallback(() => {
    if (!previewUrl || !touchableRef.current) return;
    touchableRef.current.measure((x, y, w, h, pageX, pageY) => {
      const v = getViewport();
      const contentY = pageY + v.scrollY;
      const contentX = pageX;
      onPositionMeasured?.(cardId, contentX, contentY, h || CARD_HEIGHT, w || itemWidth);
    });
  }, [cardId, previewUrl, onPositionMeasured]);

  const imageSource = useMemo(() => {
    const src = item?.verticalFilePath ?? item?.posterImage ?? item?.imageUrl ??
      item?.thumbnail ?? item?.verticalFileName ?? item?.horizontalFilePath;
    return src ? { uri: src } : null;
  }, [item]);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    touchableRef.current?.measure((x, y, w, h, pageX, pageY) => {
      onLongPress(item, { x, y, width: w, height: h, pageX, pageY });
    }) ?? onLongPress(item, null);
  }, [item, onLongPress]);

  const handlePress = useCallback(() => {
    MotionPreviewManager.cancelPreview(cardId);
    onItemPress?.(item, index);
  }, [item, index, onItemPress, cardId]);

  const handleRemove = useCallback((e) => {
    e.stopPropagation();
    onRemovePress?.(item);
  }, [item, onRemovePress]);

  return (
    <TouchableOpacity
      ref={touchableRef}
      style={styles.feedItem}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onLayout={handleLayout}
      delayLongPress={500}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        {imageSource ? (
          <LazyImage source={imageSource} style={styles.feedImage} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}

        {item?.tile_label ? (
          <View style={styles.tileLabelContainer}>
            <Text style={styles.tileLabelText}>{item.tile_label}</Text>
          </View>
        ) : null}

        {item?.is_interactive && isInteractiveEnabled && showInteractiveChip && !item?.tile_label ? (
          <View style={styles.interactiveChipOverlay}>
            <InteractiveChip size="small" />
          </View>
        ) : null}

        {showRemoveIcon && (
          <TouchableOpacity style={styles.removeIconContainer} onPress={handleRemove} activeOpacity={0.7}>
            <Ionicons name="bookmark" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {previewUrl ? (
          <MotionPreviewCard
            previewUrl={previewUrl}
            cardId={cardId}
            isPreviewActive={isPreviewActive}
            isScreenFocused={isScreenFocused}
            videoOverlayStyle={styles.feedVideoOverlay}
          />
        ) : null}
      </View>

      <View style={styles.feedContent}>
        <Text style={styles.feedTitle} numberOfLines={2}>
          {String(item?.title || item?.label || 'Untitled')}
        </Text>
      </View>
    </TouchableOpacity>
  );
});
FeedItem.displayName = 'FeedItem';

// ─────────────────────────────────────────────────────────────────────────────
// FeedGrid — container with ONE scroll subscription
// ─────────────────────────────────────────────────────────────────────────────
const FeedGrid = ({
  feedData, onItemPress, onUnlockPress, onLongPress,
  showRemoveIcon = false, onRemovePress,
  onScrollMetrics, bucketId, isScreenFocused = true,
  showInteractiveChip = true,
  disablePreview = false,
}) => {
  const isInteractiveEnabled = useInteractiveEnabled();
  // Map: cardId → { contentY, h, startFn, stopFn, isActive }
  const itemRegistryRef = useRef({});
  const [activeCardId, setActiveCardId] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const validFeedData = useMemo(() =>
    Array.isArray(feedData) ? feedData.filter(i => i && typeof i === 'object') : [],
    [feedData]
  );

  // Analytics — emit once
  useEffect(() => {
    if (typeof onScrollMetrics === 'function' && validFeedData.length > 0) {
      onScrollMetrics(
        { cards_scrolled: 0, total_cards_in_bucket: validFeedData.length, scroll_percentage: 100, reached_end_of_bucket: true },
        { bucketId, category: { data: validFeedData } }
      );
    }
  }, [validFeedData, onScrollMetrics, bucketId]);

  // Stop all on screen blur
  useEffect(() => {
    if (!isScreenFocused) {
      MotionPreviewManager.stopAll();
      if (mountedRef.current) setActiveCardId(null);
    }
  }, [isScreenFocused]);

  // Called by each FeedItem once they know their screen position
  const handlePositionMeasured = useCallback((cardId, contentX, contentY, h, w) => {
    const item = validFeedData.find(it =>
      `feedgrid-${it?.agdlmId || it?.id || it?.path}` === cardId
    );
    if (!item) return;
    const previewUrl = getPreviewUrl(item);
    if (!previewUrl) return;

    itemRegistryRef.current[cardId] = {
      contentX, // Add X tracking
      contentY,
      h,
      w, // Add width tracking
      previewUrl,
      isActive: false,
    };
    // Reduced spam log
  }, [validFeedData]);

  // Single scroll listener — checks all registered items
  const checkAllVisibility = useCallback(() => {
    const v = getViewport();
    const registry = itemRegistryRef.current;
    const ids = Object.keys(registry);
    if (ids.length === 0) return;

    let bestId = null;
    let bestPercent = VISIBILITY_THRESHOLD;

    for (const id of ids) {
      const { contentX, contentY, h, w } = registry[id];
      // Bounding box of the visible viewport (adjusted for sticky headers)
      const viewportTop = v.scrollY + (v.stickyTopOffset || 0);

      const overlapTop = Math.max(contentY, viewportTop);
      const overlapBottom = Math.min(contentY + h, v.scrollY + v.viewportHeight);
      const overlapH = Math.max(0, overlapBottom - overlapTop);
      const pct = h > 0 ? overlapH / h : 0;

      // Tie-breaker: boost score slightly if card is on the same half of screen as the user's thumb
      let adjustedPct = pct;
      if (v.touchX > 0 && pct > 0 && w > 0) {
        // True collision detection: is touchX inside this card's column?
        // We use a wide hit area (contentX - 20) to (contentX + w + 20)
        const isTouchOverCard = v.touchX >= (contentX - 40) && v.touchX <= (contentX + w + 40);

        if (isTouchOverCard) {
          adjustedPct += 0.01; // Tiny boost to break vertical ties in favor of the thumb side
        }
      }

      if (adjustedPct > bestPercent) {
        bestPercent = adjustedPct;
        bestId = id;
      }
    }

    if (!mountedRef.current) return;

    if (bestId !== null) {
      // Request preview for the most visible card
      MotionPreviewManager.requestPreview(
        bestId,
        () => { if (mountedRef.current) setActiveCardId(bestId); },
        () => { if (mountedRef.current) setActiveCardId(prev => prev === bestId ? null : prev); }
      );
    } else if (activeCardId) {
      // Nothing visible — cancel current
      MotionPreviewManager.cancelPreview(activeCardId);
      if (mountedRef.current) setActiveCardId(null);
    }
  }, [activeCardId]);

  // Subscribe once to viewport changes
  useEffect(() => {
    const unsub = subscribeToViewport(checkAllVisibility);
    return () => unsub();
  }, [checkAllVisibility]);

  if (validFeedData.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No feed items available</Text>
      </View>
    );
  }

  // Virtualized grid: only mount visible rows to reduce OOM on Android
  const numRows = Math.ceil(validFeedData.length / numColumns);
  const totalHeight = numRows * ROW_HEIGHT;
  // Nested inside Home FlatList: small window + removeClippedSubviews on Android causes rows to blink on scroll
  const windowSize = 5;
  const maxToRenderPerBatch = Platform.OS === 'android' ? 8 : 10;
  const initialNumToRender = 6;

  const renderItem = useCallback(({ item, index }) => {
    const cardId = `feedgrid-${item?.agdlmId || item?.id || item?.path || index}`;
    return (
      <FeedItem
        item={item}
        index={index}
        onItemPress={onItemPress}
        onLongPress={onLongPress}
        showRemoveIcon={showRemoveIcon}
        onRemovePress={onRemovePress}
        isPreviewActive={activeCardId === cardId}
        isScreenFocused={isScreenFocused}
        isInteractiveEnabled={isInteractiveEnabled}
        showInteractiveChip={showInteractiveChip}
        disablePreview={disablePreview}
        onPositionMeasured={handlePositionMeasured}
      />
    );
  }, [onItemPress, onLongPress, onRemovePress, showRemoveIcon, isScreenFocused, activeCardId, handlePositionMeasured, isInteractiveEnabled, showInteractiveChip, disablePreview]);

  const keyExtractor = useCallback((item, index) =>
    `feed-${item?.agdlmId || item?.id || item?.path || index}`, []);

  const getItemLayout = useCallback((_, index) => {
    const rowIndex = Math.floor(index / numColumns);
    return { length: ROW_HEIGHT, offset: rowIndex * ROW_HEIGHT, index };
  }, []);

  return (
    <View style={[styles.container, { height: totalHeight }]}>
      <FlatList
        data={validFeedData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        scrollEnabled={false}
        removeClippedSubviews={Platform.OS !== 'android'}
        windowSize={windowSize}
        maxToRenderPerBatch={maxToRenderPerBatch}
        initialNumToRender={initialNumToRender}
        getItemLayout={getItemLayout}
        contentContainerStyle={styles.gridContainer}
        columnWrapperStyle={styles.columnWrapper}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  gridContainer: { paddingBottom: 10 },
  columnWrapper: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  feedItem: { width: itemWidth },
  imageContainer: {
    width: '100%', height: CARD_HEIGHT,
    backgroundColor: '#2A2A2A', borderRadius: 8,
    borderColor: '#FFFFFF1A', borderWidth: 1,
    overflow: 'hidden', position: 'relative',
  },
  feedImage: { width: '100%', height: '100%', borderRadius: 8 },
  placeholderImage: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2A2A2A' },
  placeholderText: { color: '#666', fontSize: 12 },
  feedContent: { marginTop: 10 },
  feedTitle: {
    fontFamily: 'Product Sans Medium', color: '#FFFFFF',
    fontSize: 15, fontWeight: '500', lineHeight: 18, opacity: 0.8,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#888', fontSize: 16, textAlign: 'center' },
  tileLabelContainer: {
    position: 'absolute', top: 8, left: 8, zIndex: 10,
    backgroundColor: 'rgba(0, 156, 219, 1)',
    borderWidth: 0.5, borderColor: 'rgba(27, 87, 111, 0.4)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  tileLabelText: {
    fontFamily: 'Product Sans', fontWeight: '700', fontSize: 11,
    lineHeight: 11, color: 'rgba(255, 255, 255, 1)',
  },
  removeIconContainer: {
    position: 'absolute', bottom: 10, right: 8,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
    zIndex: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  feedVideoOverlay: { borderRadius: 8 },
  interactiveChipOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 11,
  },
});

export default FeedGrid;