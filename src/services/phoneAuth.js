import AsyncStorage from '@react-native-async-storage/async-storage';
import API, { getDeviceType } from './api';
import { Platform } from 'react-native';
import { isFirebaseReady } from '../config/firebase';
import { initializeFirebase } from '../config/firebase';
import { clearAllUserData } from '../utils/clearUserData';

// Lazy-load Firebase Auth and OTP verify to avoid "Cannot read property 'NativeModule' of undefined" at bundle load (Hermes).
function getAuth() {
  if (Platform.OS === 'web') return null;
  try {
    return require('@react-native-firebase/auth').default;
  } catch (e) {
    return null;
  }
}
function getOtpVerifyGetHash() {
  if (Platform.OS === 'web') return null;
  try {
    const otpVerify = require('react-native-otp-verify');
    return typeof otpVerify.getHash === 'function' ? otpVerify.getHash : null;
  } catch (e) {
    return null;
  }
}

let verificationId = null;

// Function to check Firebase Phone Auth configuration
export const checkFirebasePhoneAuthConfig = () => {
  console.log('=== FIREBASE PHONE AUTH CONFIGURATION CHECK ===');
  console.log('Platform:', Platform.OS);
  
  if (Platform.OS === 'web') {
    console.log('Firebase Auth not available on web platform');
    return {
      platform: Platform.OS,
      authInitialized: false,
      appConfigAvailable: false,
      requiredSteps: ['Web platform detected - Firebase Auth disabled']
    };
  }
  
  // Ensure Firebase is initialized
  const firebaseApp = initializeFirebase();
  
  if (!firebaseApp) {
    console.error('Firebase failed to initialize');
    return {
      platform: Platform.OS,
      authInitialized: false,
      appConfigAvailable: false,
      requiredSteps: ['Firebase initialization failed - check configuration']
    };
  }
  
  const authMod = getAuth();
  console.log('Firebase Auth Instance:', authMod ? 'Available' : 'Not available');
  console.log('Firebase App Config:', firebaseApp?.options ? 'Available' : 'Missing');
  
  const config = {
    platform: Platform.OS,
    authInitialized: !!authMod,
    appConfigAvailable: !!firebaseApp?.options,
    requiredSteps: []
  };
  
  if (Platform.OS === 'android') {
    config.requiredSteps = [
      '1. Go to Firebase Console → Authentication → Sign-in method',
      '2. Enable Phone Number sign-in',
      '3. Add your app\'s SHA-1 fingerprint to Firebase Console',
      '4. Download updated google-services.json',
      '5. Add test phone numbers if needed',
      '6. Ensure google-services.json is in android/app/ directory'
    ];
    
    // Check if google-services.json exists
    console.log('Android Configuration Check:');
    console.log('- Make sure google-services.json is in android/app/ directory');
    console.log('- Verify SHA-1 fingerprint is added to Firebase Console');
    console.log('- Check that Phone Authentication is enabled');
  } else if (Platform.OS === 'ios') {
    config.requiredSteps = [
      '1. Go to Firebase Console → Authentication → Sign-in method',
      '2. Enable Phone Number sign-in',
      '3. Add your app\'s bundle ID to Firebase Console',
      '4. Download updated GoogleService-Info.plist',
      '5. Add test phone numbers if needed',
      '6. Ensure GoogleService-Info.plist is in ios/ directory'
    ];
    
    console.log('iOS Configuration Check:');
    console.log('- Make sure GoogleService-Info.plist is in ios/ directory');
    console.log('- Verify bundle ID matches Firebase Console');
    console.log('- Check that Phone Authentication is enabled');
  } else {
    config.requiredSteps = [
      '1. Go to Firebase Console → Authentication → Sign-in method',
      '2. Enable Phone Number sign-in',
      '3. Add authorized domains',
      '4. Configure reCAPTCHA settings'
    ];
  }
  
  console.log('Required setup steps:');
  config.requiredSteps.forEach(step => console.log(`  ${step}`));
  console.log('=== END CONFIGURATION CHECK ===');
  
  return config;
};

