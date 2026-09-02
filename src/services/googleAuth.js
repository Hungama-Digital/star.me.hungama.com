import React from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API, { getDeviceType } from './api';
import { clearAllUserData } from '../utils/clearUserData';

// Conditional import to avoid Expo Go crash
let GoogleSignin = null;
let isGoogleSignInAvailable = false;

// Google (Gmail) login has been removed from the app.
// The native @react-native-google-signin/google-signin module is intentionally
// never imported or configured here: recent play-services-auth releases dropped
// the legacy com.google.android.gms.auth.api.signin.GoogleSignIn class, so calling
// into the native module crashes on load. Keeping this a no-op disables Gmail login
// on all platforms while leaving the phone/email/guest flows untouched.
const initializeGoogleSignIn = async () => {
  isGoogleSignInAvailable = false;
  GoogleSignin = null;
  return false;
};

// iOS client ID for native Google Sign-In
// IMPORTANT: This must be the iOS OAuth client ID from your Google Cloud Console
// for bundle id "com.app.hmini"
const IOS_CLIENT_ID = '587534339972-s6hv8402cbh1cnj6re9mb6u97r6os3n2.apps.googleusercontent.com';

// Google (Gmail) login removed: no native module initialization/configuration on load.
console.log('Google Sign-In availability: false (Gmail login removed)');

// Web Google Sign-In using Google Identity Services
const initializeGoogleIdentityServices = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  // Check if Google Identity Services is loaded
  if (!window.google || !window.google.accounts) {
    return null;
  }

  // Check if oauth2 is available
  if (!window.google.accounts.oauth2) {
    return null;
  }

  return window.google.accounts;
};

