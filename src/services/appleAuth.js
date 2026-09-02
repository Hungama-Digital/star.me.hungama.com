import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import API, { getDeviceType } from './api';
import { clearAllUserData } from '../utils/clearUserData';

/**
 * Extract email from Apple identity token JWT if present.
 * Apple includes email in the token payload (only on first sign-in or when provided).
 */
const getEmailFromAppleIdentityToken = (identityToken) => {
  if (!identityToken || typeof identityToken !== 'string') return null;
  try {
    const decoded = API.decodeJwtToken(identityToken);
    const email = decoded?.email;
    return email && typeof email === 'string' ? email : null;
  } catch (e) {
    return null;
  }
};

// Check if Apple Authentication is available
export const isAppleAuthAvailable = async () => {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch (error) {
    console.error('Error checking Apple Auth availability:', error);
    return false;
  }
};

// Apple Sign-In implementation
export const appleSignIn = async () => {
  try {
    // Check if Apple Authentication is available (iOS only)
    if (Platform.OS !== 'ios') {
      return {
        success: false,
        error: 'Apple Sign-In is only available on iOS devices',
        code: 'platform_not_supported'
      };
    }

    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      return {
        success: false,
        error: 'Apple Sign-In is not available on this device',
        code: 'not_available'
      };
    }

    // Request Apple authentication
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    // Validate credential
    if (!credential) {
      throw new Error('Apple Sign-In returned no credential');
    }

    // Extract user data from Apple credential
    const userData = {
      uid: credential.user, // Apple user ID
      email: credential.email || null, // Email (may be null on subsequent sign-ins)
      fullName: credential.fullName
        ? {
            firstName: credential.fullName.givenName || '',
            lastName: credential.fullName.familyName || '',
          }
        : null,
      identityToken: credential.identityToken, // JWT token from Apple
      authorizationCode: credential.authorizationCode, // Authorization code
      provider: 'apple',
    };

    // Create display name
    // Apple only provides fullName on the FIRST sign-in; on subsequent sign-ins fullName is null.
    let displayName = userData.fullName
      ? `${userData.fullName.firstName} ${userData.fullName.lastName}`.trim()
      : null;
    if (!displayName) {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser.provider === 'apple' && parsedUser.uid === userData.uid && parsedUser.displayName) {
            displayName = parsedUser.displayName;
          }
        }
      } catch (e) {
        // ignore
      }
    }
    if (!displayName) {
      displayName = 'Apple User';
    }

    // Extract email: credential → identity token JWT → stored user → stable placeholder by Apple user ID
    let email = userData.email;
    if (!email && userData.identityToken) {
      email = getEmailFromAppleIdentityToken(userData.identityToken);
    }
    if (!email) {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser.email && parsedUser.provider === 'apple') {
            email = parsedUser.email;
          }
        }
      } catch (error) {
        console.log('Could not retrieve stored email:', error);
      }
    }
    // When Apple doesn't provide email (e.g. subsequent sign-in or "Hide My Email"), use a stable
    // placeholder per Apple user ID so the backend can identify the same user across logins.
    if (!email) {
      email = `${userData.uid}@privaterelay.appleid.com`;
    }

    // Prepare user data for API
    const extractedUserData = {
      uid: userData.uid,
      displayName: displayName,
      email: email,
      photoURL: null, // Apple doesn't provide profile photos
      provider: 'apple',
      identityToken: userData.identityToken,
      authorizationCode: userData.authorizationCode,
    };

    // Call backend API flow - similar to Google Sign-In
    try {
      // Step 1: Check if user exists using emailId parameter
      const checkResult = await API.checkUser({ emailId: extractedUserData.email });
      const decodedCheckResult = typeof checkResult === 'string'
        ? API.decodeJwtToken(checkResult)
        : checkResult;
      
      let userExists = false;
      if (decodedCheckResult && decodedCheckResult.success) {
        userExists = true;
      } else {
        userExists = false;
      }

      if (userExists) {
        // Step 2a: User exists - call login API
        // Backend exchanges with Apple's token endpoint → must send authorization code (single-use, ~5 min valid), not identity token JWT
        const appleToken = userData.authorizationCode || userData.identityToken;
        // Match Facebook/Google login payload (backend may reject unknown fields)
        const loginData = {
          accessToken: appleToken,
          deviceType: getDeviceType().toString(),
          emailId: extractedUserData.email,
          firstName: userData.fullName?.firstName || displayName.split(' ')[0] || '',
          lastName: userData.fullName?.lastName || displayName.split(' ').slice(1).join(' ') || '',
          loginSource: "4",
        };
        
        const loginResult = await API.login(loginData);
        const decodedLoginResult = API.decodeJwtToken(loginResult);
        
        if (decodedLoginResult && decodedLoginResult.success) {
          const authToken = decodedLoginResult?.data?.[0]?.token;
          if (authToken) {
            API.setAuthToken(authToken);
            await AsyncStorage.setItem('authToken', authToken);
            await AsyncStorage.setItem('userType', 'apple'); // Set userType to 'apple'
          } else {
            throw new Error('No authentication token received from login API');
          }
        } else {
          throw new Error(decodedLoginResult?.error || 'Login API failed');
        }
      } else {
        // Step 2b: User doesn't exist - call register API
        // Backend exchanges with Apple's token endpoint → send authorization code so Apple returns valid tokens (identity token JWT would cause "invalid_grant")
        const appleToken = userData.authorizationCode || userData.identityToken;
        // Match Facebook/Google: only emailId, loginSource, accessToken (backend may reject extra fields)
        const registerData = {
          emailId: extractedUserData.email,
          loginSource: "4", // Apple (1=Google, 2=Facebook, 3=Phone, 4=Apple)
          accessToken: appleToken,
        };
        
        const registerResult = await API.registerUser(registerData);
        const decodedRegisterResult = API.decodeJwtToken(registerResult);
        
        if (decodedRegisterResult && decodedRegisterResult.success) {
          // After successful registration, call login API
          const loginData = {
            accessToken: appleToken,
            deviceType: getDeviceType().toString(),
            emailId: extractedUserData.email,
            firstName: userData.fullName?.firstName || displayName.split(' ')[0] || '',
            lastName: userData.fullName?.lastName || displayName.split(' ').slice(1).join(' ') || '',
            loginSource: "4",
          };
          
          const loginResult = await API.login(loginData);
          const decodedLoginResult = API.decodeJwtToken(loginResult);
          
          if (decodedLoginResult && decodedLoginResult.success) {
            const authToken = decodedLoginResult?.data?.[0]?.token;
            if (authToken) {
              API.setAuthToken(authToken);
              await AsyncStorage.setItem('authToken', authToken);
              await AsyncStorage.setItem('userType', 'apple'); // Set userType to 'apple'
            } else {
              throw new Error('No authentication token received from login API after registration');
            }
          } else {
            throw new Error(decodedLoginResult?.error || 'Login after registration failed');
          }
        } else {
          throw new Error(decodedRegisterResult?.error || 'Registration failed');
        }
      }
    } catch (apiError) {
      throw apiError; // Re-throw to be handled by outer catch
    }
    
    // Derive backend user ID from stored auth token if available
    let backendUserId = null;
    let storedToken = null;
    try {
      storedToken = await AsyncStorage.getItem('authToken');
      if (storedToken) {
        const decodedToken = API.decodeJwtToken(storedToken);
        backendUserId =
          decodedToken?.data?.userId ||
          decodedToken?.userId ||
          decodedToken?.id ||
          decodedToken?.sub ||
          decodedToken?.user_id ||
          null;
      }
    } catch (tokenError) {
      console.warn('appleSignIn: failed to derive backend userId from authToken', tokenError);
    }

    const canonicalUserId = backendUserId || extractedUserData.uid || null;

    const finalUserData = {
      uid: canonicalUserId,
      userId: canonicalUserId,
      displayName: extractedUserData.displayName || 'Apple User',
      email: extractedUserData.email,
      photoURL: extractedUserData.photoURL,
      provider: 'apple',
      authToken: storedToken,
    };
    
    // Store normalized user data after successful API authentication
    await AsyncStorage.setItem('user', JSON.stringify(finalUserData));
    
    return {
      success: true,
      user: finalUserData,
    };
    
  } catch (error) {
    // Handle specific error cases
    if (error.code === 'ERR_CANCELED') {
      return {
        success: false,
        error: 'Sign-in was cancelled by the user',
        code: 'cancelled'
      };
    } else if (error.code === 'ERR_REQUEST_FAILED') {
      return {
        success: false,
        error: 'Apple Sign-In request failed',
        code: 'request_failed'
      };
    } else if (error.code === 'ERR_INVALID_RESPONSE') {
      return {
        success: false,
        error: 'Invalid response from Apple Sign-In',
        code: 'invalid_response'
      };
    }
    
    return {
      success: false,
      error: error.message || 'Apple Sign-In failed',
      code: 'sign_in_failed'
    };
  }
};

