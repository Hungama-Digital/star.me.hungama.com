import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import LazyImage from './LazyImage';
import { Ionicons } from '@expo/vector-icons';

const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = screenWidth - 32; // Full width minus margins (16px on each side)

const SearchResultCard = React.memo(({ item, onPress, onBookmarkPress }) => {
  const [imageError, setImageError] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Format view count
  const formattedViews = useMemo(() => {
    if (!item.views) return '0';
    
    const views = typeof item.views === 'string' ? parseInt(item.views, 10) : item.views;
    
    if (views >= 1000000) {
      return (views / 1000000).toFixed(1) + 'M';
    } else if (views >= 1000) {
      return (views / 1000).toFixed(1) + 'K';
    }
    return views.toString();
  }, [item.views]);

  // Get image source
  const imageSource = useMemo(() => {
    const possibleImagePaths = [
      item.horizontalFilePath,
      item.verticalFilePath,
      item.uploadHorizontalImage,
      item.uploadVerticalImage,
      item.thumbnail,
      item.imageUrl,
      item.image,
      item.coverImage,
      item.posterImage,
      item.thumb,
      item.thumbUrl,
      item.thumbnailUrl,
      item.cover,
      item.poster
    ];
    
    const path = possibleImagePaths.find(p => 
      p && typeof p === 'string' && (p.startsWith('http') || p.startsWith('https'))
    );
    
    return path ? { uri: path } : null;
  }, [item]);

  // Get genre/tag
  const getGenre = () => {
    return item.genre || item.category || item.tag;
  };

  // Get description
  const getDescription = () => {
    return item.description || item.synopsis || item.summary || 'No description available';
  };

  const handleBookmarkPress = () => {
    setIsBookmarked(!isBookmarked);
    if (onBookmarkPress) {
      onBookmarkPress(item, !isBookmarked);
    }
  };

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={() => onPress && onPress(item)}
      activeOpacity={0.8}
    >
      {/* Thumbnail on Left */}
      <View style={styles.thumbnailContainer}>
        {!imageError && imageSource ? (
          <LazyImage
            source={imageSource}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.placeholderContainer}>
            <Ionicons name="image-outline" size={32} color="#666" />
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        
        {/* View Count Badge */}
        <View style={styles.viewCountBadge}>
          <Ionicons name="eye" size={10} color="#FFFFFF" />
          <Text style={styles.viewCountText}>{formattedViews}</Text>
        </View>

        {/* Play Icon Overlay */}
        <View style={styles.playIconContainer}>
          <Ionicons name="play" size={16} color="#FFFFFF" />
        </View>
      </View>

      {/* Content Info on Right */}
      <View style={styles.contentContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title || 'Untitled'}
          </Text>
          <TouchableOpacity 
            style={styles.bookmarkButton}
            onPress={handleBookmarkPress}
          >
            <Ionicons 
              name={isBookmarked ? "bookmark" : "bookmark-outline"} 
              size={18} 
              color={isBookmarked ? "#FF6B6B" : "#666"} 
            />
          </TouchableOpacity>
        </View>

        {/* Genre Tag */}
        <View style={styles.genreContainer}>
          <Text style={styles.genreText}>{getGenre()}</Text>
        </View>

        {/* Description */}
        <Text style={styles.description} numberOfLines={3}>
          {getDescription()}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    flexDirection: 'row',
    height: 120,
  },
  thumbnailContainer: {
    position: 'relative',
    width: 120,
    height: 120,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholderContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  viewCountBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 3,
  },
  playIconContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -8 }, { translateY: -8 }],
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
    lineHeight: 18,
  },
  bookmarkButton: {
    padding: 4,
  },
  genreContainer: {
    marginBottom: 6,
  },
  genreText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
    backgroundColor: '#666666',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  description: {
    color: '#AAAAAA',
    fontSize: 12,
    lineHeight: 16,
  },
});

SearchResultCard.displayName = 'SearchResultCard';

export default SearchResultCard; 