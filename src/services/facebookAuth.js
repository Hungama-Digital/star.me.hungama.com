import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API, { getDeviceType } from './api';
import { clearAllUserData } from '../utils/clearUserData';

// Complete the auth session for web
WebBrowser.maybeCompleteAuthSession();

// Facebook App Configuration
const FACEBOOK_CONFIG = {
  appId: '893068479886286',
  appSecret: '70d68701b9b1883914ab3b2647717d54',
};

// Facebook OAuth endpoints
const FACEBOOK_AUTH_URL = 'https://www.facebook.com/v18.0/dialog/oauth';
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v18.0/oauth/access_token';
const FACEBOOK_USER_INFO_URL = 'https://graph.facebook.com/v18.0/me';

// Facebook redirect URI for native apps
const getFacebookRedirectUri = () => {
  if (Platform.OS === 'web') {
    return AuthSession.makeRedirectUri({ useProxy: true });
  }
  // Native redirect URI format: fb{APP_ID}://authorize
  return `fb${FACEBOOK_CONFIG.appId}://authorize`;
};

// Facebook Sign-In implementation
export const facebookSignIn = async () => {
  try {
    // For web, use OAuth flow with expo-auth-session
    if (Platform.OS === 'web') {
      return await facebookSignInWeb();
    }
    
    // For mobile (iOS/Android), use native Facebook SDK via expo-auth-session
    return await facebookSignInMobile();
    
  } catch (error) {
    console.error('Facebook Sign-In error:', error);
    
    // Handle specific error cases
    if (error.code === 'ERR_CANCELED' || error.message?.includes('canceled')) {
      return {
        success: false,
        error: 'Sign-in was cancelled by the user',
        code: 'cancelled'
      };
    }
    
    return {
      success: false,
      error: error.message || 'Facebook Sign-In failed',
      code: 'sign_in_failed'
    };
  }
};