// Sign out from Apple (Apple doesn't have a sign-out API, so we just clear local data)
export const appleSignOut = async () => {
  try {
    // Apple doesn't provide a sign-out API
    // We just clear all user-specific data
    const clearResult = await clearAllUserData();
    if (!clearResult.success) {
      // Silently handle warning
    }
    
    API.setAuthToken(null);
    
    return {
      success: true,
      message: 'Successfully signed out',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Sign-out failed',
    };
  }
};

// Get current user info
export const getCurrentAppleUser = async () => {
  try {
    // Check stored user data
    const storedUser = await AsyncStorage.getItem('user');
    const storedToken = await AsyncStorage.getItem('authToken');
    
    if (!storedUser || !storedToken) {
      return {
        success: false,
        error: 'No user signed in',
        code: 'no_user_signed_in'
      };
    }
    
    const userData = JSON.parse(storedUser);
    
    // Verify it's an Apple user
    if (userData.provider !== 'apple') {
      return {
        success: false,
        error: 'Current user is not signed in with Apple',
        code: 'not_apple_user'
      };
    }
    
    return {
      success: true,
      user: userData,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to get current user',
    };
  }
};

// Test Apple Sign-In setup
export const testAppleSignInSetup = async () => {
  try {
    if (Platform.OS !== 'ios') {
      return {
        success: false,
        error: 'Apple Sign-In is only available on iOS',
        code: 'platform_not_supported'
      };
    }
    
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    const storedUser = await AsyncStorage.getItem('user');
    
    return {
      success: true,
      isAvailable: isAvailable,
      isSignedIn: !!storedUser,
      message: isAvailable 
        ? 'Apple Sign-In is properly configured'
        : 'Apple Sign-In is not available on this device',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Apple Sign-In setup test failed',
      code: 'setup_test_failed'
    };
  }
};
