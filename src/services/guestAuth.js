import AsyncStorage from '@react-native-async-storage/async-storage';
import API from './api';
import { clearAllUserData } from '../utils/clearUserData';

/**
 * Create a guest user and get authentication token
 * @returns {Promise<Object>} - Result object with success status and user data
 */
export const createGuestUser = async () => {
  try {
    console.log('=== Creating Guest User ===');
    
    // Check if guest user already exists
    const existingGuestToken = await AsyncStorage.getItem('guestToken');
    if (existingGuestToken) {
      console.log('Guest user already exists, using existing token');
      API.setAuthToken(existingGuestToken);
      return {
        success: true,
        token: existingGuestToken,
        message: 'Using existing guest user'
      };
    }
    
    // Create new guest user
    const result = await API.createGuestUser();
    
    if (result.success) {
      // Store guest token for future use
      await AsyncStorage.setItem('guestToken', result.token);
      await AsyncStorage.setItem('userType', 'guest');
      
      console.log('Guest user created and stored successfully');
      return {
        success: true,
        token: result.token,
        userData: result.userData,
        message: 'Guest user created successfully'
      };
    } else {
      console.error('Failed to create guest user:', result.error);
      return result;
    }
  } catch (error) {
    console.error('Error in createGuestUser:', error);
    return {
      success: false,
      error: error.message || 'Failed to create guest user'
    };
  }
};

/**
 * Check if guest user exists and is valid
 * @returns {Promise<Object>} - Result object with guest user status
 */
export const checkGuestUser = async () => {
  try {
    const guestToken = await AsyncStorage.getItem('guestToken');
    const userType = await AsyncStorage.getItem('userType');
    
    if (guestToken && userType === 'guest') {
      // Validate token by trying to decode it
      try {
        const decodedToken = API.decodeJwtToken(guestToken);
        if (decodedToken) {
          API.setAuthToken(guestToken);
          return {
            success: true,
            token: guestToken,
            userData: decodedToken,
            message: 'Valid guest user found'
          };
        }
      } catch (decodeError) {
        console.log('Guest token is invalid, will create new one');
      }
    }
    
    return {
      success: false,
      message: 'No valid guest user found'
    };
  } catch (error) {
    console.error('Error checking guest user:', error);
    return {
      success: false,
      error: error.message || 'Failed to check guest user'
    };
  }
};

/**
 * Clear guest user data
 * @returns {Promise<Object>} - Result object with success status
 */
export const clearGuestUser = async () => {
  try {
    // Clear all user-specific data using the comprehensive utility function
    const clearResult = await clearAllUserData();
    if (!clearResult.success) {
      // Silently handle warning
    }
    
    API.setAuthToken(null);
    
    console.log('Guest user data cleared successfully');
    return {
      success: true,
      message: 'Guest user data cleared successfully'
    };
  } catch (error) {
    console.error('Error clearing guest user:', error);
    return {
      success: false,
      error: error.message || 'Failed to clear guest user'
    };
  }
};

/**
 * Initialize guest user (create if doesn't exist, use existing if valid)
 * @returns {Promise<Object>} - Result object with guest user status
 */
export const initializeGuestUser = async () => {
  try {
    console.log('=== Initializing Guest User ===');
    
    // First check if guest user exists
    const checkResult = await checkGuestUser();
    
    if (checkResult.success) {
      console.log('Using existing guest user');
      return checkResult;
    }
    
    // Create new guest user if none exists
    console.log('Creating new guest user');
    const createResult = await createGuestUser();
    
    if (createResult.success) {
      console.log('Guest user initialized successfully');
      return createResult;
    } else {
      console.error('Failed to initialize guest user:', createResult.error);
      return createResult;
    }
  } catch (error) {
    console.error('Error initializing guest user:', error);
    return {
      success: false,
      error: error.message || 'Failed to initialize guest user'
    };
  }
};

/**
 * Get current guest user status
 * @returns {Promise<Object>} - Result object with current guest user info
 */
export const getGuestUserStatus = async () => {
  try {
    const guestToken = await AsyncStorage.getItem('guestToken');
    const userType = await AsyncStorage.getItem('userType');
    
    if (guestToken && userType === 'guest') {
      try {
        const decodedToken = API.decodeJwtToken(guestToken);
        return {
          isGuest: true,
          token: guestToken,
          userData: decodedToken,
          message: 'Guest user is active'
        };
      } catch (decodeError) {
        return {
          isGuest: false,
          message: 'Guest token is invalid'
        };
      }
    }
    
    return {
      isGuest: false,
      message: 'No guest user found'
    };
  } catch (error) {
    console.error('Error getting guest user status:', error);
    return {
      isGuest: false,
      error: error.message || 'Failed to get guest user status'
    };
  }
};

export default {
  createGuestUser,
  checkGuestUser,
  clearGuestUser,
  initializeGuestUser,
  getGuestUserStatus
}; 