import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from './LazyImage';
import { useMyList } from '../context/MyListContext';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

const { width: screenWidth } = Dimensions.get('window');
const THUMBNAIL_WIDTH = (screenWidth - 50) / 2; // 2 columns with margins (20px left + 20px right + 10px gap)

const MyListSeriesThumbnail = React.memo(({ series, onPress, style, onRefresh }) => {
  const { removeSeriesFromMyList, getLastWatchedEpisode } = useMyList();
  const { user } = useAuth();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  // Memoize last watched episode to prevent recalculation
  const lastWatchedEpisode = useMemo(() => {
    return getLastWatchedEpisode(series?.id);
  }, [series?.id, getLastWatchedEpisode]);

  // Memoize thumbnail source with fallback
  const thumbnailSource = useMemo(() => {
    // Try multiple possible image sources in order of preference
    const possibleSources = [
      series?.thumbnail,
      series?.verticalFilePath,
      series?.horizontalFilePath,
      series?.uploadVerticalImage,
      series?.uploadHorizontalImage
    ];
    
    for (const source of possibleSources) {
      if (!source) continue;
      
      console.log('Trying image source for series:', series?.title, 'Source:', source);
      
      // If it's a string URL, convert to uri object
      if (typeof source === 'string' && (source.startsWith('http') || source.startsWith('https'))) {
        console.log('Using string URL:', source);
        return { uri: source };
      }
      
      // If it's already an object with uri, return as is
      if (typeof source === 'object' && source.uri) {
        console.log('Using existing uri object:', source);
        return source;
      }
      
      // For local images (require statements), return as is
      if (typeof source === 'number' || source.startsWith?.('require(')) {
        console.log('Using local image:', source);
        return source;
      }
    }
    
    console.log('No valid image source found for series:', series?.title);
    return null;
  }, [series?.thumbnail, series?.verticalFilePath, series?.horizontalFilePath, series?.uploadVerticalImage, series?.uploadHorizontalImage]);

  // Memoize container style
  const containerStyle = useMemo(() => [
    styles.container,
    style,
    { transform: [{ scale: scaleAnim }] }
  ], [style, scaleAnim]);

  // Optimized remove handler with animation and API call
  const handleRemove = useCallback(async () => {
    try {
      // Get userId from auth context
      const userId = user?.userId || user?.uid || 57; // Fallback to 57 if no user data
      
      // Debug: Log series data
      console.log('Series data for removal:', {
        seriesId: series?.id,
        seriesPath: series?.path,
        seriesTitle: series?.title,
        userId: userId
      });
      
      // Call API to remove from watchlist
      const response = await API.deleteAssetGroupWatchlist({
        userId: userId,
        assetgroupIds: [series?.path || series?.id], // Send as array
        // path: series?.path || series?.id // Use path if available, fallback to id
      });
      
      console.log('Delete API response:', response);
      
      // Check if the delete operation was successful
      if (response.success) {
        console.log(`Successfully removed series "${series?.title}" from watchlist via API`);
        
        // Animate the removal
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (series?.id) {
            removeSeriesFromMyList(series.id);
          }
          
          // Refresh the MyListScreen data - this will call getAssetGroupWatchlist API
          if (onRefresh) {
            onRefresh();
          }
        });
      } else {
        console.error('Delete operation failed:', response.message || response.error);
        
        // Show error alert to user
        require('../utils/errorReporting').reportErrorAlert(
          'Error',
          response.message || 'Failed to remove series from watchlist. Please try again.',
          [{ text: 'OK' }]
        );
        
        // Still animate but don't remove from local state on error
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      }
      
    } catch (error) {
      console.error('Error calling deleteAssetGroupFavourite API:', error);
      
      // Show error alert to user
      require('../utils/errorReporting').reportErrorAlert(
        'Error',
        'Failed to remove series from watchlist. Please try again.',
        [{ text: 'OK' }]
      );
      
      // Still animate but don't remove from local state on error
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [scaleAnim, removeSeriesFromMyList, series?.id, series?.path, series?.title, onRefresh]);

  // Optimized series press handler
  const handleSeriesPress = useCallback(() => {
    if (onPress && series) {
      onPress(series, lastWatchedEpisode);
    }
  }, [onPress, series, lastWatchedEpisode]);

  // Safety check for series data
  if (!series) {
    return (
      <View style={containerStyle}>
        <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
          <Ionicons name="play-circle" size={40} color="#FFFFFF" />
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={containerStyle}>
      <TouchableOpacity
        style={styles.thumbnailContainer}
        onPress={handleSeriesPress}
        activeOpacity={0.8}
      >
        {/* Series Thumbnail */}
        <View style={styles.thumbnail}>
          {thumbnailSource ? (
            <LazyImage
              source={thumbnailSource}
              style={styles.thumbnailImage}
              resizeMode="cover"
              onError={(error) => {
                console.log('Image loading error for series:', series?.title, error?.nativeEvent?.error);
              }}
              onLoad={() => {
                console.log('Image loaded successfully for series:', series?.title);
              }}
            />
          ) : (
            <View style={[styles.thumbnailImage, styles.placeholderThumbnail]}>
              <Ionicons name="play-circle" size={40} color="#FFFFFF" />
            </View>
          )}
          
          {/* Bookmark Icon - Top Right */}
          <TouchableOpacity
            style={styles.bookmarkButton}
            onPress={handleRemove}
            activeOpacity={0.7}
          >
            <Ionicons name="bookmark" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Series Title Below Poster */}
        <View style={styles.seriesInfo}>
          <Text style={styles.seriesTitle} numberOfLines={1}>
            {series.title}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// Add display name for debugging
MyListSeriesThumbnail.displayName = 'MyListSeriesThumbnail';

const styles = StyleSheet.create({
  container: {
    width: THUMBNAIL_WIDTH,
    marginBottom: 24,
    position: 'relative',
  },
  thumbnailContainer: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    overflow: 'visible',
  },
  thumbnail: {
    width: '100%',
    height: THUMBNAIL_WIDTH * 1.5, // Portrait aspect ratio
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderThumbnail: {
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookmarkButton: {
    position: 'absolute',
    bottom: 10,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  seriesInfo: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  seriesTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
});

export default MyListSeriesThumbnail; 