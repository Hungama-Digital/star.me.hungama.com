import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  useWindowDimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from './LazyImage';

const INTERACTIVE_ICON = require('../../assets/ic_interactive.png');

const isIpad = Platform.OS === 'ios' && Platform.isPad;

const VideoThumbnail = React.memo(({ video, onPress, onLongPress, rank, bucketId }) => {
  const { width: currentScreenWidth } = useWindowDimensions();

  const getWidthFactorByBucketId = () => {
    let factor = 2.7;
    if (bucketId === '6') factor = 2.7;
    else if (bucketId === '3') factor = 2.2;
    else if (bucketId === '4') factor = 2.23;
    else if (bucketId === 'interactive-shows') factor = 2.2;
    return isIpad ? factor * 1.5 : factor;
  };
  const THUMBNAIL_WIDTH = (currentScreenWidth - 60) / getWidthFactorByBucketId(); // 3 columns with margins
  const [imageError, setImageError] = useState(false);

  // Memoize formatted stats
  const formattedStats = useMemo(() => {
    if (!video) return { views: '0', likes: '0' };

    const formatViews = (num) => {
      if (typeof num === 'string') {
        // If it's already formatted (like "1.2M"), return as is
        if (num.includes('M') || num.includes('K')) {
          return num;
        }
        // Convert string to number
        num = parseInt(num, 10) || 0;
      }

      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
      } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return num.toString();
    };

    return {
      views: formatViews(video.views || 0),
      likes: formatViews(video.likes || 0),
    };
  }, [video]);

  // Optimized press handler
  const handlePlayPress = useCallback(() => {
    if (!video) return;

    try {
      if (onPress) {
        onPress(video);
      }
    } catch (error) {
      console.error('Error in handlePlayPress:', error);
      // Fallback: try to navigate even if there's an error
      if (onPress) {
        onPress(video);
      }
    }
  }, [video, onPress]);

  const touchableRef = React.useRef(null);

  // Optimized long press handler
  const handleLongPress = useCallback(() => {
    if (!video) return;
    if (onLongPress) {
      if (touchableRef.current) {
        touchableRef.current.measure((x, y, width, height, pageX, pageY) => {
          onLongPress(video, { x, y, width, height, pageX, pageY });
        });
      } else {
        onLongPress(video, null);
      }
    }
  }, [video, onLongPress]);

  // Memoized image source
  const imageSource = useMemo(() => {
    if (!video) return null;

    // Try multiple possible image property names
    const possibleImagePaths = [
      video.verticalFilePath,
      video.horizontalFilePath,
      video.uploadHorizontalImage,
      video.uploadVerticalImage,
      video.thumbnail,
      video.imageUrl,
      video.image,
      video.coverImage,
      video.posterImage,
      video.thumb,
      video.thumbUrl,
      video.thumbnailUrl,
      video.cover,
      video.poster
    ];

    // Find the first valid image path
    const path = possibleImagePaths.find(p =>
      p && typeof p === 'string' && (p.startsWith('http') || p.startsWith('https'))
    );

    if (!path) {
      return null;
    }

    return { uri: path };
  }, [video]);

  // Memoized container style
  const containerStyle = useMemo(() => [
    styles.container,
    { width: THUMBNAIL_WIDTH },
    rank ? { paddingLeft: 23 } : {} // Add margin for rank to stick out
  ], [THUMBNAIL_WIDTH, rank]);

  // Safety check for video data
  if (!video) {
    return (
      <View style={containerStyle}>
        <View style={[styles.thumbnail, styles.placeholderContainer]}>
          <Ionicons name="image-outline" size={32} color="#666" />
          <Text style={styles.placeholderText}>No Data</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      ref={touchableRef}
      style={containerStyle}
      onPress={handlePlayPress}
      onLongPress={handleLongPress}
      delayLongPress={500}
      activeOpacity={0.8}
    >
      <View style={styles.posterWrapper}>
        <View style={styles.thumbnailContainer}>
          {!imageError && imageSource ? (
            <LazyImage
              source={imageSource}
              style={styles.thumbnail}
              resizeMode="cover"
              onError={() => {
                setImageError(true);
              }}
              onLoad={() => {
                setImageError(false);
              }}
            />
          ) : (
            <View style={[styles.thumbnail, styles.placeholderContainer]}>
              <Ionicons name="image-outline" size={32} color="#666" />
              <Text style={styles.placeholderText}>
                {video.title ? video.title.substring(0, 10) + '...' : 'No Image'}
              </Text>
            </View>
          )}

          {/* Tile label from pagecategory (e.g. "Recently Added", "New Series") */}
          {video.tile_label ? (
            bucketId === 'interactive-shows' ? (
              <View style={styles.tileLabelWrapperCenter}>
                <LinearGradient
                  colors={['#FF6A41', '#C044FD']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.tileLabelGradient}
                >
                  <Image source={INTERACTIVE_ICON} style={styles.tileLabelIcon} resizeMode="contain" />
                  <Text style={styles.tileLabelGradientText}>{video.tile_label}</Text>
                </LinearGradient>
              </View>
            ) : (
              <View style={styles.tileLabelContainer}>
                <Text style={styles.tileLabelText}>{video.tile_label}</Text>
              </View>
            )
          ) : null}

          {/* Duration Badge */}
          {video.duration ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{video.duration}</Text>
            </View>
          ) : null}

          {/* View count at bottom-left */}
          {(formattedStats.views !== '0' || bucketId === 'interactive-shows') ? (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              style={styles.bottomGradient}
            >
              <View style={styles.statsContainer}>
                <View style={styles.stat}>
                  <Ionicons name="play" size={8} color="#FFFFFF" />
                  <Text style={styles.statText}>
                    {formattedStats.views !== '0' ? formattedStats.views : '4.5M'}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          ) : null}
        </View>

        {/* Rank Overlay for Bucket 3 */}
        {rank ? (
          <View style={styles.rankContainer}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
        ) : <></>}
      </View>

      {/* Video Info */}
      <View style={[styles.videoInfo, rank ? { marginLeft: -30 } : {}]}>
        <Text style={styles.videoTitle} numberOfLines={2}>
          {video.title}
        </Text>
        <Text style={styles.videoCreator} numberOfLines={1}>
          {video.creator}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// Add display name for debugging
VideoThumbnail.displayName = 'VideoThumbnail';

const styles = StyleSheet.create({
  container: {
    marginRight: 12, // Right margin for horizontal scrolling
    // width will be set dynamically via containerStyle
  },
  thumbnailContainer: {
    aspectRatio: 2 / 3, // Square aspect ratio (1:1)
    borderRadius: 8,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    elevation: 3,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderContainer: {
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 10,
    marginTop: 4,
  },
  playButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 2, // Adjust for play icon centering
  },
  tileLabelContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 156, 219, 1)',
    borderWidth: 0.5,
    borderColor: 'rgba(27, 87, 111, 0.4)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
  },
  tileLabelText: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 11,
    letterSpacing: 0,
    color: 'rgba(255, 255, 255, 1)',
    textAlign: 'right',
  },
  tileLabelWrapperCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  tileLabelGradient: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileLabelIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
    tintColor: '#FFFFFF',
  },
  tileLabelGradientText: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 10,
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  durationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
  },

  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    justifyContent: 'flex-end',
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#FFFFFF',
    fontSize: 8,
    marginLeft: 2,
    fontWeight: '500',
  },
  videoInfo: {
    marginTop: 10,
    paddingHorizontal: 2,
  },
  videoTitle: {
    fontFamily: 'Product Sans Medium',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 3,
    opacity: 0.8
  },
  videoCreator: {
    color: '#AAAAAA',
    fontSize: 9,
    fontWeight: '400',
  },
  posterWrapper: {
    position: 'relative',
    marginBottom: 4, // Space between poster and text
  },
  rankContainer: {
    position: 'absolute',
    bottom: -18, // Align roughly with bottom of image
    left: -30, // Stick out significantly to the left
    zIndex: 20,
    elevation: 10,
  },
  rankText: {
    color: '#FFFFFF',
    fontSize: 110, // Very large font
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    fontFamily: 'Product Sans',
    includeFontPadding: false,
    lineHeight: 110, // Match font size to control vertical height
  },
});

export default VideoThumbnail; 