// Function to help with Android SHA-1 fingerprint setup
export const getAndroidSetupInstructions = () => {
  console.log('=== ANDROID SHA-1 FINGERPRINT SETUP ===');
  console.log('To get your SHA-1 fingerprint, run these commands:');
  console.log('');
  console.log('For debug build:');
  console.log('cd android && ./gradlew signingReport');
  console.log('');
  console.log('Or use keytool:');
  console.log('keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android');
  console.log('');
  console.log('Then:');
  console.log('1. Copy the SHA-1 fingerprint');
  console.log('2. Go to Firebase Console → Project Settings → Your Apps → Android');
  console.log('3. Add the SHA-1 fingerprint');
  console.log('4. Download the updated google-services.json');
  console.log('5. Replace the file in your android/app/ directory');
  console.log('=== END ANDROID SETUP ===');
};

/**
 * Send OTP using Firebase Phone Authentication and API
 * @param {string} phoneNumber - Phone number with country code
 * @param {boolean} userExists - Whether user exists in the system
 * @returns {Promise<Object>} - Result object with success status
 */
export const sendOTP = async (phoneNumber, userExists = false) => {
  if (Platform.OS === 'web') {
    console.log('Firebase Phone Auth not available on web');
    return {
      success: false,
      error: 'Phone authentication is not available on web platform'
    };
  }
  
  try {
    // Check Firebase configuration first
    checkFirebasePhoneAuthConfig();
    
    const authMod = getAuth();
    console.log('Sending OTP to:', phoneNumber, 'User exists:', userExists);
    console.log('Platform:', Platform.OS);
    console.log('Firebase Auth Instance:', authMod);
    if (authMod) {
      const authInstance = authMod();
      console.log('Firebase App Config:', authInstance?.app?.options);
      console.log('Current Firebase User:', authInstance?.currentUser);
    }
    
    // Validate phone number format
    if (!phoneNumber || phoneNumber.length < 10) {
      return {
        success: false,
        error: 'Invalid phone number format. Please enter a valid phone number with country code.',
        code: 'invalid-phone-format'
      };
    }
    
    // Ensure phone number has country code
    if (!phoneNumber.startsWith('+')) {
      return {
        success: false,
        error: 'Phone number must include country code (e.g., +91 for India)',
        code: 'missing-country-code'
      };
    }
    
    // Extract country code and mobile number
    const countryCode = phoneNumber.substring(0, 3); // +91
    const mobileNumber = phoneNumber.substring(3); // Remove country code
    
    console.log('Country code:', countryCode, 'Mobile:', mobileNumber);
    
    // Call appropriate API based on user existence
    const getHashFn = getOtpVerifyGetHash();
    if (!getHashFn) {
      return {
        success: false,
        error: 'OTP verification not available on this device.',
        code: 'otp-unavailable'
      };
    }
    const hashValue = await getHashFn();
    if (userExists) {
      // User exists, call sendOTP API
      console.log('User exists, calling sendOTP API');
      const sendOTPData = {
        code: countryCode,
        mobile: mobileNumber,
        hash: hashValue
      };
      
      apiResult = await API.sendOTP(sendOTPData);
      console.log('SendOTP API result:', apiResult);
    } else {
      // User doesn't exist, call register API
      console.log('User does not exist, calling register API');
      const registerData = {
        mobile: mobileNumber,
        loginSource: 3,
        deviceType: getDeviceType().toString(),
        hash: hashValue
      };
      
      apiResult = await API.registerUser(registerData);
      console.log('Register API result:', apiResult);
    }
    
    // Check API response
    if (!apiResult) {
      return {
        success: false,
        error: 'Failed to send OTP via API',
        code: 'api-error'
      };
    }
    // API may return plain JSON with success: false
    const decodedApi =
      apiResult && typeof apiResult === 'object' && !Array.isArray(apiResult) && 'success' in apiResult
        ? apiResult
        : API.decodeJwtToken(apiResult);
    if (decodedApi && decodedApi.success === false) {
      return {
        success: false,
        error: "Unable to send OTP. Try again or use another login method",
        code: 'otp-send-failed'
      };
    }
    // Log the API result for debugging
    console.log('API result:', apiResult);
    
    // Send OTP via Firebase using React Native Firebase
    console.log('Using React Native Firebase phone authentication for:', Platform.OS);
    
    // Check if Firebase is ready before using auth
    if (!isFirebaseReady()) {
      return {
        success: false,
        error: 'Firebase not ready yet. Please try again.',
        code: 'firebase-not-ready'
      };
    }
    
    // For React Native Firebase, we use auth().verifyPhoneNumber directly
    const firebaseApp = initializeFirebase();
    if (!firebaseApp) {
      throw new Error('Firebase not initialized');
    }
    if (!authMod) {
      return {
        success: false,
        error: 'Firebase Auth not available.',
        code: 'auth-unavailable'
      };
    }
    verificationId = await authMod().verifyPhoneNumber(phoneNumber);
    
    console.log('OTP sent successfully via API and Firebase');
    
    return {
      success: true,
      message: 'OTP sent successfully',
      verificationId: verificationId,
      apiResult: apiResult
    };
    
  } catch (error) {
    console.error('Send OTP error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      platform: Platform.OS
    });
    
    let errorMessage = 'Failed to send OTP';
    
    if (error.code === 'auth/invalid-phone-number') {
      errorMessage = 'Invalid phone number format. Please check the number and try again.';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many requests. Please wait a few minutes and try again.';
    } else if (error.code === 'auth/quota-exceeded') {
      errorMessage = 'SMS quota exceeded. Please try again later.';
    } else if (error.code === 'auth/argument-error' || error.message.includes('verifier._reset')) {
      if (Platform.OS === 'web') {
        errorMessage = 'Invalid phone number or reCAPTCHA setup issue. Please refresh the page and try again.';
      } else {
        errorMessage = 'Phone authentication not properly configured for mobile. Please check Firebase Console settings and ensure SHA-1 fingerprint is added.';
      }
    } else if (error.code === 'auth/operation-not-allowed') {
      errorMessage = 'Phone authentication is not enabled in Firebase Console. Please contact support.';
    } else if (error.code === 'auth/captcha-check-failed') {
      errorMessage = 'reCAPTCHA verification failed. Please try again.';
    } else if (error.code === 'auth/missing-verification-code') {
      errorMessage = 'Verification code is missing. Please try again.';
    } else if (error.code === 'auth/invalid-verification-code') {
      errorMessage = 'Invalid verification code. Please check the code and try again.';
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code,
      platform: Platform.OS
    };
  }
};

