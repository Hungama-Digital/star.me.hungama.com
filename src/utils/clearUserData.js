import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Comprehensive function to clear all user-specific data when logging out
 * This prevents User B from accessing User A's data including premium features
 */
export const clearAllUserData = async () => {
  try {
    // Get all AsyncStorage keys
    const allKeys = await AsyncStorage.getAllKeys();
    
    // Filter keys that are user-specific and should be cleared on logout
    const userSpecificKeys = allKeys.filter(key => 
      // Hungama app keys (including subscription status)
      key.includes('@hungama_') ||
      // User authentication keys
      key.includes('user') ||
      key.includes('auth') ||
      key.includes('token') ||
      // Premium feature keys (including subscription status)
      key.includes('premium') ||
      key.includes('coins') ||
      key.includes('watched') ||
      key.includes('history') ||
      key.includes('favorites') ||
      key.includes('mylist') ||
      // Rating and app interaction keys (user-specific)
      key.includes('rate_app') ||
      key.includes('rating') ||
      // Cache keys that might contain user data
      key.includes('cache') ||
      key.includes('api_') ||
      // Any other keys that might be user-specific
      key.includes('profile') ||
      key.includes('settings') ||
      // Guest user specific keys
      key.includes('guest') ||
      // Subscription specific keys
      key.includes('subscription') ||
      key.includes('earning_methods') ||
      key.includes('watch_ad_count')
    );
    
    // Remove all user-specific keys
    if (userSpecificKeys.length > 0) {
      await AsyncStorage.multiRemove(userSpecificKeys);
    }
    
    return { success: true, clearedKeys: userSpecificKeys };
  } catch (error) {
    console.error('Error clearing user data:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Clear only essential user data (for cases where we want to keep some data)
 */
export const clearEssentialUserData = async () => {
  try {
    const essentialKeys = [
      'user',
      'authToken',
      'userType',
      '@hungama_subscription_status',
      '@hungama_claimed_rewards',
      '@hungama_watched_episodes',
      '@hungama_coins_balance',
      '@hungama_watch_history',
      '@hungama_earning_methods',
      '@hungama_my_list',
      '@hungama_last_watched',
      // Rating-related keys (user-specific)
      'rate_app_claimed',
      'rate_app_rating',
      // Guest user keys
      'guest_user_token',
      'guest_user_data',
      // Subscription and earning method keys
      'subscription_status',
      'earning_methods',
      // Watch ad count keys (daily limits)
      'watch_ad_count_',
      // Any other subscription-related keys
      'premium_status',
      'user_subscription'
    ];
    
    await AsyncStorage.multiRemove(essentialKeys);
    
    return { success: true };
  } catch (error) {
    console.error('Error clearing essential user data:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check if user data exists (useful for determining if we should clear data)
 */
export const hasUserData = async () => {
  try {
    const user = await AsyncStorage.getItem('user');
    const authToken = await AsyncStorage.getItem('authToken');
    return !!(user && authToken);
  } catch (error) {
    console.error('Error checking user data:', error);
    return false;
  }
}; 