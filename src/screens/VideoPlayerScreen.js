import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Share,
  Platform,
  Alert,
  BackHandler,
} from 'react-native';
import LazyImage from '../components/LazyImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { useAnalytics } from '../hooks/useAnalytics';
import { useSubscription } from '../context/SubscriptionContext';
import { useMyList } from '../context/MyListContext';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import NetInfo from "@react-native-community/netinfo";
async function getNetworkTypeOnce() {
  const state = await NetInfo.fetch();
  // state.type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown' ...
  // state.details?.cellularGeneration: '2g' | '3g' | '4g' | '5g' | null
  return {
    isConnected: state.isConnected,
    type: state.type,
    cellularGeneration: state.details?.cellularGeneration ?? null,
  };
}
const VideoPlayerScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { video: paramVideo, episodeId, showId } = route.params || {};
  const { trackVideoPlay, trackVideoComplete, trackShare } = useAnalytics();
  const { addSeriesToMyList, removeSeriesFromMyList, isSeriesInMyList } = useMyList();
  const { user } = useAuth();

  const video = paramVideo || (episodeId ? {
    id: episodeId,
    title: 'Episode',
    creator: '',
    thumbnail: null,
    views: 0,
    likes: 0,
    duration: '',
    isLocal: false,
    seriesId: showId,
  } : null);

  const isDeepLinkOnly = !paramVideo && !!episodeId;

  const isModal = route.params?.isModal || false;
  const [isSaved, setIsSaved] = useState(route.params?.isSaved || false);
  const [isSeries, setIsSeries] = useState(route.params?.isSeries || !!showId);
  const [seriesId, setSeriesId] = useState(route.params?.seriesId || showId || null);

  useEffect(() => {
    if (route.params?.isSaved !== undefined) {
      setIsSaved(route.params.isSaved);
    }
    if (route.params?.isSeries || showId) {
      setIsSeries(true);
      setSeriesId(route.params?.seriesId || showId || video?.seriesId || video?.id);
      if (seriesId && isSeriesInMyList(seriesId)) {
        setIsSaved(true);
      }
    }
  }, [route.params, video, seriesId, isSeries, isSeriesInMyList, showId]);

  if (!video) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
          <TouchableOpacity onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Video Player</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#FFF', fontSize: 16 }}>Content not available.</Text>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => navigation.goBack()}>
            <Text style={{ color: '#FF6B6B' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Handle save/unsave functionality
  const handleBookmarkToggle = async () => {
    try {
      if (isSeries && seriesId) {
        // Handle series save/unsave
        if (isSaved) {
          // Remove from MyList
          removeSeriesFromMyList(seriesId);
          setIsSaved(false);

          // Call API to remove from watchlist
          const userId = user?.userId || user?.uid || 57;
          await API.deleteAssetGroupWatchlist({
            userId: userId,
            assetgroupIds: [seriesId],
          });

          Alert.alert('Success', 'Removed from My List');
        } else {
          // Add to MyList
          addSeriesToMyList(seriesId);
          setIsSaved(true);

          // Call API to add to watchlist
          const userId = user?.userId || user?.uid || 57;
          await API.assetgroupwatchlist({
            userId: userId,
            assetGroupId: seriesId,
          });

          Alert.alert('Success', 'Added to My List');
        }
      } else {
        // Handle individual video save/unsave
        setIsSaved(!isSaved);
        Alert.alert('Success', isSaved ? 'Removed from My List' : 'Added to My List');
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to update My List. Please try again.');
    }
  };

  // Handle hardware back button on Android
  useEffect(() => {
    const backAction = () => {
      handleGoBack();
      return true; // Prevent default behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, []);

  // Refresh coin balance when screen comes into focus

  const handleGoBack = () => {
    // For modal screens, use dismiss() instead of goBack()
    if (isModal) {
      navigation.dismiss();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: try to navigate to the main tabs
      navigation.navigate('MainTabs');
    }
  };

  // Handle share with complete workflow
  const handleShare = async (video) => {
    try {
      // Track share event
      trackShare(video.id, 'video', 'native');

      // Log analytics event
      console.log('Share initiated from VideoPlayer:', {
        videoId: video.id,
        videoTitle: video.title,
        timestamp: new Date().toISOString(),
        platform: Platform.OS
      });

      // Prepare share content
      const shareUrl = `https://myshortreels.app/reel/${video.id}`;
      const shareMessage = `Check out this amazing video: "${video.title}" by ${video.creator}\n\n${shareUrl}`;

      let shareResult;

      // Use native Share API for better compatibility
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        shareResult = await Share.share({
          message: shareMessage,
          url: shareUrl, // iOS will use this
          title: video.title,
        }, {
          dialogTitle: `Share "${video.title}"`,
          excludedActivityTypes: [
            'com.apple.UIKit.activity.AirDrop', // Exclude AirDrop if needed
          ],
        });
      } else {
        // Fallback for web or other platforms
        if (await Sharing.isAvailableAsync()) {
          shareResult = { action: 'sharedAction' };
          console.log('Fallback sharing method used');
        } else {
          throw new Error('Sharing not available on this platform');
        }
      }

      // Handle share result
      if (shareResult.action === Share.sharedAction) {
        console.log('Share successful from VideoPlayer:', {
          videoId: video.id,
          sharedWith: shareResult.activityType || 'unknown',
          timestamp: new Date().toISOString()
        });
        // No success alert
      } else if (shareResult.action === Share.dismissedAction) {
        console.log('Share cancelled from VideoPlayer:', {
          videoId: video.id,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Share error in VideoPlayer:', error);
      require('../utils/errorReporting').reportErrorAlert('Share Failed', 'Unable to share this video. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video Player</Text>

      </View>

      {/* Video Player Area (Placeholder) */}
      <View style={styles.videoContainer}>
        {video.thumbnail ? (
          <LazyImage
            source={video.isLocal ? video.thumbnail : { uri: video.thumbnail }}
            style={styles.videoThumbnail}
          />
        ) : (
          <View style={[styles.videoThumbnail, { backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="play-circle-outline" size={64} color="#666" />
          </View>
        )}

        {/* Play Button Overlay */}
        <View style={styles.playOverlay}>
          <TouchableOpacity style={styles.largePlayButton}>
            <Ionicons name="play" size={60} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Video Info Overlay */}
        <View style={styles.videoInfoOverlay}>
          <Text style={styles.videoTitle}>{video.title}</Text>
          <Text style={styles.videoCreator}>{video.creator}</Text>

          <View style={styles.videoStats}>
            <View style={styles.statItem}>
              <Ionicons name="eye" size={16} color="#FFFFFF" />
              <Text style={styles.statText}>{video.views ?? 0} views</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={16} color="#FF6B6B" />
              <Text style={styles.statText}>{video.likes ?? 0} likes</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="time" size={16} color="#FFFFFF" />
              <Text style={styles.statText}>{video.duration || '—'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="heart-outline" size={24} color="#FFFFFF" />
          <Text style={styles.actionText}>Like</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
          <Text style={styles.actionText}>Comment</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleShare(video)}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={24} color="#FFFFFF" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleBookmarkToggle}>
          <Ionicons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={24}
            color={isSaved ? "#FFFFFF" : "#FFFFFF"}
          />
          <Text style={styles.actionText}>{isSaved ? 'Saved' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* Note about placeholder */}
      <View style={styles.noteContainer}>
        <Text style={styles.noteText}>
          📱 This is a placeholder video player screen.{'\n'}
          In a real app, this would contain the actual video player with expo-av.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 34, // Same width as back button for centering
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    margin: 20,
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  largePlayButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 5,
  },
  videoInfoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  videoCreator: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 10,
  },
  videoStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginLeft: 5,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  actionButton: {
    alignItems: 'center',
    padding: 10,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 5,
  },
  noteContainer: {
    margin: 20,
    padding: 15,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  noteText: {
    color: '#CCCCCC',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default VideoPlayerScreen; 