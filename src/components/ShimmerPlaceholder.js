import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HORIZONTAL_PADDING = 16;
const CONTENT_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

// Match FeaturedCarousel hero dimensions: baseItemWidth * 0.65, aspect 3/4
const isIpad = Platform.OS === 'ios' && Platform.isPad;
const CAROUSEL_HEIGHT = isIpad
  ? SCREEN_HEIGHT * 0.35
  : (SCREEN_WIDTH * 0.65) / (3 / 4);

// Match FeedGrid 2-column tile: itemWidth = (screenWidth - 50) / 2, height = itemWidth * 1.5
const TILE_ITEM_WIDTH = (SCREEN_WIDTH - (isIpad ? 100 : 50)) / (isIpad ? 4 : 2);
const TILE_HEIGHT = TILE_ITEM_WIDTH * 1.5;

/**
 * A placeholder box with a subtle shimmer (moving highlight) effect.
 * Used in skeleton screens while content loads.
 *
 * variant="screen" — Renders a full-screen skeleton layout matching the tile/details
 * wireframe: top bars, main content block with side bars, row of 5 squares,
 * text line, and two content cards at bottom.
 */
const ShimmerPlaceholder = ({
  style,
  width,
  height,
  borderRadius = 4,
  shimmerWidth = 80,
  variant,
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
      { resetBeforeIteration: true }
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-400, 400],
  });

  const shimmerOverlay = (
    <Animated.View
      style={[
        styles.shimmer,
        {
          width: shimmerWidth,
          transform: [{ translateX }],
        },
      ]}
    />
  );

  // Full-screen skeleton layout matching the wireframe image exactly
  if (variant === 'screen') {
    return (
      <View style={[styles.screenContainer, style]} overflow="hidden">
        {/* Top: two small horizontal bars — left and right (header/icons) */}
        <View style={styles.screenTopRow}>
          <View style={[styles.base, styles.screenTopBar]} />
          <View style={[styles.base, styles.screenTopBar]} />
        </View>

        {/* Main: narrow vertical strip | large center block | narrow vertical strip */}
        <View style={styles.screenMainRow}>
          <View style={[styles.base, styles.screenSideBar]} />
          <View style={[styles.base, styles.screenMainBlock]} />
          <View style={[styles.base, styles.screenSideBar]} />
        </View>

        {/* Middle: primary text (left) + 5 squares + one wider rectangle */}
        <View style={styles.screenMiddleRow}>
          <View style={[styles.base, styles.screenPrimaryText]} />
          <View style={[styles.base, styles.screenActionBlock]} />
          <View style={[styles.base, styles.screenActionBlock]} />
          <View style={[styles.base, styles.screenActionBlock]} />
          <View style={[styles.base, styles.screenActionBlock]} />
          <View style={[styles.base, styles.screenActionBlock]} />
          <View style={[styles.base, styles.screenWiderRect]} />
        </View>

        {/* Secondary text / description placeholder (wider, left-aligned) */}
        <View style={styles.screenTextWrap}>
          <View style={[styles.base, styles.screenSecondaryText]} />
        </View>

        {/* Bottom: left squarish block | right wider block */}
        <View style={styles.screenCardsRow}>
          <View style={[styles.base, styles.screenCardLeft]} />
          <View style={[styles.base, styles.screenCardRight]} />
        </View>

        {shimmerOverlay}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.base,
        {
          width: width ?? '100%',
          height: height ?? 24,
          borderRadius,
        },
        style,
      ]}
      overflow="hidden"
    >
      {shimmerOverlay}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
  },
  // Screen variant: exact wireframe layout
  screenContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 20,
  },
  screenTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  screenTopBar: {
    width: 72,
    height: 20,
    borderRadius: 4,
  },
  screenMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    gap: 6,
  },
  screenSideBar: {
    width: 20,
    height: CAROUSEL_HEIGHT,
    borderRadius: 4,
  },
  screenMainBlock: {
    width: CONTENT_WIDTH - 52,
    height: CAROUSEL_HEIGHT,
    borderRadius: 8,
  },
  screenMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  screenPrimaryText: {
    width: CONTENT_WIDTH * 0.32,
    height: 18,
    borderRadius: 4,
  },
  screenActionBlock: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  screenWiderRect: {
    width: 64,
    height: 36,
    borderRadius: 6,
    marginLeft: 4,
  },
  screenTextWrap: {
    marginBottom: 18,
  },
  screenSecondaryText: {
    width: CONTENT_WIDTH * 0.55,
    height: 16,
    borderRadius: 4,
  },
  screenCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  screenCardLeft: {
    width: (CONTENT_WIDTH - 10) * 0.45,
    height: TILE_HEIGHT,
    borderRadius: 8,
  },
  screenCardRight: {
    width: (CONTENT_WIDTH - 10) * 0.55,
    height: TILE_HEIGHT,
    borderRadius: 8,
  },
});

export default ShimmerPlaceholder;