// Google Sign-In implementation
export const googleSignIn = async () => {
  try {
    // Web implementation using Google Identity Services
    if (Platform.OS === 'web') {
      const googleIdentity = initializeGoogleIdentityServices();
      if (!googleIdentity) {
        return {
          success: false,
          error: 'Google Identity Services not available',
          code: 'identity_services_unavailable'
        };
      }

      return new Promise((resolve) => {
        googleIdentity.oauth2.initTokenClient({
          client_id: '587534339972-a9uo2skdhcfeaup618u0k8ad3c5a0q69.apps.googleusercontent.com',
          scope: 'openid profile email',
          callback: async (response) => {
            try {
              if (response.error) {
                resolve({
                  success: false,
                  error: response.error_description || 'Google Sign-In failed',
                  code: 'identity_services_error'
                });
                return;
              }

              // Get user info using the access token
              const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                  'Authorization': `Bearer ${response.access_token}`
                }
              });

              if (!userInfoResponse.ok) {
                throw new Error('Failed to fetch user info');
              }

              const userInfo = await userInfoResponse.json();

              // Step 1: Check if user exists using checkUser API with emailId
              try {
                const checkResult = await API.checkUser({ emailId: userInfo.email });
                const decodedCheckResult = API.decodeJwtToken(checkResult);
                
                var userExists = false;
                if (decodedCheckResult && decodedCheckResult.success) {
                  userExists = true;
                } else {
                  userExists = false;
                }

                if (userExists) {
                  // Step 2a: User exists - call login API with correct parameters
                  const loginData = {
                    accessToken: response.access_token,
                    deviceType: getDeviceType().toString(),
                    emailId: userInfo.email,
                    firstName: userInfo.given_name || '',
                    lastName: userInfo.family_name || '',
                    loginSource: "1"
                  };
                  
                  const loginResult = await API.login(loginData);
                  const decodedLoginResult = API.decodeJwtToken(loginResult);
                  
                  if (decodedLoginResult && decodedLoginResult.success) {
                    const authToken = decodedLoginResult?.data?.[0]?.token;
                    if (authToken) {
                      API.setAuthToken(authToken);
                      await AsyncStorage.setItem('authToken', authToken);
                    } else {
                      throw new Error('No authentication token received from login API');
                    }
                  } else {
                    throw new Error(decodedLoginResult?.error || 'Login failed');
                  }
                } else {
                  // Step 2b: User doesn't exist - call register API with correct parameters
                  const registerData = {
                    emailId: userInfo.email,
                    loginSource: "1",
                    accessToken: response.access_token
                  };
                  
                  const registerResult = await API.registerUser(registerData);
                  const decodedRegisterResult = API.decodeJwtToken(registerResult);
                  
                  if (decodedRegisterResult && decodedRegisterResult.success) {
                    // After successful registration, call login API
                    const loginData = {
                      accessToken: response.access_token,
                      deviceType: getDeviceType().toString(),
                      emailId: userInfo.email,
                      firstName: userInfo.given_name || '',
                      lastName: userInfo.family_name || '',
                      loginSource: "1"
                    };
                    
                    const loginResult = await API.login(loginData);
                    const decodedLoginResult = API.decodeJwtToken(loginResult);
                    
                    if (decodedLoginResult && decodedLoginResult.success) {
                      const authToken = decodedLoginResult?.data?.[0]?.token;
                      if (authToken) {
                        API.setAuthToken(authToken);
                        await AsyncStorage.setItem('authToken', authToken);
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
                console.warn('googleSignIn (web): failed to derive backend userId from authToken', tokenError);
              }

              const canonicalUserId = backendUserId || userInfo.id || null;

              // Create user data object using backend user ID when available
              const userData = {
                uid: canonicalUserId,
                userId: canonicalUserId,
                displayName: userInfo.name,
                email: userInfo.email,
                photoURL: userInfo.picture,
                provider: 'google',
                accessToken: response.access_token,
                authToken: storedToken,
              };

              // Store user data
              await AsyncStorage.setItem('user', JSON.stringify(userData));

              resolve({
                success: true,
                user: userData,
              });

            } catch (error) {
              resolve({
                success: false,
                error: error.message || 'Failed to process Google Sign-In',
                code: 'processing_error'
              });
            }
          },
        }).requestAccessToken();
      });
    }
    
    console.log('Mobile implementation using @react-native-google-signin/google-signin');
    // Mobile implementation using @react-native-google-signin/google-signin
    
    // Ensure GoogleSignin is initialized
    console.log('isGoogleSignInAvailable. : '+isGoogleSignInAvailable);
    console.log('GoogleSignin. : ',isGoogleSignInAvailable);
    if (!isGoogleSignInAvailable || !GoogleSignin) {
      const initialized = await initializeGoogleSignIn();
      if (!initialized || !GoogleSignin) {
        return {
          success: false,
          error: 'Google Sign-In is not available. Please ensure you are using a development build.',
          code: 'module_not_available'
        };
      }
    }
    
    if (typeof GoogleSignin.hasPreviousSignIn !== 'function') {
      return {
        success: false,
        error: 'Google Sign-In methods are not available. Please ensure you are using a development build.',
        code: 'methods_not_available'
      };
    }
    console.log('Checking for previous Google Sign-In...');
    // Check if user is already signed in
    const hasPreviousSignIn = await GoogleSignin.hasPreviousSignIn();
    console.log('hasPreviousSignIn:', hasPreviousSignIn);
    if (hasPreviousSignIn) {
      const currentUser = await GoogleSignin.getCurrentUser();
      console.log('Previous Google Sign-In found:', currentUser);
      // getCurrentUser() can return null (e.g. session expired, user cancelled)
      if (!currentUser || !currentUser.user) {
        console.warn('Google Sign-In: getCurrentUser returned null, proceeding with fresh sign-in');
      } else {
      // Still need to check and authenticate with backend even for existing sign-in
      const extractedUserData = {
        uid: currentUser.user.id,
        displayName: currentUser.user.name,
        name: currentUser.user.name,
        email: currentUser.user.email,
        photoURL: currentUser.user.photo,
        provider: 'google',
      };
      console.log('Extracted user data from previous sign-in:', extractedUserData);
      // Get tokens for API calls
      const { idToken, accessToken } = await GoogleSignin.getTokens();
      console.log('Google Sign-In: Retrieved tokens for API calls:', { idToken, accessToken });
      // Call backend API flow
      try {
        const checkResult = await API.checkUser({ emailId: extractedUserData.email });
        const decodedCheckResult = API.decodeJwtToken(checkResult);
        
        var userExists = false;
        if (decodedCheckResult && decodedCheckResult.success) {
          userExists = true;
        } else {
          userExists = false;
        }

        if (userExists) {
          // User exists, call login API
          const loginData = {
            accessToken: accessToken || idToken,
            deviceType: getDeviceType().toString(),
            emailId: extractedUserData.email,
            firstName: extractedUserData.displayName?.split(' ')[0] || '',
            lastName: extractedUserData.displayName?.split(' ').slice(1).join(' ') || '',
            loginSource: "1"
          };
          
          const loginResult = await API.login(loginData);
          const decodedLoginResult = API.decodeJwtToken(loginResult);
          
          if (decodedLoginResult && decodedLoginResult.success) {
            const authToken = decodedLoginResult?.data?.[0]?.token;
            if (authToken) {
              API.setAuthToken(authToken);
              await AsyncStorage.setItem('authToken', authToken);
            }
          }
        }
      } catch (apiError) {
        // Continue with local user data
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
        console.warn('googleSignIn (mobile existing): failed to derive backend userId from authToken', tokenError);
      }

      const canonicalUserId = backendUserId || extractedUserData.uid || null;

      const finalUserData = {
        uid: canonicalUserId,
        userId: canonicalUserId,
        displayName: extractedUserData.displayName,
        email: extractedUserData.email,
        photoURL: extractedUserData.photoURL,
        provider: 'google',
        authToken: storedToken,
      };

      // Persist normalized user data
      await AsyncStorage.setItem('user', JSON.stringify(finalUserData));

      return {
        success: true,
        user: finalUserData,
      };
      }
    }

    // Sign in with Google
    await GoogleSignin.hasPlayServices();
    console.log('Sign in with Google');
    const userInfo = await GoogleSignin.signIn();
    console.log('Google Sign-In successful:', userInfo);
    // Validate userInfo structure
    if (!userInfo) {
      throw new Error('Google Sign-In returned null or undefined user data');
    }
    
    // Extract user data from Google Sign-In response
    let googleUserData = null;
    
    // Try userInfo.data.user (actual structure)
    if (userInfo.data && userInfo.data.user && userInfo.data.user.email) {
      googleUserData = userInfo.data.user;
    }
    // Try userInfo.user (fallback)
    else if (userInfo.user && userInfo.user.email) {
      googleUserData = userInfo.user;
    }
    // Try userInfo directly (fallback)
    else if (userInfo.email) {
      googleUserData = userInfo;
    }
    // Try userInfo.data.user even if no email (for debugging)
    else if (userInfo.data && userInfo.data.user) {
      googleUserData = userInfo.data.user;
    }
    
    if (!googleUserData) {
      throw new Error('Google Sign-In returned no user data');
    }
    
    // Check for email in the user data
    if (!googleUserData.email) {
      throw new Error('Google Sign-In returned user data without email');
    }
    
    // Get the ID token and access token
    const { idToken, accessToken } = await GoogleSignin.getTokens();
    
    // Extract user data from Google Sign-In response
    const extractedUserData = {
      uid: googleUserData.id || 'unknown',
      displayName: googleUserData.name || 'Unknown User',
      name: googleUserData.name || 'Unknown User',
      email: googleUserData.email || 'unknown@email.com',
      photoURL: googleUserData.photo || null,
      provider: 'google',
    };
    
    console.log('Extracted user data:', extractedUserData);
    console.log('Retrieved tokens:', { idToken, accessToken });
    // Call backend API for mobile - following OTP verification pattern
    try {
      // Step 1: Check if user exists using emailId parameter
      const checkResult = await API.checkUser({ emailId: extractedUserData.email });


      const decodedCheckResult = API.decodeJwtToken(checkResult);
      
      var userExists = false;
      if (decodedCheckResult && decodedCheckResult.success) {
        userExists = true;
      } else {
        userExists = false;
      }

      if (userExists) {
        // Step 2a: User exists - call login API with correct parameters
        const loginData = {
          accessToken: accessToken || idToken,
          deviceType: getDeviceType().toString(),
          emailId: extractedUserData.email,
          firstName: extractedUserData.displayName?.split(' ')[0] || '',
          lastName: extractedUserData.displayName?.split(' ').slice(1).join(' ') || '',
          loginSource: "1"
        };
        
        const loginResult = await API.login(loginData);
        const decodedLoginResult = API.decodeJwtToken(loginResult);
        
        if (decodedLoginResult && decodedLoginResult.success) {
          const authToken = decodedLoginResult?.data?.[0]?.token;
          if (authToken) {
            API.setAuthToken(authToken);
            await AsyncStorage.setItem('authToken', authToken);
            await AsyncStorage.setItem('userType', 'google'); // Set userType to 'google' for Google authentication
          } else {
            throw new Error('No authentication token received from login API');
          }
        } else {
          throw new Error(decodedLoginResult?.error || 'Login API failed');
        }
      } else {
        // Step 2b: User doesn't exist - call Google register API with correct parameters
        const registerData = {
          emailId: extractedUserData.email,
          loginSource: "1",
          accessToken: accessToken || idToken
        };
        
        const registerResult = await API.registerUser(registerData);
        const decodedRegisterResult = API.decodeJwtToken(registerResult);
        
        if (decodedRegisterResult && decodedRegisterResult.success) {
          // After successful registration, call login API
          const loginData = {
            accessToken: accessToken || idToken,
            deviceType: getDeviceType().toString(),
            emailId: extractedUserData.email,
            firstName: extractedUserData.displayName?.split(' ')[0] || '',
            lastName: extractedUserData.displayName?.split(' ').slice(1).join(' ') || '',
            loginSource: "1"
          };
          
          const loginResult = await API.login(loginData);
          const decodedLoginResult = API.decodeJwtToken(loginResult);
          
          if (decodedLoginResult && decodedLoginResult.success) {
            const authToken = decodedLoginResult?.data?.[0]?.token;
            if (authToken) {
              API.setAuthToken(authToken);
              await AsyncStorage.setItem('authToken', authToken);
              await AsyncStorage.setItem('userType', 'google'); // Set userType to 'google' for Google authentication
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
      console.warn('googleSignIn (mobile new): failed to derive backend userId from authToken', tokenError);
    }

    const canonicalUserId = backendUserId || extractedUserData.uid || null;

    const userData = {
      uid: canonicalUserId,
      userId: canonicalUserId,
      displayName: extractedUserData.displayName,
      email: extractedUserData.email,
      photoURL: extractedUserData.photoURL,
      provider: 'google',
      authToken: storedToken,
    };

    // Store normalized user data after successful API authentication
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    
    return {
      success: true,
      user: userData,
    };
    
  } catch (error) {
    // Handle specific error cases
    if (error.code === 'SIGN_IN_CANCELLED') {
      return {
        success: false,
        error: 'Sign-in was cancelled by the user',
        code: 'cancelled'
      };
    } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      return {
        success: false,
        error: 'Google Play Services not available',
        code: 'play_services_unavailable'
      };
    } else if (error.code === 'SIGN_IN_REQUIRED') {
      return {
        success: false,
        error: 'Sign-in required',
        code: 'sign_in_required'
      };
    }
    
    return {
      success: false,
      error: error.message || 'Google Sign-In failed',
      code: 'sign_in_failed'
    };
  }
};

// Sign out from Google
export const googleSignOut = async () => {
  try {
    // Sign out from Google (mobile only)
    if (Platform.OS !== 'web') {
      if (!isGoogleSignInAvailable || !GoogleSignin) {
        console.log('GoogleSignin not initialized, attempting to initialize...');
        const initialized = await initializeGoogleSignIn();
        if (initialized && GoogleSignin && typeof GoogleSignin.signOut === 'function') {
          await GoogleSignin.signOut();
        }
      } else if (typeof GoogleSignin.signOut === 'function') {
        await GoogleSignin.signOut();
      }
    }
    
    // Clear all user-specific data using the comprehensive utility function
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
export const getCurrentGoogleUser = async () => {
  try {
    // For web, check stored user data
    if (Platform.OS === 'web') {
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
      return {
        success: true,
        user: userData,
      };
    }
    
    // For mobile, check Google Sign-In state
    if (!isGoogleSignInAvailable || !GoogleSignin) {
      const initialized = await initializeGoogleSignIn();
      if (!initialized || !GoogleSignin) {
        return {
          success: false,
          error: 'Google Sign-In is not available on this platform',
          code: 'module_not_available'
        };
      }
    }
    
    if (typeof GoogleSignin.hasPreviousSignIn !== 'function') {
      return {
        success: false,
        error: 'Google Sign-In methods are not available on this platform',
        code: 'methods_not_available'
      };
    }
    
    const hasPreviousSignIn = await GoogleSignin.hasPreviousSignIn();
    
    if (!hasPreviousSignIn) {
      return {
        success: false,
        error: 'No user signed in',
        code: 'no_user_signed_in'
      };
    }
    
    const currentUser = await GoogleSignin.getCurrentUser();
    
    if (!currentUser || !currentUser.user) {
      return {
        success: false,
        error: 'No current user',
        code: 'no_current_user',
      };
    }
    
    return {
      success: true,
      user: {
        uid: currentUser.user.id,
        displayName: currentUser.user.name,
        email: currentUser.user.email,
        photoURL: currentUser.user.photo,
        provider: 'google',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to get current user',
    };
  }
};

// Test Google Sign-In setup
export const testGoogleSignInSetup = async () => {
  try {
    if (Platform.OS === 'web') {
      // For web, check if Google Identity Services is available
      const googleIdentity = initializeGoogleIdentityServices();
      const storedUser = await AsyncStorage.getItem('user');
      
      return {
        success: true,
        isSignedIn: !!storedUser,
        message: googleIdentity 
          ? 'Google Identity Services is properly configured for web'
          : 'Google Identity Services not loaded',
      };
    }
    
    // For mobile, check Google Sign-In
    if (!isGoogleSignInAvailable || !GoogleSignin) {
      const initialized = await initializeGoogleSignIn();
      if (!initialized || !GoogleSignin) {
        return {
          success: false,
          error: 'Google Sign-In is not available on this platform',
          code: 'module_not_available'
        };
      }
    }
    
    if (typeof GoogleSignin.hasPreviousSignIn !== 'function') {
      return {
        success: false,
        error: 'Google Sign-In methods are not available on this platform',
        code: 'methods_not_available'
      };
    }
    
    const hasPreviousSignIn = await GoogleSignin.hasPreviousSignIn();
    
    return {
      success: true,
      isSignedIn: hasPreviousSignIn,
      message: 'Google Sign-In is properly configured',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Google Sign-In setup test failed',
      code: 'setup_test_failed'
    };
  }
}; 

// Debug function to help troubleshoot Google Sign-In issues
export const debugGoogleSignIn = async () => {
  // Test initialization
  const initResult = await initializeGoogleSignIn();
  
  return {
    platform: Platform.OS,
    isAvailable: isGoogleSignInAvailable,
    googleSigninObject: GoogleSignin ? 'Available' : 'Not available',
    initializationResult: initResult
  };
};

 
