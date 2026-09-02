import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DataCacheContext = createContext();

export const useDataCache = () => {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error('useDataCache must be used within a DataCacheProvider');
  }
  return context;
};

export const DataCacheProvider = ({ children }) => {
  const [cache, setCache] = useState({});
  const cacheRef = useRef({});
  const cacheTimestamps = useRef({});
  
  // Cache expiration time (30 minutes)
  const CACHE_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes in milliseconds

  // Update ref when cache changes
  React.useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  // Listen for authentication changes and clear cache when user logs out
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const authToken = await AsyncStorage.getItem('authToken');
        const storedUser = await AsyncStorage.getItem('user');
        
        // If no auth token or user data, clear all cache to prevent User B from accessing User A's data
        if (!authToken || !storedUser) {
          clearAllCache();
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
      }
    };

    // Check auth status every time the component mounts or when app comes to foreground
    checkAuthStatus();
    
    // Set up an interval to periodically check auth status (every 5 seconds)
    const interval = setInterval(checkAuthStatus, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Get cached data
  const getCachedData = useCallback((key) => {
    const cachedItem = cacheRef.current[key];
    if (!cachedItem) return null;

    const now = Date.now();
    if (now - cachedItem.timestamp > CACHE_EXPIRATION_TIME) {
      // Cache expired, remove it
      setCache(prev => {
        const newCache = { ...prev };
        delete newCache[key];
        return newCache;
      });
      return null;
    }

    return cachedItem.data;
  }, []);

  // Set cached data
  const setCachedData = useCallback((key, data) => {
    const timestamp = Date.now();
    setCache(prev => ({
      ...prev,
      [key]: {
        data,
        timestamp
      }
    }));
    cacheTimestamps.current[key] = timestamp;
  }, []);

  // Clear specific cache entry
  const clearCacheEntry = useCallback((key) => {
    setCache(prev => {
      const newCache = { ...prev };
      delete newCache[key];
      return newCache;
    });
    delete cacheTimestamps.current[key];
  }, []);

  // Clear all cache (on logout). Preserve homeData_* so home page (51.json) still loads for guest after skip sign-in.
  const clearAllCache = useCallback(() => {
    setCache(prev => {
      const kept = {};
      Object.keys(prev).forEach(key => {
        if (key.startsWith('homeData_')) kept[key] = prev[key];
      });
      return kept;
    });
    Object.keys(cacheTimestamps.current).forEach(key => {
      if (!key.startsWith('homeData_')) delete cacheTimestamps.current[key];
    });
  }, []);

  // Check if data is cached and not expired
  const isDataCached = useCallback((key) => {
    const cachedItem = cacheRef.current[key];
    if (!cachedItem) return false;

    const now = Date.now();
    return now - cachedItem.timestamp <= CACHE_EXPIRATION_TIME;
  }, []);

  // Clean expired cache entries
  const cleanExpiredCache = useCallback(() => {
    const now = Date.now();
    setCache(prev => {
      const cleanedCache = {};
      Object.keys(prev).forEach(key => {
        const cacheEntry = prev[key];
        if (now - cacheEntry.timestamp <= CACHE_EXPIRATION_TIME) {
          cleanedCache[key] = cacheEntry;
        }
      });
      return cleanedCache;
    });
  }, []);

  const value = {
    getCachedData,
    setCachedData,
    clearCacheEntry,
    clearAllCache,
    isDataCached,
    cleanExpiredCache,
    cache: cacheRef.current
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}; 