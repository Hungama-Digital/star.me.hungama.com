import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  BackHandler,
  Alert,
  Image,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieLoader from '../components/LottieLoader';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import FeedGrid from '../components/FeedGrid';
import API from '../services/api';
import { useMyList } from '../context/MyListContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const MyListScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const { removeSeriesFromMyList, myListVersion } = useMyList();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myListSeries, setMyListSeries] = useState([]);
  const fromProfile = route?.params?.fromProfile === true;

  // Refresh when context watchlist version changes
  useEffect(() => {
    if (!loading) {
      // Only refresh if we're not in initial load
      fetchMyList();
    }
  }, [myListVersion]);

  const handleBack = useCallback(() => {
    const tabNav = navigation.getParent?.();
    if (fromProfile) {
      if (tabNav?.navigate && typeof tabNav.navigate === 'function') {
        tabNav.navigate('Profile');
      } else {
        navigation.dispatch(
          CommonActions.navigate({
            name: 'MainTabs',
            params: { screen: 'Profile' },
          })
        );
      }
    } else {
      // Opened from footer/tab bar: back should go to Home
      if (tabNav?.navigate && typeof tabNav.navigate === 'function') {
        tabNav.navigate('Home');
      } else {
        navigation.goBack();
      }
    }
  }, [fromProfile, navigation]);

  // Handle back button press - navigate back (to Profile if opened from Profile menu)
  useEffect(() => {
    const backAction = () => {
      handleBack();
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [handleBack]);

  // Fetch favorites from API
  const fetchMyList = useCallback(async () => {
    setRefreshing(true);
    try {
      // Get userId from auth context
      const userId = user?.userId || user?.uid || 57; // Fallback to 57 if no user data

      // Call getAssetGroupWatchlist API to fetch user's watchlist series


      const response = await API.getAssetGroupWatchlist({
        userId: userId,
      });

      // Decode the JWT response if needed
      const decodedData = API.decodeJwtToken(response);

      // Extract the series data from the response

      let seriesData = [];

      // Try multiple possible response structures
      if (decodedData?.success && decodedData?.data?.data && Array.isArray(decodedData.data.data)) {
        seriesData = decodedData.data.data;

      } else if (decodedData?.data && Array.isArray(decodedData.data)) {
        seriesData = decodedData.data;

      } else if (decodedData && Array.isArray(decodedData)) {
        seriesData = decodedData;

      } else if (response?.data && Array.isArray(response.data)) {
        seriesData = response.data;

      } else if (response && Array.isArray(response)) {
        seriesData = response;
      }

      // Map API response data to the format expected by MyListSeriesThumbnail component
      const mappedSeriesData = seriesData.map(series => {
        // Log available fields for debugging
        console.log('MyListScreen: Series item fields:', {
          title: series.title,
          contentType: series.contentType,
          genre: series.genre,
          label: series.label,
          availableFields: Object.keys(series)
        });

        // Try multiple possible episode count fields
        const episodeCount = series.assetCount || series.episodeCount || series.totalEpisodes || series.episodes || 0;

        return {
          trailer_url: series?.trailer_url || series?.trailerUrl,
          trailerUrl: series?.trailer_url || series?.trailerUrl,
          preview_url: series?.preview_url || series?.previewUrl || series?.trailer_url || series?.trailerUrl,
          previewUrl: series?.preview_url || series?.previewUrl || series?.trailer_url || series?.trailerUrl,
          videoUrl: series?.videoUrl,
          hlsUrl: series?.hlsUrl || series?.videoUrl,
          id: series.path, // Use path as the series ID
          title: series.title,
          description: series.description,
          thumbnail: series.verticalFilePath || series.horizontalFilePath || series.vodOrLivePosterImageFilePath, // Use correct thumbnail priority
          totalEpisodes: episodeCount, // Use the best available episode count
          genre: series.genre || series.content_genre, // Only use API-provided data, no fallback
          likeCount: series.likeCount || 0,
          isUserLikes: series.isUserLikes === '1',
          favouriteType: series.favouriteType,
          // Additional fields from API response
          path: series.path,
          verticalFilePath: series.verticalFilePath,
          horizontalFilePath: series.horizontalFilePath,
          assetCount: series.assetCount,
          contentType: series.contentType,
          airStartDate: series.airStartDate,
          airEndDate: series.airEndDate,
          seoTitle: series.seoTitle,
          seoKeyword: series.seoKeyword,
          seoDescription: series.seoDescription,
          agdlmId: series.agdlmId,
          deviceName: series.deviceName,
          verticalFileName: series.verticalFileName,
          thumbFilePath: series.thumbFilePath,
          horizontalFileName: series.horizontalFileName,
          langaugeId: series.langaugeId,
          langaugeName: series.langaugeName,
          langaugeCode: series.langaugeCode,
          dtypeId: series.dtypeId,
          langId: series.langId,
          label: series.label,
          uploadVerticalImage: series.uploadVerticalImage,
          uploadHorizontalImage: series.uploadHorizontalImage,
          isVisible: series.isVisible,
          isCarouselApplicable: series.isCarouselApplicable,
          orderBy: series.orderBy,
          sorting: series.sorting,
          assetCategoryCount: series.assetCategoryCount,
          ratingCount: series.ratingCount,
          totalRating: series.totalRating,
          userTotalRating: series.userTotalRating,
          averageRating: series.averageRating,
          type: series.type
        };
      });



      setMyListSeries(mappedSeriesData);

    } catch (error) {
      console.error('Failed to fetch asset group favourites:', error);
      setMyListSeries([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // Refresh data when user navigates to My List tab
  useFocusEffect(
    useCallback(() => {
      // Fetch immediately when screen comes into focus
      fetchMyList();
    }, [fetchMyList])
  );

  // Handle series press - if subscribed go to Reels, else TileDetails (same as Home screen)
  const handleSeriesPress = useCallback((series) => {
    const asset = {
      ...series,
      path: series.path || series.id,
      title: series.title || series.label,
      label: series.label || series.title,
      seriesId: series.id || series.path?.toString(),
      assetGroupId: series.agdlmId,
      verticalFilePath: series.verticalFilePath || series.thumbnail,
      horizontalFilePath: series.horizontalFilePath || series.thumbnail,
      description: series.description,
    };
    const path = asset.path ?? asset.id;
    const seriesData = {
      title: asset.title,
      id: asset.id ?? asset.path,
      poster: asset.thumbFilePath,
      geners: asset.genre,
    };
    const reelsParams = {
      initialIndex: 0,
      isSeries: true,
      isForYouPage: false,
      skipApiCall: false,
      playback_source: 'my_list',
      path,
      seriesData,
    };
    if (isSubscribed) {
      if (navigation.push) {
        navigation.push('Reels', reelsParams);
      } else {
        navigation.navigate('Reels', reelsParams);
      }
    } else {
      if (navigation.push) {
        navigation.push('TileDetails', { asset });
      } else {
        navigation.navigate('TileDetails', { asset });
      }
    }
  }, [navigation, isSubscribed]);

  // Handle remove from watchlist
  const handleRemoveFromList = useCallback(async (item) => {
    try {
      // Get userId from auth context
      const userId = user?.userId || user?.uid || 57;

      // Call API to remove from watchlist
      const response = await API.deleteAssetGroupWatchlist({
        userId: userId,
        assetgroupIds: [item.path || item.id || item.agdlmId],
      });

      console.log('Delete API response:', response);

      // Check if the delete operation was successful
      if (response && (response.success !== false)) {
        // Remove from local state
        setMyListSeries(prev => prev.filter(series =>
          (series.path || series.id || series.agdlmId) !== (item.path || item.id || item.agdlmId)
        ));

        // Also remove from MyListContext if item has an id
        if (item.id || item.path) {
          removeSeriesFromMyList(item.id || item.path);
        }
      } else {
        require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to remove from watchlist. Please try again.');
      }
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to remove from watchlist. Please try again.');
    }
  }, [user, removeSeriesFromMyList]);

  // Handle refresh
  const onRefresh = useCallback(() => {
    fetchMyList();
  }, [fetchMyList]);

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>Nothing saved yet</Text>
      <Text style={styles.emptyStateText}>
        Add shows to your list and watch anytime.
      </Text>
      <TouchableOpacity
        style={styles.goHomeButton}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={['#FFFFFF', '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.goHomeButtonGradient}
        >
          <Image
            source={require('../../assets/HomeBlack.png')}
            style={styles.buttonIcon}
          />
          <Text style={styles.goHomeButtonText}>Go to Home</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />

      {/* Content */}
      {loading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <LottieLoader size="large" />
        </View>
      ) : myListSeries.length > 0 ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFFFFF"
              colors={["#FFFFFF"]}
            />
          }
        >
          {/* Header with Back Button and Centered Title */}
          <View
            style={[
              styles.header,
              { paddingTop: Platform.OS === "android" ? insets.top + 20 : 20 },
            ]}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>My List</Text>
            </View>
            <View style={styles.headerPlaceholder} />
          </View>

          {/* My List Section - Using FeedGrid (display type 1) */}
          <View style={styles.myListSection}>
            <FeedGrid
              feedData={myListSeries}
              onItemPress={handleSeriesPress}
              showRemoveIcon={true}
              onRemovePress={handleRemoveFromList}
            />
          </View>

          {/* Explore More Button */}
          <View style={styles.exploreMoreContainer}>
            <TouchableOpacity
              style={styles.exploreMoreButton}
              onPress={() =>
                navigation.navigate("MainTabs", { screen: "Home" })
              }
              activeOpacity={0.9}
            >
              <Image
                source={require("../../assets/footer/Home.png")}
                style={styles.buttonIcon}
              />
              <Text style={styles.exploreMoreText}>Explore Shows</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFFFFF"
              colors={["#FFFFFF"]}
            />
          }
        >
          <View
            style={[
              styles.header,
              { paddingTop: Platform.OS === "android" ? insets.top + 20 : 20 },
            ]}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>My List</Text>
            </View>
            <View style={styles.headerPlaceholder} />
          </View>
          {renderEmptyState()}
        </ScrollView>
      )}
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
  headerTitle: {
    fontFamily: 'Product Sans',
    fontSize: 21,
    fontWeight: 700,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    marginLeft: 20,
    padding: 4,
  },
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  myListSection: {
    // marginTop: 10,
  },
  exploreMoreContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignContent: 'center'
  },
  exploreMoreButton: {
    backgroundColor: '#2A2A2A', // Dark gray matching the design
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 200,
  },
  exploreMoreIcon: {
    marginRight: 8,
  },
  exploreMoreText: {
    fontFamily: 'Product Sans',
    fontSize: 15,
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 1)',
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
    maxWidth: 186,
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

export default MyListScreen; 