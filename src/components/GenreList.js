import React, { useCallback, memo } from 'react';
import {
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';

/**
 * Optimized Horizontal Genre List
 *
 * Features:
 * - Virtualized (FlatList)
 * - Memoized component
 * - Memoized renderItem
 * - getItemLayout for fast scrollToIndex
 * - removeClippedSubviews
 * - Production-safe
 */

const GenreList = memo(({
  genres = [],
  selectedGenre,
  onGenrePress,
  listRef,
  contentContainerStyle,
  style,
}) => {

  /* -------------------------
     Render Genre Item
  ------------------------- */
  const renderItem = useCallback(
    ({ item, index }) => {
      const id = item.path || item.name;
      const isSelected = selectedGenre === id;

      return (
        <TouchableOpacity
          style={[
            styles.genreButton,
            isSelected && styles.genreButtonSelected,
          ]}
          onPress={() => onGenrePress?.(item, index)}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.genreButtonText,
              isSelected && styles.genreButtonTextSelected,
            ]}
          >
            {item.name}
          </Text>
        </TouchableOpacity>
      );
    },
    [selectedGenre, onGenrePress]
  );

  /* -------------------------
     Key Extractor
  ------------------------- */
  const keyExtractor = useCallback(
    (item, index) =>
      item.path?.toString() ||
      item.name ||
      index.toString(),
    []
  );

  /* -------------------------
     Layout Optimization
     (Improves scrollToIndex)
  ------------------------- */
  const getItemLayout = useCallback(
    (_, index) => ({
      length: 100, // approximate avg width
      offset: 100 * index,
      index,
    }),
    []
  );

  if (!genres?.length) return null;

  return (
    <FlatList
      ref={listRef}
      data={genres}
      horizontal
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        styles.genreScrollContainer,
        contentContainerStyle,
      ]}
      style={style}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={5}
      removeClippedSubviews
      getItemLayout={getItemLayout}
    />
  );
});

export default GenreList;

/* -------------------------
   Styles
------------------------- */

const styles = StyleSheet.create({
  genreScrollContainer: {
    paddingLeft: 20,
    paddingRight: 20,
  },
  genreButton: {
    height: 38,
    paddingHorizontal: 16,
    marginRight: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  genreButtonSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  genreButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  genreButtonTextSelected: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});