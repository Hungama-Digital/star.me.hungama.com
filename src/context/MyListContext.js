import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../services/api';
import { useAuth } from './AuthContext';

// Create context for My List management
const MyListContext = createContext();

// Storage keys for AsyncStorage
const MY_LIST_KEY = '@hungama_my_list';
const LAST_WATCHED_KEY = '@hungama_last_watched';

export const useMyList = () => {
  const context = useContext(MyListContext);
  if (!context) {
    throw new Error('useMyList must be used within a MyListProvider');
  }
  return context;
};

export const MyListProvider = ({ children }) => {
  // State for series in My List
  const [myListSeries, setMyListSeries] = useState(new Set());

  // Version to trigger re-renders when watchlist changes
  const [myListVersion, setMyListVersion] = useState(0);

  // State for last watched episode for each series
  const [lastWatchedEpisodes, setLastWatchedEpisodes] = useState({});

  const { user, isGuestUser } = useAuth();

  // Load data from AsyncStorage on app start
  useEffect(() => {
    loadMyListData();
  }, []);

  // Listen for authentication changes:
  // - On login: fetch My List from backend and sync local state
  // - On logout / guest: clear local state
  // This mirrors FavouritesContext backend sync, fixing save button state not reflecting backend data.
  useEffect(() => {
    const syncWithBackend = async () => {
      try {
        const authToken = await AsyncStorage.getItem('authToken');
        const userId = user?.userId || user?.uid || null;

        if (!user || isGuestUser || !authToken || !userId) {
          // Logged out or guest — clear state and storage
          clearMyListState();
          await AsyncStorage.removeItem(MY_LIST_KEY);
          return;
        }

        // Authenticated user: fetch My List from backend once
        try {
          const response = await API.getAssetGroupWatchlist({ userId });

          let decodedResponse = response;
          try {
            if (typeof API.decodeJWTToken === 'function') {
              decodedResponse = API.decodeJWTToken(response);
            } else if (typeof API.decodeJwtToken === 'function') {
              decodedResponse = API.decodeJwtToken(response);
            } else if (typeof response === 'string') {
              decodedResponse = JSON.parse(response);
            }
          } catch {
            decodedResponse = response;
          }

          // Extract the array of watchlist items — same resolution order as MyListScreen
          const watchlistData =
            decodedResponse?.data?.data ||
            decodedResponse?.data ||
            decodedResponse ||
            [];

          const nextSet = new Set();
          if (Array.isArray(watchlistData)) {
            watchlistData.forEach((item) => {
              // MyListScreen maps id = series.path, so we use path as the primary key.
              // Also store agdlmId and id as fallbacks to cover all save-key variations.
              const keys = [
                item?.path,
                item?.agdlmId != null ? String(item.agdlmId) : null,
                item?.id,
              ].filter(Boolean);
              keys.forEach((k) => nextSet.add(String(k)));
            });
          }

          setMyListSeries(nextSet);
          setMyListVersion(v => v + 1);
          await AsyncStorage.setItem(MY_LIST_KEY, JSON.stringify([...nextSet]));
        } catch (error) {
          console.error('Error fetching My List from backend:', error);
          // Fall back to whatever is in AsyncStorage (loaded separately on mount)
        }
      } catch (error) {
        console.error('Error syncing My List with auth state:', error);
      }
    };

    syncWithBackend();
  }, [user, isGuestUser]);

  // Method to clear MyList state (called when user logs out)
  const clearMyListState = useCallback(() => {
    setMyListSeries(new Set());
    setLastWatchedEpisodes({});
  }, []);

  // Load My List and last watched data from AsyncStorage
  const loadMyListData = useCallback(async () => {
    try {
      const [myListData, lastWatchedData] = await Promise.all([
        AsyncStorage.getItem(MY_LIST_KEY),
        AsyncStorage.getItem(LAST_WATCHED_KEY),
      ]);

      if (myListData) {
        setMyListSeries(new Set(JSON.parse(myListData)));
      }

      if (lastWatchedData) {
        setLastWatchedEpisodes(JSON.parse(lastWatchedData));
      }
    } catch (error) {
      console.error('Error loading My List data:', error);
    }
  }, []);

  // Save My List to AsyncStorage
  const saveMyListToStorage = useCallback(async (seriesSet) => {
    try {
      await AsyncStorage.setItem(MY_LIST_KEY, JSON.stringify([...seriesSet]));
    } catch (error) {
      console.error('Error saving My List:', error);
    }
  }, []);

  // Save last watched episodes to AsyncStorage
  const saveLastWatchedToStorage = useCallback(async (episodes) => {
    try {
      await AsyncStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(episodes));
    } catch (error) {
      console.error('Error saving last watched episodes:', error);
    }
  }, []);

  // Add series to My List (adds entire series when any episode is added)
  const addSeriesToMyList = useCallback(async (seriesId, userId) => {
    const idStr = String(seriesId);
    // 1. Optimistic Update
    setMyListSeries(prevSet => {
      const newSet = new Set(prevSet);
      newSet.add(idStr);
      saveMyListToStorage(newSet);
      return newSet;
    });
    setMyListVersion(v => v + 1); // Trigger re-render

    // 2. Call API
    if (userId) {
      try {
        await API.assetgroupwatchlist({ userId, assetGroupId: idStr });
        return { success: true };
      } catch (error) {
        console.error('Failed to add to watchlist:', error);
        // 3. Rollback on error
        setMyListSeries(prevSet => {
          const newSet = new Set(prevSet);
          newSet.delete(idStr);
          saveMyListToStorage(newSet);
          return newSet;
        });
        setMyListVersion(v => v + 1); // Trigger re-render
        return { success: false, error };
      }
    }
    return { success: true }; // Allow local-only if no user (though UI should block)
  }, [saveMyListToStorage]);

  // Remove series from My List
  const removeSeriesFromMyList = useCallback(async (seriesId, userId) => {
    const idStr = String(seriesId);
    // 1. Optimistic Update
    setMyListSeries(prevSet => {
      const newSet = new Set(prevSet);
      newSet.delete(idStr);
      saveMyListToStorage(newSet);
      return newSet;
    });
    setMyListVersion(v => v + 1); // Trigger re-render

    // Also remove last watched data for this series
    setLastWatchedEpisodes(prev => {
      const newEpisodes = { ...prev };
      delete newEpisodes[idStr];
      saveLastWatchedToStorage(newEpisodes);
      return newEpisodes;
    });

    // 2. Call API
    if (userId) {
      try {
        await API.deleteAssetGroupWatchlist({ userId, assetgroupIds: [idStr] });
        return { success: true };
      } catch (error) {
        console.error('Failed to remove from watchlist:', error);
        // 3. Rollback on error
        setMyListSeries(prevSet => {
          const newSet = new Set(prevSet);
          newSet.add(idStr);
          saveMyListToStorage(newSet);
          return newSet;
        });
        setMyListVersion(v => v + 1); // Trigger re-render
        return { success: false, error };
      }
    }
    return { success: true };
  }, [saveMyListToStorage, saveLastWatchedToStorage]);

  // Check if series is in My List
  const isSeriesInMyList = useCallback((seriesId) => {
    return myListSeries.has(String(seriesId));
  }, [myListSeries]);

  // Update last watched episode for a series
  const updateLastWatchedEpisode = useCallback((seriesId, episodeIndex) => {
    setLastWatchedEpisodes(prev => {
      // Only update if the episode index is different
      if (prev[seriesId] === episodeIndex) {
        return prev;
      }
      const newEpisodes = {
        ...prev,
        [seriesId]: episodeIndex,
      };
      saveLastWatchedToStorage(newEpisodes);
      return newEpisodes;
    });
  }, [saveLastWatchedToStorage]);

  // Get last watched episode for a series
  const getLastWatchedEpisode = useCallback((seriesId) => {
    return lastWatchedEpisodes[seriesId] || 0; // Default to episode 0 (first episode)
  }, [lastWatchedEpisodes]);

  // Get all series IDs in My List
  const getMyListSeriesIds = useCallback(() => {
    return Array.from(myListSeries);
  }, [myListSeries]);

  // Clear all My List data (for testing/reset purposes)
  const clearMyList = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(MY_LIST_KEY),
        AsyncStorage.removeItem(LAST_WATCHED_KEY),
      ]);
      setMyListSeries(new Set());
      setLastWatchedEpisodes({});
    } catch (error) {
      console.error('Error clearing My List:', error);
    }
  }, []);

  const value = useMemo(() => ({
    myListSeries,
    myListVersion,
    lastWatchedEpisodes,
    addSeriesToMyList,
    removeSeriesFromMyList,
    isSeriesInMyList,
    updateLastWatchedEpisode,
    getLastWatchedEpisode,
    getMyListSeriesIds,
    clearMyList,
    clearMyListState,
  }), [
    myListSeries,
    myListVersion,
    lastWatchedEpisodes,
    addSeriesToMyList,
    removeSeriesFromMyList,
    isSeriesInMyList,
    updateLastWatchedEpisode,
    getLastWatchedEpisode,
    getMyListSeriesIds,
    clearMyList,
    clearMyListState,
  ]);

  return (
    <MyListContext.Provider value={value}>
      {children}
    </MyListContext.Provider>
  );
}; 