/**
 * Verify OTP using Firebase and then call API login
 * @param {string} otp - OTP code
 * @param {string} phoneNumber - Phone number with country code
 * @param {boolean} userExists - Whether user exists in the system
 * @returns {Promise<Object>} - Result object with success status and token
 */
export const verifyOTP = async (otp, phoneNumber, userExists) => {
  if (Platform.OS === 'web') {
    console.log('Firebase Phone Auth not available on web');
    return {
      success: false,
      error: 'Phone authentication is not available on web platform'
    };
  }
  
  try {
    console.log('Verifying Firebase OTP:', otp, 'for:', phoneNumber);
    
    if (!verificationId) {
      return {
        success: false,
        error: 'No verification ID found. Please send OTP again.'
      };
    }
    
    // Check if Firebase is ready before using auth
    if (!isFirebaseReady()) {
      return {
        success: false,
        error: 'Firebase not ready yet. Please try again.',
        code: 'firebase-not-ready'
      };
    }
    
    // Create credential with OTP using React Native Firebase
    const authMod = getAuth();
    if (!authMod) {
      return {
        success: false,
        error: 'Firebase Auth not available.',
        code: 'auth-unavailable'
      };
    }
    const credential = authMod.PhoneAuthProvider.credential(verificationId, otp);
    
    // Sign in with Firebase
    const firebaseApp = initializeFirebase();
    if (!firebaseApp) {
      throw new Error('Firebase not initialized');
    }
    const userCredential = await authMod().signInWithCredential(credential);
    const firebaseUser = userCredential.user;
    
    console.log('Firebase OTP verified successfully:', firebaseUser.uid);
    
    // Call API login endpoint to get auth token
    const loginResult = await callApiLogin(phoneNumber, firebaseUser.uid, userExists);
    
    if (!loginResult.success) {
      // If API login fails, sign out from Firebase
      const firebaseApp = initializeFirebase();
      const authMod = getAuth();
      if (firebaseApp && authMod) {
        await authMod().signOut();
      }
      return loginResult;
    }
    
    // Note: menuCategory API is now called by HomeScreen, not here
    
    // Clear verification ID and recaptcha verifier
    verificationId = null;
    clearRecaptchaVerifier();
    
    return {
      success: true,
      message: 'OTP verified successfully',
      token: loginResult.token,
      user: loginResult.user,
      firebaseUser: firebaseUser
    };
    
  } catch (error) {
    console.error('Verify OTP error:', error);
    
    let errorMessage = 'Invalid OTP';
    
    if (error.code === 'auth/invalid-verification-code') {
      errorMessage = 'Invalid OTP code';
    } else if (error.code === 'auth/invalid-verification-id') {
      errorMessage = 'OTP expired. Please send a new code';
    } else if (error.code === 'auth/code-expired') {
      errorMessage = 'OTP has expired. Please send a new code';
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code
    };
  }
};

