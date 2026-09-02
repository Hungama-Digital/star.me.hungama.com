import { useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

/**
 * Custom hook to handle subscription status refresh after authentication
 * This hook automatically refreshes subscription status when a user logs in
 */
export const useSubscriptionRefresh = () => {
  const { isAuthenticated, user } = useAuth();
  const { refreshSubscriptionStatus } = useSubscription();

  const refreshSubscription = useCallback(async () => {
    if (isAuthenticated && user) {
      try {
        const result = await refreshSubscriptionStatus();
        if (!result.success) {
          console.warn('Failed to refresh subscription status:', result.error);
        }
        return result;
      } catch (error) {
        console.error('Error refreshing subscription status:', error);
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'User not authenticated' };
  }, [isAuthenticated, user, refreshSubscriptionStatus]);

  // Automatically refresh subscription status when user authenticates
  // Disabled to prevent duplicate calls - subscription is checked in OTPVerificationScreen after login
  // useEffect(() => {
  //   if (isAuthenticated && user) {
  //     // Small delay to ensure auth context is fully settled
  //     const timer = setTimeout(() => {
  //       refreshSubscription();
  //     }, 1000);
  //     
  //     return () => clearTimeout(timer);
  //   }
  // }, [isAuthenticated, user]); // Remove refreshSubscription from dependencies to prevent circular updates

  return {
    refreshSubscription,
    isAuthenticated,
    user
  };
}; 