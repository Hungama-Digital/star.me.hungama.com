import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import API from '../services/api';
import { useAuth } from './AuthContext';

// Create context for Subscription and Rewards management
const SubscriptionContext = createContext();

// Storage keys for AsyncStorage
const SUBSCRIPTION_STATUS_KEY = '@hungama_subscription_status';

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider = ({ children }) => {
  // Get auth context to check if user is guest / authenticated
  const { isGuestUser, isAuthenticated, user, updateUserProfile } = useAuth();

  // State for subscription
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionReady, setSubscriptionReady] = useState(false);
  /** True only after refreshSubscriptionStatus (or guest/clear path) has completed following auth change. Used by deep link to wait for API before Reels vs Tile Details. */
  const [subscriptionRefreshedAfterAuth, setSubscriptionRefreshedAfterAuth] = useState(false);
  const [isEligibleForSubscription, setIsEligibleForSubscription] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState({
    profileType: null,
    normalizedProfileType: null,
    hasUsedTrial: false,
  });

  // Track if subscription check is in progress to prevent multiple simultaneous calls
  const isCheckingSubscriptionRef = useRef(false);
  /** Single in-flight check; concurrent callers await the same promise so deep link never opens with stale isSubscribed. */
  const subscriptionCheckInFlightRef = useRef(null);
  const [watchedEpisodes, setWatchedEpisodes] = useState(new Map()); // Track episodes watched per series

  // Save subscription status to AsyncStorage
  const saveSubscriptionStatus = useCallback(async (status) => {
    try {
      await AsyncStorage.setItem(SUBSCRIPTION_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      // console.error('Error saving subscription status:', error);
    }
  }, []);

  // Save watched episodes to AsyncStorage
  const saveWatchedEpisodes = useCallback(async (watched) => {
    try {
      // Convert Map to object for proper JSON serialization
      const watchedObject = {};
      watched.forEach((value, key) => {
        watchedObject[key] = Array.from(value);
      });
      await AsyncStorage.setItem('@hungama_watched_episodes', JSON.stringify(watchedObject));
    } catch (error) {
      // console.error('Error saving watched episodes:', error);
    }
  }, []);


  // Method to clear subscription state (called when user logs out)
  const clearSubscriptionState = useCallback(() => {
    setIsSubscribed(false);
    setIsEligibleForSubscription(false)
    setWatchedEpisodes(new Map());
  }, []);

  // Get user ID from AsyncStorage user object or from decoded auth token
  const getUserIdFromStorage = useCallback(async () => {
    try {
      const [storedUser, storedToken] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('authToken'),
      ]);

      let userId = null;

      if (storedUser) {
        const userData = JSON.parse(storedUser);
        // Try multiple possible user ID locations
        userId = userData?.userId ||
          userData?.id ||
          userData?.uid ||
          userData?.user_id ||
          null;
      }

      // Fallback: derive userId from auth token if not present on user object
      if (!userId && storedToken) {
        try {
          const decodedToken = API.decodeJwtToken(storedToken);
          userId = decodedToken?.data?.userId ||
            decodedToken?.userId ||
            decodedToken?.id ||
            decodedToken?.sub ||
            decodedToken?.user_id ||
            null;
        } catch (decodeError) {
          console.error('Error decoding auth token to get user ID:', decodeError);
        }
      }

      return userId;
    } catch (error) {
      console.error('Error getting user ID from storage:', error);
      return null;
    }
  }, []);

  // Check subscription status using new Hungama payment API
  const checkSubscriptionStatus = useCallback(async () => {
    // For guest users, don't check subscription status
    if (isGuestUser) {
      console.log('Guest user detected, skipping subscription status check');
      clearSubscriptionState();
      return { success: true, isSubscribed: false };
    }

    if (subscriptionCheckInFlightRef.current) {
      return await subscriptionCheckInFlightRef.current;
    }

    const run = (async () => {
      try {
        // TODO: Remove this hardcoded user ID for testing - replace with actual user ID from storage
        const userId = await getUserIdFromStorage();
        if (!userId) {
          console.log('No user ID found, skipping subscription status check');
          return { success: false, error: 'User ID not found' };
        }

        isCheckingSubscriptionRef.current = true;

        // Call the new subscription status API (never throws; returns { success: false } on failure)
        const response = await API.checkSubscriptionStatus(userId);

        // API down or failed: use cached subscription so playback is not blocked
        if (!response || response.success === false) {
          isCheckingSubscriptionRef.current = false;
          try {
            const localSubscriptionData = await AsyncStorage.getItem(SUBSCRIPTION_STATUS_KEY);
            if (localSubscriptionData != null) {
              const isLocalSubscribed = JSON.parse(localSubscriptionData);
              setIsSubscribed(!!isLocalSubscribed);
              return { success: true, isSubscribed: !!isLocalSubscribed, fallback: true };
            }
          } catch (e) {
            // ignore parse/storage errors
          }
          return { success: false, error: response?.error || 'API unavailable' };
        }

        const apiPlanName = response?.data?.subscriptions?.plan_name;
        const profileType = response?.data?.profile_app_config?.profile_type;
        const normalizedProfileType = profileType?.toLowerCase()?.trim();
        const isSubscribedResult = normalizedProfileType === 'gold user' ||
          normalizedProfileType === 'gold' ||
          normalizedProfileType === 'golduser';

        if (apiPlanName && user?.subscriptionPlanName !== apiPlanName) {
          if (typeof updateUserProfile === 'function') {
            updateUserProfile({ subscriptionPlanName: apiPlanName }).catch(e => console.warn('Failed to update subscriptionPlanName', e));
          }
        }

        const hasUsedTrial = response?.data?.user?.has_used_trial;

        setIsSubscribed(isSubscribedResult);
        setIsEligibleForSubscription(!hasUsedTrial);
        setSubscriptionDetails({
          profileType,
          normalizedProfileType,
          hasUsedTrial,
        });
        saveSubscriptionStatus(isSubscribedResult);

        console.log('Subscription status check:', {
          profileType,
          normalizedProfileType,
          isSubscribed: isSubscribedResult,
          apiPlanName,
        });

        isCheckingSubscriptionRef.current = false;

        return { success: true, isSubscribed: isSubscribedResult };
      } catch (error) {
        console.error('Error checking subscription status:', error?.message || error);
        isCheckingSubscriptionRef.current = false;

        try {
          const localSubscriptionData = await AsyncStorage.getItem(SUBSCRIPTION_STATUS_KEY);
          if (localSubscriptionData != null) {
            const isLocalSubscribed = JSON.parse(localSubscriptionData);
            setIsSubscribed(!!isLocalSubscribed);
            return { success: true, isSubscribed: !!isLocalSubscribed, fallback: true };
          }
        } catch (e) {
          // ignore parse/storage errors
        }
        return { success: false, error: error?.message || 'Unknown error' };
      }
    })();

    subscriptionCheckInFlightRef.current = run;
    run.finally(() => {
      if (subscriptionCheckInFlightRef.current === run) {
        subscriptionCheckInFlightRef.current = null;
      }
    });

    return await run;
  }, [isGuestUser, getUserIdFromStorage, saveSubscriptionStatus, clearSubscriptionState, updateUserProfile, user?.subscriptionPlanName]);

  // Refresh subscription status from API (kept for backward compatibility)
  const refreshSubscriptionStatus = useCallback(async () => {
    // Use the new checkSubscriptionStatus function
    return await checkSubscriptionStatus();
  }, [checkSubscriptionStatus]);

  // Load subscription data from AsyncStorage and API
  const loadSubscriptionData = useCallback(async () => {
    try {
      if (isGuestUser) {
        console.log('Guest user detected, skipping subscription data loading');
        clearSubscriptionState();
        setSubscriptionReady(true);
        return;
      }

      const [subscriptionData, watchedEpisodesData] = await Promise.all([
        AsyncStorage.getItem(SUBSCRIPTION_STATUS_KEY),
        AsyncStorage.getItem('@hungama_watched_episodes'),
      ]);

      if (subscriptionData) {
        try {
          setIsSubscribed(JSON.parse(subscriptionData));
        } catch (error) {
          setIsSubscribed(false);
        }
      }

      if (watchedEpisodesData) {
        try {
          const parsedData = JSON.parse(watchedEpisodesData);
          if (Array.isArray(parsedData)) {
            setWatchedEpisodes(new Map(parsedData));
          } else if (typeof parsedData === 'object' && parsedData !== null) {
            setWatchedEpisodes(new Map(Object.entries(parsedData)));
          } else {
            setWatchedEpisodes(new Map());
          }
        } catch (error) {
          setWatchedEpisodes(new Map());
        }
      }

      setSubscriptionReady(true);
    } catch (error) {
      console.error('Error loading subscription data:', error);
      setSubscriptionReady(true);
    }
  }, [saveSubscriptionStatus, saveWatchedEpisodes, isGuestUser]);

  // Load data from AsyncStorage on app start
  useEffect(() => {
    loadSubscriptionData();
  }, []); // Remove loadSubscriptionData from dependencies to prevent circular updates

  // Listen for authentication changes and clear/refresh subscription data when auth changes
  useEffect(() => {
    const checkAuthStatus = async () => {
      setSubscriptionRefreshedAfterAuth(false);
      try {
        const authToken = await AsyncStorage.getItem('authToken');
        const storedUser = await AsyncStorage.getItem('user');
        const userType = await AsyncStorage.getItem('userType');

        if (!authToken || !storedUser) {
          clearSubscriptionState();
          setSubscriptionReady(true);
        } else if (userType === 'guest') {
          clearSubscriptionState();
          setSubscriptionReady(true);
        } else {
          await refreshSubscriptionStatus();
          setSubscriptionReady(true);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        setSubscriptionReady(true);
      } finally {
        setSubscriptionRefreshedAfterAuth(true);
      }
    };

    checkAuthStatus();

    // Removed periodic interval check - subscription status should only be checked:
    // 1. After login (OTPVerificationScreen or auth state changes)
    // 2. When user tries to play an asset
    // 3. When user changes navigation
    // 4. When app comes to foreground (handled by AppState listener)
    // No need to check every 30 seconds when user is idle
  }, [isGuestUser, isAuthenticated, user?.uid]);

  // Listen for app state changes to refresh subscription status when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'active') {
        // App has come to the foreground
        try {
          const authToken = await AsyncStorage.getItem('authToken');
          const storedUser = await AsyncStorage.getItem('user');
          const userType = await AsyncStorage.getItem('userType');

          if (authToken && storedUser) {
            if (userType === 'guest') {
              // Guest user, clear subscription state
              clearSubscriptionState();
            } else {
              // Authenticated user, refresh subscription status
              await refreshSubscriptionStatus();
            }
          }
        } catch (error) {
          console.error('Error refreshing subscription on app state change:', error);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, []); // Remove dependencies to prevent circular updates

  // Track episode watched
  const markEpisodeWatched = useCallback((seriesId, episodeId) => {
    if (!seriesId || !episodeId) {
      return;
    }
    setWatchedEpisodes(prev => {
      try {
        const newMap = new Map(prev);
        const existingEpisodes = newMap.get(seriesId);
        const seriesEpisodes = new Set(existingEpisodes || []);
        seriesEpisodes.add(episodeId);
        newMap.set(seriesId, seriesEpisodes);
        saveWatchedEpisodes(newMap);
        return newMap;
      } catch (error) {
        console.error('Error in markEpisodeWatched:', error);
        return prev; // Return previous state if there's an error
      }
    });
  }, [saveWatchedEpisodes]);

  // Get number of episodes watched for a series
  const getEpisodesWatched = useCallback((seriesId) => {
    const seriesEpisodes = watchedEpisodes.get(seriesId);
    return seriesEpisodes && seriesEpisodes.size ? seriesEpisodes.size : 0;
  }, [watchedEpisodes]);

  // Subscribe user
  const subscribeUser = useCallback(async (planData = null) => {
    try {
      // For demo purposes, just activate local subscription
      // In a real app, you would call the subscription API here
      setIsSubscribed(true);
      saveSubscriptionStatus(true);
      return { success: true, message: 'Subscription activated successfully' };
    } catch (error) {
      console.error('Error in subscribeUser:', error);
      // Fallback to local subscription for demo
      setIsSubscribed(true);
      saveSubscriptionStatus(true);
      return { success: true, message: 'Subscription activated (demo mode)' };
    }
  }, [saveSubscriptionStatus]);

  // Unsubscribe user
  const unsubscribeUser = useCallback(async (orderId, productId) => {
    try {
      const userId = await getUserIdFromStorage();
      if (!userId) {
        return { success: false, message: 'User ID not found' };
      }
      const response = await API.cancelSubscription(orderId, userId, productId);
      if (response.success) {
        await refreshSubscriptionStatus();
        return {
          success: true,
          message: response?.data?.message || 'Subscription cancelled successfully',
          data: response?.data,
        };
      }
      return {
        success: false,
        message: response?.data?.message || 'Failed to cancel subscription. Please try again.',
      };
    } catch (error) {
      console.error('Error in unsubscribeUser:', error);
      return { success: false, message: 'An unexpected error occurred. Please try again.' };
    }
  }, [getUserIdFromStorage, refreshSubscriptionStatus]);

  // Reset all subscription data (for testing)
  const resetSubscriptionData = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(SUBSCRIPTION_STATUS_KEY),
        AsyncStorage.removeItem('@hungama_watched_episodes'),
      ]);
      setIsSubscribed(false);
      setWatchedEpisodes(new Map());
    } catch (error) {
      console.error('Error resetting subscription data:', error);
    }
  }, []);

  const value = useMemo(() => ({
    // Subscription state
    isSubscribed,
    subscriptionReady,
    subscriptionRefreshedAfterAuth,
    isEligibleForSubscription,
    subscriptionDetails,
    subscribeUser,
    unsubscribeUser,
    resetSubscriptionData,
    clearSubscriptionState,
    watchedEpisodes,
    markEpisodeWatched,
    getEpisodesWatched,
    refreshSubscriptionStatus,
    checkSubscriptionStatus,
  }), [
    isSubscribed,
    subscriptionReady,
    subscriptionRefreshedAfterAuth,
    isEligibleForSubscription,
    subscriptionDetails,
    subscribeUser,
    unsubscribeUser,
    resetSubscriptionData,
    clearSubscriptionState,
    watchedEpisodes,
    markEpisodeWatched,
    getEpisodesWatched,
    refreshSubscriptionStatus,
    checkSubscriptionStatus,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export default SubscriptionProvider;
