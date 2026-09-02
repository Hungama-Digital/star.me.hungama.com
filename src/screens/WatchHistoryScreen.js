import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Platform,
  BackHandler
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieLoader from '../components/LottieLoader';
import { useFocusEffect } from '@react-navigation/native';
import WatchHistoryGrid from '../components/WatchHistoryGrid';
import { useWatchHistory } from '../context/WatchHistoryContext';
import { useSubscription } from '../context/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';

const WatchHistoryScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { watchHistory, loading, fetchWatchHistory, removeFromHistory } = useWatchHistory();
  const { isSubscribed } = useSubscription();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Refresh data when user navigates to tab
  useFocusEffect(
    useCallback(() => {
      fetchWatchHistory();
    }, [fetchWatchHistory])
  );

  const enterSelectionMode = useCallback(() => setSelectionMode(true), []);
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  // Handle hardware back button
  useEffect(() => {
    const backAction = () => {
      if (selectionMode) {
        exitSelectionMode();
        return true;
      }
      navigation.goBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [navigation, selectionMode, exitSelectionMode]);

  // Handle item press
  const handleItemPress = useCallback((item) => {
    const asset = {
      ...item,
      path: item.path || item.id,
      title: item.title || item.label,
      label: item.label || item.title,
      // For watch history, usually we want to resume or play
      // Ensure specific playback fields are present
      videoUrl: item.videoUrl || item.hlsUrl || item.assetUrl,
      hlsUrl: item.hlsUrl || item.videoUrl || item.assetUrl,

      // Ensure images
      verticalFilePath: item.verticalFilePath || item.thumbnail,
      horizontalFilePath: item.horizontalFilePath || item.thumbnail,
      description: item.description,
      poster:
        item.verticalFilePath ??
        item.posterImage ??
        item.imageUrl ??
        item.thumbnail ??
        item.horizontalFilePath,
    };

    if (isSubscribed) {
      // If subscribed, go directly to Reels to play
      navigation.navigate('Reels', {
        path: item.assetGroupId || item.path, // Use Group ID (Series ID) if available, else video path
        episodeId: item.last_watched_asset_id || item.assetId || item.id || item.path, // Specific video ID to play (resume if available)
        resumeTime: item.last_watched_asset_duration || 0, // Pass resume duration from history API
        seriesData: asset, // Pass asset data
        playback_source: 'watch_history',
        forcePlay: true // Indicate intent to play immediately
      });
    } else {
      // If not subscribed, go to TileDetails (freemium flow)
      if (navigation.push) {
        navigation.push('TileDetails', { asset });
      } else {
        navigation.navigate('TileDetails', { asset });
      }
    }
  }, [navigation, isSubscribed]);

  const getItemId = useCallback((item) =>
    item?.assetGroupId || item?.id || item?.path || item?.assetId
  , []);

  const handleToggleSelect = useCallback((item) => {
    const id = getItemId(item);
    if (!id) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, [getItemId]);

  const handleRemoveSelected = useCallback(() => {
    (selectedIds || []).forEach((id) => removeFromHistory(id));
    exitSelectionMode();
  }, [selectedIds, removeFromHistory, exitSelectionMode]);

  const renderEmptyState = () => (
    <>
      <View style={[styles.header, { paddingTop: Platform.OS === "android" ? insets.top + 20 : 20 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Watch History</Text>
        </View>
        <View style={styles.headerPlaceholder} />
      </View>
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateTitle}>No Watch History</Text>
        <Text style={styles.emptyStateText}>
          Your recently watched episodes will appear here
        </Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />

      {loading && watchHistory.length === 0 ? (
        <View style={styles.loadingContainer}>
          <LottieLoader size="large" />
        </View>
      ) : watchHistory.length > 0 ? (
        <>
          <View style={[styles.header, { paddingTop: Platform.OS === "android" ? insets.top + 20 : 20 }]}>
            {selectionMode ? (
              <>
                <View style={styles.headerPlaceholder} />
                <View style={styles.headerTitleContainer}>
                  <Text style={styles.headerTitle}>Choose</Text>
                </View>
                <TouchableOpacity
                  style={styles.filterButton}
                  onPress={exitSelectionMode}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                  <Text style={styles.headerTitle}>Watch History</Text>
                </View>
                <TouchableOpacity
                  style={styles.filterButton}
                  onPress={enterSelectionMode}
                  activeOpacity={0.8}
                >
                  <Svg width={22} height={22} viewBox="0 0 34 34" fill="none">
                    <Path d="M17.2266 13.4364H23.5177" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
                    <Path d="M17.2266 19.959H23.5177" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
                    <Circle cx={12.2821} cy={19.959} r={1.80165} stroke="white" strokeWidth={1.5} strokeLinecap="round" />
                    <Path d="M10.4805 13.4252L11.6897 14.6334L14.0838 12.2394" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>
              </>
            )}
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              selectionMode && { paddingBottom: 100 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.listSection}>
              <WatchHistoryGrid
                data={watchHistory}
                onItemPress={handleItemPress}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
              />
            </View>
          </ScrollView>

          {selectionMode && (
            <View style={[styles.removeButtonWrapper, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity
                style={[
                  styles.removeButton,
                  (selectedIds?.length || 0) === 0 && styles.removeButtonDisabled,
                ]}
                onPress={() => (selectedIds?.length || 0) > 0 && handleRemoveSelected()}
                activeOpacity={0.8}
                disabled={(selectedIds?.length || 0) === 0}
              >
                <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
                <Text style={styles.removeButtonText}>Remove from history</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <>
          {renderEmptyState()}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPlaceholder: {
    width: 32,
  },
  filterButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#000000',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  removeButtonDisabled: {
    opacity: 0.5,
  },
  removeButtonText: {
    fontFamily: 'Product Sans',
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerTitle: {
    fontFamily: 'Product Sans',
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  listSection: {
    minHeight: 200,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  goHomeButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 250,
    alignSelf: 'center',
  },
  goHomeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  buttonIcon: {
    marginRight: 10,
    width: 20,
    height: 20,
  },
  goHomeButtonText: {
    color: '#000000',
    fontFamily: 'Product Sans',
    fontSize: 15,
    fontWeight: 700,
  },
});

export default WatchHistoryScreen;
