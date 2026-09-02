import React from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ShimmerPlaceholder from './ShimmerPlaceholder';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HORIZONTAL_PADDING = 16;
const CONTENT_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

const isIpad = Platform.OS === 'ios' && Platform.isPad;
const CAROUSEL_HEIGHT = isIpad
  ? SCREEN_HEIGHT * 0.35
  : (SCREEN_WIDTH * 0.65) / (3 / 4);
const TILE_ITEM_WIDTH = (SCREEN_WIDTH - (isIpad ? 100 : 50)) / (isIpad ? 4 : 2);
const TILE_HEIGHT = TILE_ITEM_WIDTH * 1.5;

/**
 * Skeleton loading screen for Home that mirrors the actual layout:
 * header, hero/carousel, category row, section title, content cards.
 * Uses dark gray placeholders with shimmer effect.
 */
const HomeSkeleton = () => {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top + 20;

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      {/* Header: logo + button placeholders */}
      <View style={styles.headerRow}>
        <ShimmerPlaceholder width={120} height={32} />
        <ShimmerPlaceholder width={120} height={32} />
      </View>

      {/* Hero / Featured area: large central block with side strips (carousel) */}
      <View style={styles.heroRow}>
        <ShimmerPlaceholder
          width={60}
          height={CAROUSEL_HEIGHT - 70}
          borderRadius={12}
          style={styles.heroSide}
        />
        <ShimmerPlaceholder
          width={CONTENT_WIDTH - 130}
          height={CAROUSEL_HEIGHT}
          borderRadius={12}
          style={styles.heroCenter}
        />
        <ShimmerPlaceholder
          width={60}
          height={CAROUSEL_HEIGHT - 70}
          borderRadius={12}
          style={styles.heroSide}
        />
      </View>

      {/* Category row: 5 small squares */}
      <View style={styles.categoryRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <ShimmerPlaceholder
            key={i}
            width={56}
            height={38}
            borderRadius={8}
            style={styles.categoryItem}
          />
        ))}
      </View>

      {/* Section title */}
      <View style={styles.sectionTitleWrap}>
        <ShimmerPlaceholder
          width={140}
          height={20}
          borderRadius={4}
        />
      </View>

      {/* Content grid: two cards side by side */}
      <View style={styles.cardRow}>
        <ShimmerPlaceholder
          width={(CONTENT_WIDTH - 12) / 2}
          height={TILE_HEIGHT}
          borderRadius={8}
          style={styles.card}
        />
        <ShimmerPlaceholder
          width={(CONTENT_WIDTH - 12) / 2}
          height={TILE_HEIGHT}
          borderRadius={8}
          style={styles.card}
        />
      </View>

      {/* Second section title */}
      <View style={[styles.sectionTitleWrap, { marginTop: 24 }]}>
        <ShimmerPlaceholder
          width={120}
          height={20}
          borderRadius={4}
        />
      </View>

      {/* Second row of cards */}
      <View style={styles.cardRow}>
        <ShimmerPlaceholder
          width={(CONTENT_WIDTH - 12) / 2}
          height={TILE_HEIGHT}
          borderRadius={8}
          style={styles.card}
        />
        <ShimmerPlaceholder
          width={(CONTENT_WIDTH - 12) / 2}
          height={TILE_HEIGHT}
          borderRadius={8}
          style={styles.card}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
  },
  heroSide: {
    alignSelf: 'center',
  },
  heroCenter: {
    flex: 0,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  categoryItem: {
    marginRight: 10,
  },
  sectionTitleWrap: {
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    flex: 1,
  },
});

export default HomeSkeleton;