/**
 * Call API login endpoint after successful Firebase verification
 * @param {string} phoneNumber - Phone number with country code
 * @param {string} firebaseUid - Firebase user ID
 * @param {boolean} userExists - Whether user exists in the system
 * @returns {Promise<Object>} - Result object with success status and token
 */
const callApiLogin = async (phoneNumber, firebaseUid, userExists) => {
  try {
    console.log('Calling API with:', { phoneNumber, firebaseUid, userExists });
    
    let result;
    let decodedResult;
    
    // Extract mobile number without country code
    const mobileNumber = phoneNumber.substring(3); // Remove country code (+91)
    
    if (userExists) {
      // User exists, call login API
      console.log('User exists, calling login API');
      const loginData = {
        mobile: mobileNumber,
        loginSource: 3,
        password: ""
      };
      
      result = await API.login(loginData);
      decodedResult = API.decodeJwtToken(result);
      console.log('API login result:', decodedResult);
      if (decodedResult.success) { 
        const authToken = decodedResult?.data[0]?.token;
        API.setAuthToken(authToken);
        await AsyncStorage.setItem('authToken', authToken);
        await AsyncStorage.setItem('userType', 'phone'); // Set userType to 'phone' for phone authentication
      }
    } else {
      // User doesn't exist, call register API
      console.log('User does not exist, calling register API');
      const registerData = {
        mobile: mobileNumber,
        loginSource: 3,
        deviceType: getDeviceType().toString()
      };
      
      result = await API.registerUser(registerData);
      decodedResult = API.decodeJwtToken(result);
      console.log('API register result:', decodedResult);
      
      // If register returns a token, store it and set userType
      if (decodedResult?.success && decodedResult?.data) {
        const registerToken = Array.isArray(decodedResult.data) 
          ? decodedResult.data[0]?.token 
          : decodedResult.data?.token;
        
        if (registerToken) {
          API.setAuthToken(registerToken);
          await AsyncStorage.setItem('authToken', registerToken);
          await AsyncStorage.setItem('userType', 'phone'); // Set userType to 'phone' for phone authentication
        }
      }
    }
    
    // Check if the API call was successful
    if (!result || result.error) {
      return {
        success: false,
        error: result?.error || 'API call failed',
        code: 'api-error'
      };
    }
    
    return {
      success: true,
      message: result.message || decodedResult?.message || (userExists ? 'Login successful' : 'Registration successful'),
      token: result.token || decodedResult?.token || null,
      user: result.user || decodedResult?.user || null
    };
    
  } catch (error) {
    console.error('API call error:', error);
    
    let errorMessage = userExists ? 'Failed to complete login' : 'Failed to complete registration';
    
    if (error.message.includes('400')) {
      errorMessage = 'Invalid data';
    } else if (error.message.includes('401')) {
      errorMessage = 'Authentication failed';
    } else if (error.message.includes('404')) {
      errorMessage = 'User not found';
    } else if (error.message.includes('409')) {
      errorMessage = 'User already exists';
    } else if (error.message.includes('500')) {
      errorMessage = 'Server error. Please try again later';
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code
    };
  }
};

/**
 * Complete authentication flow: Send OTP -> Verify OTP -> API Login
 * @param {string} phoneNumber - Phone number with country code
 * @param {string} otp - OTP code (only needed for verification step)
 * @param {string} step - Current step: 'send', 'verify'
 * @param {boolean} userExists - Whether user exists in the system
 * @returns {Promise<Object>} - Result object with success status and next step info
 */