// Web implementation using OAuth flow
const facebookSignInWeb = async () => {
  try {
    const redirectUri = getFacebookRedirectUri();

    const request = new AuthSession.AuthRequest({
      clientId: FACEBOOK_CONFIG.appId,
      scopes: ['public_profile', 'email'],
      // Use implicit flow on web to avoid PKCE code_verifier issues
      // and get the access_token directly from the auth response
      responseType: AuthSession.ResponseType.Token,
      redirectUri: redirectUri,
      usePKCE: false,
      extraParams: {
        display: 'popup',
      },
    });

    const result = await request.promptAsync({
      authorizationEndpoint: FACEBOOK_AUTH_URL,
    });

    if (result.type !== 'success') {
      return {
        success: false,
        error: 'Facebook Sign-In was cancelled',
        code: 'cancelled'
      };
    }

    const { access_token: accessToken, error, error_description } = result.params;

    if (error) {
      throw new Error(error_description || error || 'Facebook authentication failed');
    }

    if (!accessToken) {
      throw new Error('No access token received from Facebook');
    }

    // Get user info using access token
    const userInfoResponse = await fetch(
      `${FACEBOOK_USER_INFO_URL}?fields=id,name,email,picture&access_token=${accessToken}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info from Facebook');
    }

    const userInfo = await userInfoResponse.json();

    // Process user info and authenticate with backend
    return await processFacebookUserInfo(userInfo, accessToken);

  } catch (error) {
    console.error('Facebook web sign-in error:', error);
    throw error;
  }
};

// Mobile implementation using OAuth flow with native redirects
const facebookSignInMobile = async () => {
  try {
    // Use native redirect URI to allow Facebook app redirect
    const redirectUri = getFacebookRedirectUri();

    // For mobile, use 'native' display mode to prefer Facebook app
    const request = new AuthSession.AuthRequest({
      clientId: FACEBOOK_CONFIG.appId,
      scopes: ['public_profile', 'email'],
      responseType: AuthSession.ResponseType.Token,
      redirectUri: redirectUri,
      extraParams: {
        display: 'touch',
        auth_type: 'rerequest', // Re-request permissions if needed
      },
    });

    const result = await request.promptAsync({
      authorizationEndpoint: FACEBOOK_AUTH_URL,
      useProxy: false, // Don't use proxy on mobile to allow native app redirect
      showInRecents: true,
    });

    if (result.type !== 'success') {
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return {
          success: false,
          error: 'Facebook Sign-In was cancelled',
          code: 'cancelled'
        };
      }
      
      // Check for specific error messages
      if (result.errorCode || result.error) {
        const errorMessage = result.error?.message || result.errorCode;
        if (errorMessage?.includes('not active') || errorMessage?.includes('not accessible')) {
          return {
            success: false,
            error: 'Facebook app is not active. Please contact the app developer or try again later.',
            code: 'app_not_active',
            details: 'The Facebook app needs to be activated in Facebook Developer Console. Please ensure the app is in "Live" mode or add test users if in development mode.'
          };
        }
      }
      
      return {
        success: false,
        error: result.error?.message || 'Facebook Sign-In failed',
        code: result.type
      };
    }

    const { access_token, error, error_description } = result.params;

    // Check for errors in response
    if (error) {
      if (error === 'access_denied' || error === 'user_cancelled') {
        return {
          success: false,
          error: 'Facebook Sign-In was cancelled',
          code: 'cancelled'
        };
      }
      
      if (error_description?.includes('not active') || error_description?.includes('not accessible')) {
        return {
          success: false,
          error: 'Facebook app is not active. Please contact the app developer or try again later.',
          code: 'app_not_active',
          details: 'The Facebook app needs to be activated in Facebook Developer Console. Please ensure the app is in "Live" mode or add test users if in development mode.'
        };
      }
      
      throw new Error(error_description || error || 'Facebook authentication failed');
    }

    if (!access_token) {
      throw new Error('No access token received from Facebook');
    }

    // Get user info using access token
    const userInfoResponse = await fetch(
      `${FACEBOOK_USER_INFO_URL}?fields=id,name,email,picture&access_token=${access_token}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.json().catch(() => ({}));
      if (errorData.error?.message?.includes('not active')) {
        return {
          success: false,
          error: 'Facebook app is not active. Please contact the app developer or try again later.',
          code: 'app_not_active',
          details: 'The Facebook app needs to be activated in Facebook Developer Console.'
        };
      }
      throw new Error('Failed to fetch user info from Facebook');
    }

    const userInfo = await userInfoResponse.json();

    // Check for errors in user info response
    if (userInfo.error) {
      if (userInfo.error.message?.includes('not active') || userInfo.error.message?.includes('not accessible')) {
        return {
          success: false,
          error: 'Facebook app is not active. Please contact the app developer or try again later.',
          code: 'app_not_active',
          details: 'The Facebook app needs to be activated in Facebook Developer Console. Please ensure the app is in "Live" mode or add test users if in development mode.'
        };
      }
      throw new Error(userInfo.error.message || 'Failed to get user info');
    }

    // Process user info and authenticate with backend
    return await processFacebookUserInfo(userInfo, access_token);

  } catch (error) {
    console.error('Facebook mobile sign-in error:', error);
    
    // Check for app not active error in error message
    if (error.message?.includes('not active') || error.message?.includes('not accessible')) {
      return {
        success: false,
        error: 'Facebook app is not active. Please contact the app developer or try again later.',
        code: 'app_not_active',
        details: 'The Facebook app needs to be activated in Facebook Developer Console. Please ensure the app is in "Live" mode or add test users if in development mode.'
      };
    }
    
    throw error;
  }
};

