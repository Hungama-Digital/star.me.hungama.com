import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from './LazyImage';

const PADDING_H = 20;
const CARD_GAP = 12;
const POSTER_WIDTH = 90;
const POSTER_ASPECT = 1.35;

/**
 * Get episode values from API: total episodes (asset_count), watched count (total_episode_watched_count).
 * Falls back to dummy values only if API fields are missing.
 */
const getEpisodeValues = (item, index) => {
  const totalEpisodes = item?.asset_count ?? item?.assetCount;
  const total_episode_watched_count = item?.total_episode_watched_count ?? item?.totalEpisodeWatchedCount;
  if (typeof totalEpisodes === 'number' && typeof total_episode_watched_count === 'number') {
    return { total_episode_watched_count, totalEpisodes };
  }
  const baseTotal = 50 + (index % 71);
  const baseCurrent = 1 + (index % Math.max(1, baseTotal - 1));
  return { total_episode_watched_count: baseCurrent, totalEpisodes: baseTotal };
};

/**
 * Progress percentage: (total_episode_watched_count / asset_count) * 100.
 * Uses dummy value only when API data is not available.
 */
const getProgressPercent = (item, index) => {
  const total = item?.asset_count ?? item?.assetCount;
  const watched = item?.total_episode_watched_count ?? item?.totalEpisodeWatchedCount;
  if (typeof total === 'number' && total > 0 && typeof watched === 'number') {
    return Math.min(100, Math.max(0, (watched / total) * 100));
  }
  return ((index * 23 + 18) % 92) + 8;
};

const WatchHistoryItem = React.memo(({
  item,
  index,
  onItemPress,
  selectionMode,
  selected,
  onToggleSelect,
}) => {
  if (!item || typeof item !== 'object') return null;

  const imageSource =
    item.verticalFilePath ??
    item.posterImage ??
    item.imageUrl ??
    item.thumbnail ??
    item.horizontalFilePath;

  const { total_episode_watched_count, totalEpisodes } = getEpisodeValues(item, index);
  const progressPercent = getProgressPercent(item, index);
  const seriesTitle = item.title || item.label || item.assetTitle || 'Untitled';

  const handlePress = () => {
    if (selectionMode) {
      onToggleSelect?.(item);
    } else {
      onItemPress?.(item, index);
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.posterContainer}>
        <View style={styles.posterImageWrapper}>
          {imageSource ? (
            <LazyImage
              source={{ uri: imageSource }}
              style={styles.poster}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderPoster}>
              <Ionicons name="image-outline" size={32} color="#666" />
            </View>
          )}
        </View>
        <View style={styles.progressBarTrack}>
          <View
            style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
          />
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.seriesTitle} numberOfLines={2}>
          {String(seriesTitle)}
        </Text>
        <Text style={styles.episodeProgress}>
          EP.{total_episode_watched_count} / EP{totalEpisodes}
        </Text>
      </View>
      {selectionMode && (
        <View style={styles.selectBoxWrapper}>
          <View style={styles.selectBoxContainer}>
            {selected ? (
              <View style={styles.selectCircleFilled}>
                <Ionicons name="checkmark" size={16} color="#000000" />
              </View>
            ) : (
              <View style={styles.selectCircleOutline} />
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

const WatchHistoryGrid = React.memo(({
  data,
  onItemPress,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
}) => {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const validData = data.filter((item) => item && typeof item === 'object');
  if (validData.length === 0) return null;

  const getItemId = (item) =>
    item?.assetGroupId || item?.id || item?.path || item?.assetId;

  const selectedSet = new Set(selectedIds || []);

  return (
    <View style={styles.listContainer}>
      {validData.map((item, index) => {
        const itemId = getItemId(item);
        return (
          <WatchHistoryItem
            key={`wh-${itemId || index}`}
            item={item}
            index={index}
            onItemPress={onItemPress}
            selectionMode={selectionMode}
            selected={selectedSet.has(itemId)}
            onToggleSelect={onToggleSelect}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: PADDING_H,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 12,
    marginBottom: CARD_GAP,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  posterContainer: {
    width: POSTER_WIDTH,
    height: POSTER_WIDTH * POSTER_ASPECT,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
  },
  posterImageWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  progressBarTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#5BA4D4',
    borderRadius: 1,
  },
  placeholderPoster: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginLeft: 14,
  },
  seriesTitle: {
    fontFamily: 'Product Sans',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  episodeProgress: {
    fontFamily: 'Product Sans',
    fontSize: 13,
    color: '#AAAAAA',
  },
  selectBoxWrapper: {
    marginLeft: 12,
    marginRight: -12,
    marginTop: -12,
    marginBottom: -12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  selectBoxContainer: {
    flex: 1,
    minWidth: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0, 0, 0, 0.35)',
    backgroundColor: '#252525',
  },
  selectCircleFilled: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCircleOutline: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});

export default WatchHistoryGrid;
