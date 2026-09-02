import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from '../services/phoneAuth';
import { googleSignIn, googleSignOut } from '../services/googleAuth';
import { createGuestUser, checkGuestUser, clearGuestUser } from '../services/guestAuth';
// Lazy-load Apple/Facebook auth to avoid NativeModule at bundle load (expo-apple-authentication, expo-auth-session, expo-web-browser)
function getAppleAuth() { return require('../services/appleAuth'); }
function getFacebookAuth() { return require('../services/facebookAuth'); }
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../services/api';
import { isFirebaseReady } from '../config/firebase';
import { clearAllUserData } from '../utils/clearUserData';
import { isAllowlisted } from '../config/interactiveAllowlist';

function computeFeatures(userData) {
  const mobile = userData?.phoneNumber || userData?.mobile || '';
  return { interactive_show: isAllowlisted(mobile) };
}

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuestUser, setIsGuestUser] = useState(false);
  const [isGuestSet, setIsGuestSet] = useState(false);

  // Helper function to validate JWT token and check for user ID
  const validateAuthToken = async (token) => {
    try {
      if (!token) {
        return { isValid: false, hasUserId: false, error: 'No token provided' };
      }

      const decodedToken = API.decodeJwtToken(token);
      if (!decodedToken) {
        return { isValid: false, hasUserId: false, error: 'Invalid token format' };
      }

      // Check if token has expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (decodedToken.exp && decodedToken.exp < currentTime) {
        return { isValid: false, hasUserId: false, error: 'Token expired' };
      }

      // Check for user ID in various possible locations
      const userId = decodedToken?.data?.userId ||
        decodedToken?.userId ||
        decodedToken?.id ||
        decodedToken?.sub ||
        decodedToken?.user_id;

      return {
        isValid: true,
        hasUserId: !!userId,
        userId: userId,
        decodedToken: decodedToken
      };
    } catch (error) {
      return { isValid: false, hasUserId: false, error: error.message };
    }
  };

  useEffect(() => {
    // Check for stored authentication data
    const checkStoredAuth = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        const storedToken = await AsyncStorage.getItem('authToken');
        const userType = await AsyncStorage.getItem('userType');

        // Check for guest user first
        if (userType === 'guest') {
          const guestResult = await checkGuestUser();
          if (guestResult.success) {
            // Validate guest token
            const tokenValidation = await validateAuthToken(guestResult.token);

            if (tokenValidation.isValid) {
              setUser({
                uid: '',
                displayName: 'Guest User',
                email: null,
                provider: 'guest',
                authToken: guestResult.token,
                isGuest: true
              });
              setIsAuthenticated(true);
              setIsGuestUser(true);
              setIsGuestSet(true);
              API.setAuthToken(guestResult.token);
              return true;
            } else {
              // Guest token is invalid, clear guest data
              console.log('Invalid guest token, clearing guest data:', tokenValidation.error);
              await clearGuestUser();
            }
          }
        }

        // Check for regular user
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          let tokenToUse = storedToken;

          // Fallback: if separate authToken is missing, try to get it from user data
          if (!tokenToUse && userData.authToken) {
            tokenToUse = userData.authToken;
          }

          // Apple users: ensure displayName is never empty (Apple only sends name on first sign-in)
          if (userData.provider === 'apple' && !userData.displayName) {
            userData.displayName = 'Apple User';
          }

          if (tokenToUse) {
            const tokenValidation = await validateAuthToken(tokenToUse);

            if (tokenValidation.isValid && tokenValidation.hasUserId) {
              userData.features = computeFeatures(userData);
              setUser(userData);
              setIsAuthenticated(true);
              setIsGuestUser(false);

              // Ensure token is set in Standalone key if it was missing
              if (!storedToken) {
                await AsyncStorage.setItem('authToken', tokenToUse);
              }

              // Set auth token for API calls
              API.setAuthToken(tokenToUse);
              return true;
            } else {
              // Token is invalid or doesn't have user ID, clear auth state
              await clearAllUserData();
              setUser(null);
              setIsAuthenticated(false);
              setIsGuestUser(false);
              setIsGuestSet(false);
            }
          }
        }
      } catch (error) {
      }
      return false;
    };



    // Wait for Firebase to be ready before setting up auth state listener
    let retryCount = 0;
    const maxRetries = 3; // Further reduced max retries

    const setupFirebaseAuth = () => {
      if (isFirebaseReady()) {
        const unsubscribe = onAuthStateChanged((firebaseUser) => {
          if (firebaseUser) {
            const userData = {
              uid: firebaseUser.uid,
              phoneNumber: firebaseUser.phoneNumber,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              isAnonymous: firebaseUser.isAnonymous,
              emailVerified: firebaseUser.emailVerified,
              phoneNumberVerified: firebaseUser.phoneNumberVerified,
            };

            setUser(userData);
            setIsAuthenticated(true);
            AsyncStorage.setItem('user', JSON.stringify(userData));
          } else {
            AsyncStorage.getItem('user').then((storedUser) => {
              if (!storedUser) {
                setUser(null);
                setIsAuthenticated(false);
              }
            });
          }
          setLoading(false);
        });
        return unsubscribe;
      } else {
        setLoading(false);
        return () => { };
      }
    };

    // Initialize Auth Sequence
    let fbUnsubscribe = null;
    const initialize = async () => {
      const hasStoredAuth = await checkStoredAuth();
      if (hasStoredAuth) {
        setLoading(false);
      } else {
        fbUnsubscribe = setupFirebaseAuth();
      }
    };

    initialize();

    // Set up periodic token validation
    const tokenValidationInterval = setInterval(async () => {
      if (isAuthenticated && !isGuestUser) {
        const validationResult = await validateCurrentAuth();
        if (!validationResult.success) {
          console.log('Periodic token validation failed, user will be logged out');
        }
      }
    }, 5 * 60 * 1000);

    return () => {
      if (fbUnsubscribe) fbUnsubscribe();
      clearInterval(tokenValidationInterval);
    };
  }, []);

  const signInAsGuest = async () => {
    try {
      console.log('AuthContext: Starting Guest Sign-In...');
      const result = await createGuestUser();
      console.log('AuthContext: Guest Sign-In result:', result);

      if (result.success) {
        // Set the guest user in context
        const userData = {
          uid: '',
          displayName: 'Guest User',
          email: null,
          photoURL: null,
          provider: 'guest',
          authToken: result.token,
          isGuest: true,
          features: { interactive_show: false },
        };

        // Store user data
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        await AsyncStorage.setItem('authToken', result.token);
        await AsyncStorage.setItem('userType', 'guest');
        
        API.setAuthToken(result.token);
        setUser(userData);
        setIsAuthenticated(true);
        setIsGuestUser(true);
        setIsGuestSet(true);
        console.log('AuthContext: Guest user authenticated successfully');
        return { success: true, user: userData };
      } else {
        console.error('AuthContext: Guest Sign-In failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('AuthContext: Guest Sign-In error:', error);
      return { success: false, error: error.message };
    }
  };

  const signInWithGoogle = async () => {
    try {
      console.log('AuthContext: Starting Google Sign-In...');
      const result = await googleSignIn();
      console.log('AuthContext: Google Sign-In result:', result);

      if (result.success) {
        // Set the authenticated user in context
        if (result.user) {
          // Prefer backend user ID from the auth token over provider UID
          let backendUserId = null;
          let effectiveAuthToken = null;

          try {
            const storedToken = await AsyncStorage.getItem('authToken');
            effectiveAuthToken = storedToken || null;

            if (effectiveAuthToken) {
              const tokenValidation = await validateAuthToken(effectiveAuthToken);
              if (tokenValidation.isValid && tokenValidation.hasUserId) {
                backendUserId = tokenValidation.userId;
              }
            }
          } catch (tokenError) {
            console.warn('AuthContext: Failed to derive backend userId from Google auth token:', tokenError);
          }

          const canonicalUserId = backendUserId || result.user.uid || null;

          const userData = {
            uid: canonicalUserId, // uid should always be the backend user ID when available
            userId: canonicalUserId,
            displayName: result.user.displayName,
            email: result.user.email,
            photoURL: result.user.photoURL,
            provider: 'google',
            authToken: effectiveAuthToken,
          };

          setUser(userData);
          setIsAuthenticated(true);
          setIsGuestUser(false);
          setIsGuestSet(false);

          if (effectiveAuthToken) {
            await AsyncStorage.setItem('authToken', effectiveAuthToken);
            API.setAuthToken(effectiveAuthToken);
          }
          await AsyncStorage.setItem('user', JSON.stringify(userData));
          await AsyncStorage.setItem('userType', 'google');

          return { success: true, user: userData };
        }
      } else {
        // Handle specific error codes
        if (result.code === 'module_not_available' || result.code === 'play_services_unavailable') {
          return {
            success: false,
            error: 'Google Sign-In is not available on this device. Please use phone number authentication.',
            code: result.code
          };
        }

        return { success: false, error: result.error };
      }
    } catch (error) {
      // Check if it's a native module error
      if (error.message && error.message.includes('RNGoogleSignIn')) {
        return {
          success: false,
          error: 'Google Sign-In is not available on this device. Please use phone number authentication.',
          code: 'native_module_error'
        };
      }

      return { success: false, error: error.message || 'Google Sign-In failed' };
    }
  };

  const signInWithApple = async () => {
    try {
      console.log('AuthContext: Starting Apple Sign-In...');
      const result = await getAppleAuth().appleSignIn();
      console.log('AuthContext: Apple Sign-In result:', result);

      if (result.success) {
        // Set the authenticated user in context
        if (result.user) {
          let backendUserId = null;
          let effectiveAuthToken = null;

          try {
            const storedToken = await AsyncStorage.getItem('authToken');
            effectiveAuthToken = result.user.authToken || storedToken || null;

            if (effectiveAuthToken) {
              const tokenValidation = await validateAuthToken(effectiveAuthToken);
              if (tokenValidation.isValid && tokenValidation.hasUserId) {
                backendUserId = tokenValidation.userId;
              }
            }
          } catch (tokenError) {
            console.warn('AuthContext: Failed to derive backend userId from Apple auth token:', tokenError);
          }

          const canonicalUserId = backendUserId || result.user.uid || null;

          const userData = {
            uid: canonicalUserId,
            userId: canonicalUserId,
            displayName: result.user.displayName || 'Apple User',
            email: result.user.email,
            photoURL: result.user.photoURL,
            provider: 'apple',
            authToken: effectiveAuthToken,
          };

          setUser(userData);
          setIsAuthenticated(true);
          setIsGuestUser(false);
          setIsGuestSet(false);

          // Store user data and token
          if (effectiveAuthToken) {
            await AsyncStorage.setItem('authToken', effectiveAuthToken);
            API.setAuthToken(effectiveAuthToken);
          }
          await AsyncStorage.setItem('user', JSON.stringify(userData));
          await AsyncStorage.setItem('userType', 'apple');

          return { success: true, user: userData };
        }
      } else {
        // Handle specific error codes
        if (result.code === 'platform_not_supported') {
          return {
            success: false,
            error: 'Apple Sign-In is only available on iOS devices.',
            code: result.code
          };
        }

        if (result.code === 'not_available') {
          return {
            success: false,
            error: 'Apple Sign-In is not available on this device.',
            code: result.code
          };
        }

        if (result.code === 'cancelled') {
          return {
            success: false,
            error: 'Sign-in was cancelled.',
            code: result.code
          };
        }

        if (result.code === 'email_not_available') {
          return {
            success: false,
            error: result.error || 'Email not available. Please try again or use another sign-in method.',
            code: result.code
          };
        }

        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Apple Sign-In failed' };
    }
  };

  const signInWithFacebook = async () => {
    try {
      console.log('AuthContext: Starting Facebook Sign-In...');
      const result = await getFacebookAuth().facebookSignIn();
      console.log('AuthContext: Facebook Sign-In result:', result);

      if (result.success) {
        // Set the authenticated user in context
        if (result.user) {
          let backendUserId = null;
          let effectiveAuthToken = null;

          try {
            const storedToken = await AsyncStorage.getItem('authToken');
            effectiveAuthToken = result.user.authToken || storedToken || null;

            if (effectiveAuthToken) {
              const tokenValidation = await validateAuthToken(effectiveAuthToken);
              if (tokenValidation.isValid && tokenValidation.hasUserId) {
                backendUserId = tokenValidation.userId;
              }
            }
          } catch (tokenError) {
            console.warn('AuthContext: Failed to derive backend userId from Facebook auth token:', tokenError);
          }

          const canonicalUserId = backendUserId || result.user.uid || null;

          const userData = {
            uid: canonicalUserId,
            userId: canonicalUserId,
            displayName: result.user.displayName,
            email: result.user.email,
            photoURL: result.user.photoURL,
            provider: 'facebook',
            authToken: effectiveAuthToken, // Include the auth token if available
          };

          console.log('AuthContext: Setting authenticated Facebook user:', userData);
          setUser(userData);
          setIsAuthenticated(true);
          setIsGuestUser(false);
          setIsGuestSet(false);

          // Store user data and token
          if (effectiveAuthToken) {
            await AsyncStorage.setItem('authToken', effectiveAuthToken);
            API.setAuthToken(effectiveAuthToken);
          }

          // Store user data
          await AsyncStorage.setItem('user', JSON.stringify(userData));
          await AsyncStorage.setItem('userType', 'facebook');

          return { success: true, user: userData };
        }
      } else {
        // Handle specific error codes
        if (result.code === 'cancelled') {
          return {
            success: false,
            error: 'Facebook Sign-In was cancelled.',
            code: result.code
          };
        }

        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error.message || 'Facebook Sign-In failed' };
    }
  };

  const signOut = async () => {
    try {
      // Call logout API first (if user is authenticated and not a guest)
      if (isAuthenticated && !isGuestUser) {
        try {
          const authToken = await AsyncStorage.getItem('authToken');
          if (authToken) {
            // Set auth token for API call
            API.setAuthToken(authToken);
            // Call logout API
            await API.logout();
            console.log('Logout API called successfully');
          }
        } catch (apiError) {
          // Continue with logout even if API call fails
          console.warn('Logout API call failed, continuing with local logout:', apiError);
        }
      }

      // Sign out from Google if user was signed in with Google
      if (user && user.provider === 'google') {
        await googleSignOut();
      }

      // Sign out from Apple if user was signed in with Apple
      if (user && user.provider === 'apple') {
        await getAppleAuth().appleSignOut();
      }

      // Sign out from Facebook if user was signed in with Facebook
      if (user && user.provider === 'facebook') {
        await getFacebookAuth().facebookSignOut();
      }

      // Clear guest user if user was a guest
      if (user && user.provider === 'guest') {
        await clearGuestUser();
      }

      // Clear all user-specific data using the comprehensive utility function
      const clearResult = await clearAllUserData();
      if (!clearResult.success) {
        // Silently handle warning
      }

      // Clear auth token from API service
      API.setAuthToken(null);

      // Clear all state
      setUser(null);
      setIsAuthenticated(false);
      setIsGuestUser(false);
      setIsGuestSet(false);

      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  };

  const updateUserProfile = async (updates) => {
    try {
      if (!user) {
        return { success: false, error: 'No user to update' };
      }
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      setIsAuthenticated(true);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      return { success: true, user: updatedUser };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: error.message };
    }
  };

  const setAuthenticatedUser = async (userData) => {
    try {
      let normalizedUserData = { ...userData };

      // If we have an authToken but no explicit userId/uid, derive it from the token
      if (normalizedUserData.authToken && !normalizedUserData.userId && !normalizedUserData.uid) {
        try {
          const tokenValidation = await validateAuthToken(normalizedUserData.authToken);
          if (tokenValidation.isValid && tokenValidation.hasUserId) {
            const backendUserId = tokenValidation.userId;
            normalizedUserData.userId = backendUserId;
            normalizedUserData.uid = backendUserId;
          }
        } catch (tokenError) {
          console.warn('AuthContext: Failed to normalize userId from auth token in setAuthenticatedUser:', tokenError);
        }
      }

      normalizedUserData.features = computeFeatures(normalizedUserData);

      setUser(normalizedUserData);
      setIsAuthenticated(true);
      setIsGuestUser(false);
      setIsGuestSet(false);

      // Clear guest userType and set to 'phone' for phone login
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUserData));
      if (normalizedUserData.authToken) {
        await AsyncStorage.setItem('authToken', normalizedUserData.authToken);
        API.setAuthToken(normalizedUserData.authToken);
      }
      await AsyncStorage.setItem('userType', 'phone'); // Set userType to 'phone' for phone authentication

      return { success: true, user: normalizedUserData };
    } catch (error) {
      console.error('Set authenticated user error:', error);
      return { success: false, error: error.message };
    }
  };

  const refreshNavigationData = async () => {
    try {
      // Call navigation API only
      const navigationResult = await API.getNavigation();

      return { success: true };
    } catch (error) {
      console.error('Error refreshing navigation data:', error);
      return { success: false, error: error.message };
    }
  };

  // Function to validate current auth token and handle expiration
  const validateCurrentAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('authToken');
      const userType = await AsyncStorage.getItem('userType');

      if (!storedToken) {
        // No token, clear auth state
        setUser(null);
        setIsAuthenticated(false);
        setIsGuestUser(false);
        setIsGuestSet(false);
        return { success: false, error: 'No auth token found' };
      }

      const tokenValidation = await validateAuthToken(storedToken);
      if (!tokenValidation.isValid) {
        // Token is invalid or expired, clear auth state
        console.log('Current auth token is invalid, clearing auth state:', tokenValidation.error);
        await clearAllUserData();
        setUser(null);
        setIsAuthenticated(false);
        setIsGuestUser(false);
        setIsGuestSet(false);
        return { success: false, error: tokenValidation.error };
      }

      return { success: true, userId: tokenValidation.userId };
    } catch (error) {
      console.error('Error validating current auth:', error);
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    isGuestUser,
    isGuestSet,
    signInAsGuest,
    signInWithGoogle,
    signInWithApple,
    signInWithFacebook,
    signOut,
    updateUserProfile,
    setAuthenticatedUser,
    refreshNavigationData,
    validateCurrentAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 