// Process Facebook user info and authenticate with backend
const processFacebookUserInfo = async (userInfo, accessToken) => {
  try {
    // Extract user data from Facebook response
    const extractedUserData = {
      uid: userInfo.id || 'unknown',
      displayName: userInfo.name || 'Unknown User',
      email: userInfo.email || null,
      photoURL: userInfo.picture?.data?.url || null,
      provider: 'facebook',
    };

    // Step 1: Check if user exists using emailId (if available)
    let userExists = false;
    if (extractedUserData.email) {
      try {
        const checkResult = await API.checkUser({ emailId: extractedUserData.email });
        const decodedCheckResult = API.decodeJwtToken(checkResult);
        
        if (decodedCheckResult && decodedCheckResult.success) {
          userExists = true;
        }
      } catch (error) {
        console.warn('Error checking user existence:', error);
        // Continue with registration if check fails
      }
    }

    // Split name into first and last name
    const nameParts = extractedUserData.displayName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    if (userExists) {
      // Step 2a: User exists - call login API
      const loginData = {
        accessToken: accessToken,
        deviceType: getDeviceType().toString(),
        emailId: extractedUserData.email || extractedUserData.uid + '@facebook.com',
        firstName: firstName,
        lastName: lastName,
        loginSource: "2" // Facebook login source (1=Google, 4=Apple, 3=Phone, 2=Facebook)
      };
      
      const loginResult = await API.login(loginData);
      const decodedLoginResult = API.decodeJwtToken(loginResult);
      
      if (decodedLoginResult && decodedLoginResult.success) {
        const authToken = decodedLoginResult?.data?.[0]?.token;
        if (authToken) {
          API.setAuthToken(authToken);
          await AsyncStorage.setItem('authToken', authToken);
          await AsyncStorage.setItem('userType', 'facebook');
        } else {
          throw new Error('No authentication token received from login API');
        }
      } else {
        throw new Error(decodedLoginResult?.error || 'Login failed');
      }
    } else {
      // Step 2b: User doesn't exist - call register API
      const registerData = {
        emailId: extractedUserData.email || extractedUserData.uid + '@facebook.com',
        loginSource: "2", // Facebook login source
        accessToken: accessToken
      };
      
      const registerResult = await API.registerUser(registerData);
      const decodedRegisterResult = API.decodeJwtToken(registerResult);
      
      if (decodedRegisterResult && decodedRegisterResult.success) {
        // After successful registration, call login API
        const loginData = {
          accessToken: accessToken,
          deviceType: getDeviceType().toString(),
          emailId: extractedUserData.email || extractedUserData.uid + '@facebook.com',
          firstName: firstName,
          lastName: lastName,
          loginSource: "2"
        };
        
        const loginResult = await API.login(loginData);
        const decodedLoginResult = API.decodeJwtToken(loginResult);
        
        if (decodedLoginResult && decodedLoginResult.success) {
          const authToken = decodedLoginResult?.data?.[0]?.token;
          if (authToken) {
            API.setAuthToken(authToken);
            await AsyncStorage.setItem('authToken', authToken);
            await AsyncStorage.setItem('userType', 'facebook');
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
      console.warn('processFacebookUserInfo: failed to derive backend userId from authToken', tokenError);
    }

    const canonicalUserId = backendUserId || extractedUserData.uid || null;

    const finalUserData = {
      uid: canonicalUserId,
      userId: canonicalUserId,
      displayName: extractedUserData.displayName,
      email: extractedUserData.email,
      photoURL: extractedUserData.photoURL,
      provider: 'facebook',
      authToken: storedToken,
    };
    
    // Store normalized user data
    await AsyncStorage.setItem('user', JSON.stringify(finalUserData));

    return {
      success: true,
      user: finalUserData,
    };

  } catch (error) {
    console.error('Error processing Facebook user info:', error);
    throw error;
  }
};

// Sign out from Facebook
export const facebookSignOut = async () => {
  try {
    // Clear all user-specific data
    const clearResult = await clearAllUserData();
    if (!clearResult.success) {
      console.warn('Some data may not have been cleared:', clearResult.error);
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

// Get current Facebook user info
export const getCurrentFacebookUser = async () => {
  try {
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
    
    if (userData.provider !== 'facebook') {
      return {
        success: false,
        error: 'Current user is not signed in with Facebook',
        code: 'not_facebook_user'
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