export const authenticateUser = async (phoneNumber, otp = null, step = 'send', userExists = false) => {
  try {
    console.log(`Authentication step: ${step} for:`, phoneNumber, 'User exists:', userExists);
    
    switch (step) {
      case 'send':
        // Step 1: Send OTP via Firebase and API
        const sendResult = await sendOTP(phoneNumber, userExists);
        if (!sendResult.success) {
          return sendResult;
        }
        
        return {
          success: true,
          nextStep: 'verify',
          message: 'OTP sent successfully'
        };
        
      case 'verify':
        // Step 2: Verify OTP via Firebase and call API login
        if (!otp) {
          return {
            success: false,
            error: 'OTP is required for verification'
          };
        }
        
        const verifyResult = await verifyOTP(otp, phoneNumber, userExists);
        if (!verifyResult.success) {
          return verifyResult;
        }
      
        return {
          success: true,
          nextStep: 'complete',
          token: verifyResult.token,
          user: verifyResult.user,
          message: 'OTP verified successfully'
        };
        
      default:
        return {
          success: false,
          error: 'Invalid authentication step'
        };
    }
    
  } catch (error) {
    console.error('Authentication flow error:', error);
    return {
      success: false,
      error: error.message || 'Authentication failed'
    };
  }
};

/**
 * Clear recaptcha verifier (for web)
 */
const clearRecaptchaVerifier = () => {
  if (Platform.OS === 'web' && window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    window.recaptchaVerifier = null;
  }
};

/**
 * Sign out the current user
 * @returns {Promise<Object>} - Result object with success status
 */
export const signOut = async () => {
  if (Platform.OS === 'web') {
    console.log('Firebase Auth not available on web');
    // For web, clear all user data
    const clearResult = await clearAllUserData();
    if (!clearResult.success) {
      // Silently handle warning
    }
    verificationId = null;
    clearRecaptchaVerifier();
    console.log('User signed out successfully (web)');
    
    return {
      success: true,
      message: 'Signed out successfully'
    };
  }
  
  try {
    const firebaseApp = initializeFirebase();
    if (!firebaseApp) {
      console.error('Firebase not initialized, cannot sign out');
      return;
    }
    const authMod = getAuth();
    if (!authMod) return;
    await authMod().signOut();
    
    // Clear all user-specific data using the comprehensive utility function
    const clearResult = await clearAllUserData();
    if (!clearResult.success) {
      // Silently handle warning
    }
    
    verificationId = null;
    clearRecaptchaVerifier();
    console.log('User signed out successfully');
    
    return {
      success: true,
      message: 'Signed out successfully'
    };
    
  } catch (error) {
    console.error('Error signing out:', error);
    
    return {
      success: false,
      error: error.message || 'Failed to sign out'
    };
  }
};

/**
 * Get current user
 * @returns {Object|null} - Current user object or null if not signed in
 */
export const getCurrentUser = () => {
  if (Platform.OS === 'web') {
    console.log('Firebase Auth not available on web');
    return null;
  }
  
  try {
    const firebaseApp = initializeFirebase();
    if (!firebaseApp) {
      console.error('Firebase not initialized, cannot get current user');
      return null;
    }
    const authMod = getAuth();
    if (!authMod) return null;
    return authMod().currentUser;
  } catch (error) {
    console.error('Error initializing Firebase for getCurrentUser:', error);
    return null;
  }
};

/**
 * Listen to authentication state changes
 * @param {Function} callback - Callback function to handle auth state changes
 * @returns {Function} - Unsubscribe function
 */
export const onAuthStateChanged = (callback) => {
  if (Platform.OS === 'web') {
    console.log('Firebase Auth not available on web');
    // For web, return a dummy unsubscribe function that does nothing
    return () => {};
  }
  
  // Ensure Firebase is initialized before using auth
  try {
    const firebaseApp = initializeFirebase();
    if (!firebaseApp) {
      console.error('Firebase not initialized, cannot set up auth state listener');
      // Return a dummy unsubscribe function if Firebase fails to initialize
      return () => {};
    }
    const authMod = getAuth();
    if (!authMod) return () => {};
    return authMod().onAuthStateChanged(callback);
  } catch (error) {
    console.error('Error initializing Firebase for auth state change:', error);
    // Return a dummy unsubscribe function if Firebase fails to initialize
    return () => {};
  }
}; 