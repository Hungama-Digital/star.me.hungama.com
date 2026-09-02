import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../services/api';
import { useAuth } from './AuthContext';

// Context for managing asset favourites (likes)
const FavouritesContext = createContext();

// Storage key for AsyncStorage
const FAVOURITES_KEY = '@hungama_favorites';

export const useFavourites = () => {
  const context = useContext(FavouritesContext);
  if (!context) {
    throw new Error('useFavourites must be used within a FavouritesProvider');
  }
  return context;
};

export const FavouritesProvider = ({ children }) => {
  const [favouriteAssets, setFavouriteAssets] = useState(new Set());
  const { user, isGuestUser } = useAuth();

  // Load favourites from AsyncStorage on app start
  useEffect(() => {
    const loadFavourites = async () => {
      try {
        const stored = await AsyncStorage.getItem(FAVOURITES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setFavouriteAssets(new Set(parsed.map(String)));
          }
        }
      } catch (error) {
        console.error('Error loading favourites from storage:', error);
      }
    };

    loadFavourites();
  }, []);

  // Helper to persist current favourites to storage
  const saveFavouritesToStorage = useCallback(async (assetSet) => {
    try {
      await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify([...assetSet]));
    } catch (error) {
      console.error('Error saving favourites to storage:', error);
    }
  }, []);

  // Clear favourites state (used on logout)
  const clearFavouritesState = useCallback(() => {
    setFavouriteAssets(new Set());
  }, []);

  // Listen for authentication changes and:
  // - clear favourites on logout / guest
  // - fetch favourites from backend on login (using getAssetFavourites)
  useEffect(() => {
    const syncWithAuthAndBackend = async () => {
      try {
        // If no authenticated user or guest -> clear favourites
        const authToken = await AsyncStorage.getItem('authToken');
        if (!user || isGuestUser || !authToken) {
          clearFavouritesState();
          await AsyncStorage.removeItem(FAVOURITES_KEY);
          return;
        }

        // Authenticated user: fetch favourites from backend once
        try {
          const response = await API.getAssetFavourites({
            start: 0,
            limit: 500,
            type: 1, // likes
          });

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

          const favouritesData =
            decodedResponse?.data?.data ||
            decodedResponse?.data ||
            decodedResponse ||
            [];

          const nextSet = new Set();
          if (Array.isArray(favouritesData)) {
            favouritesData.forEach((item) => {
              const favAssetId = item?.assetId || item?.id || item?.path;
              if (favAssetId != null) {
                nextSet.add(String(favAssetId));
              }
            });
          }

          setFavouriteAssets(nextSet);
          await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify([...nextSet]));
        } catch (error) {
          console.error('Error fetching favourites from backend:', error);
        }
      } catch (error) {
        console.error('Error syncing favourites with auth state:', error);
      }
    };

    syncWithAuthAndBackend();
  }, [user, isGuestUser, clearFavouritesState]);

  const addFavourite = useCallback((assetId) => {
    if (!assetId) return;
    setFavouriteAssets(prevSet => {
      const next = new Set(prevSet);
      next.add(String(assetId));
      saveFavouritesToStorage(next);
      return next;
    });
  }, [saveFavouritesToStorage]);

  const removeFavourite = useCallback((assetId) => {
    if (!assetId) return;
    setFavouriteAssets(prevSet => {
      const next = new Set(prevSet);
      next.delete(String(assetId));
      saveFavouritesToStorage(next);
      return next;
    });
  }, [saveFavouritesToStorage]);

  const isFavourite = useCallback((assetId) => {
    if (!assetId) return false;
    return favouriteAssets.has(String(assetId));
  }, [favouriteAssets]);

  const getFavouriteIds = useCallback(() => {
    return Array.from(favouriteAssets);
  }, [favouriteAssets]);

  const clearFavourites = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(FAVOURITES_KEY);
      setFavouriteAssets(new Set());
    } catch (error) {
      console.error('Error clearing favourites:', error);
    }
  }, []);

  const value = useMemo(() => ({
    favouriteAssets,
    addFavourite,
    removeFavourite,
    isFavourite,
    getFavouriteIds,
    clearFavourites,
    clearFavouritesState,
  }), [
    favouriteAssets,
    addFavourite,
    removeFavourite,
    isFavourite,
    getFavouriteIds,
    clearFavourites,
    clearFavouritesState,
  ]);

  return (
    <FavouritesContext.Provider value={value}>
      {children}
    </FavouritesContext.Provider>
  );
};

