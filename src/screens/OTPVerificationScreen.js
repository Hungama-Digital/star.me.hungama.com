import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import Toast from '../components/Toast';

import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { runPostLoginRedirect } from '../utils/guestUtils';
import deepLinkingService from '../services/deepLinkingService';
import API, { getDeviceType } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHash, startOtpListener, removeListener } from 'react-native-otp-verify';

// Cooldown before user can request another OTP (2 min 30 sec)
const RESEND_OTP_COOLDOWN_SECONDS = 150;

const formatResendCountdown = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const OTPVerificationScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const {
    phoneNumber,
    displayPhoneNumber,
    emailId,
    displayEmail,
    userExists,
    cleanMobile,
    cleanEmail,
    sessionId: initialSessionId,
    loginType = 'phone' // 'phone' or 'email'
  } = route.params || {};
  const { setAuthenticatedUser } = useAuth();

  useEffect(() => {
    const backAction = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);
  const { checkSubscriptionStatus } = useSubscription();

  const [otp, setOtp] = useState(['', '', '', '']);
  // Holds any OS-level one-time-code autofill value (iOS/Android SMS OTP)
  const [autoOtpValue, setAutoOtpValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_OTP_COOLDOWN_SECONDS);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const [sessionId, setSessionId] = useState(initialSessionId || '');
  const [isVerified, setIsVerified] = useState(false);
  const [incorrectAttempts, setIncorrectAttempts] = useState(0);
  const [invalidOtpMessage, setInvalidOtpMessage] = useState('');

  const inputRefs = useRef([]);
  const autoOtpInputRef = useRef(null);
  const verificationInProgressRef = useRef(false);
  const verificationAttemptCounterRef = useRef(0);

  // On mount, focus the hidden one-time-code TextInput so the OS
  // attaches its SMS code suggestion to it. We keep the 4-box UI
  // purely as a visual representation.
  useEffect(() => {
    const t = setTimeout(() => {
      if (autoOtpInputRef.current && autoOtpInputRef.current.focus) {
        autoOtpInputRef.current.focus();
      }
    }, 300);
    return () => clearTimeout(t);
  }, []);

  // Log sessionId when component mounts
  useEffect(() => {
    if (sessionId) {
      console.log('OTPVerification: SessionId available:', sessionId);
    }
  }, [sessionId]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleOtpChange = useCallback((text, index) => {
    if (text.length > 1) {
      text = text[text.length - 1];
    }
    setOtp(prev => {
      const next = [...prev];
      next[index] = text;

      // If all 4 digits are filled, automatically trigger verification (not when attempts exhausted)
      const nextOtpString = next.join('');
      if (nextOtpString.length === 4 && !next.includes('') && !isLoading && !isVerified && incorrectAttempts < 5) {
        console.log('[OTP] All 4 digits entered via visible inputs, triggering auto verification', {
          otpString: nextOtpString,
        });
        // Dismiss keyboard for a smoother transition
        if (Platform.OS !== 'web') {
          try {
            const { Keyboard } = require('react-native');
            Keyboard.dismiss();
          } catch (e) {
            // Ignore keyboard errors
          }
        }
        // Trigger verification on the next frame with the latest OTP values
        requestAnimationFrame(() => {
          handleVerifyOTP(next, 'visible_inputs_auto4');
        });
      } else if (text && index < 3) {
        // Focus next input after state update (schedule to avoid flicker from same-tick focus)
        requestAnimationFrame(() => {
          inputRefs.current[index + 1]?.focus();
        });
      }

      return next;
    });
  }, [isLoading, isVerified, incorrectAttempts]);

  const otpRef = useRef(otp);
  otpRef.current = otp;

  const handleKeyPress = useCallback((e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otpRef.current[index] && index > 0) {
      requestAnimationFrame(() => inputRefs.current[index - 1]?.focus());
    }
  }, []);

  const handleVerifyOTP = async (overrideOtp, source = 'unknown') => {
    const otpArray = overrideOtp || otp;
    const otpString = otpArray.join('');

    console.log('[OTP] handleVerifyOTP called', {
      source,
      otpString,
      sessionId,
      userExists,
      loginType,
      incorrectAttempts,
    });

    if (otpString.length !== 4) {
      setToastMessage('Please enter the complete 4-digit code');
      setToastType('error');
      setToastVisible(true);
      return;
    }

    if (verificationInProgressRef.current) {
      console.log('[OTP] Verification already in progress, skipping this request', {
        source,
        otpString,
      });
      return;
    }

    verificationInProgressRef.current = true;
    const attemptId = ++verificationAttemptCounterRef.current;
    console.log('[OTP] Starting verification attempt', {
      attemptId,
      source,
      otpString,
      sessionId,
    });

    setIsLoading(true);

    try {
      console.log('[OTP] Verifying OTP via API', {
        attemptId,
        userExists,
        loginType,
      });

      let result;

      // Prepare verify data based on login type (phone or email)
      let verifyData;
      let mobileNumber = null; // Initialize for use in userData later

      if (loginType === 'email') {
        // Email-based verification
        console.log('Email-based OTP verification for:', emailId || cleanEmail);
        verifyData = {
          emailId: emailId || cleanEmail,
          otp: otpString,
          otpbycall: 1,
          sessionId: sessionId
        };
      } else {
        // Phone-based verification (default)
        // Debug: Log the phoneNumber to see what we're working with
        console.log('Phone number received:', phoneNumber);
        console.log('Clean mobile from route params:', cleanMobile);

        // Use cleanMobile if available, otherwise extract from phoneNumber
        let countryCode;

        if (cleanMobile) {
          mobileNumber = cleanMobile;
          countryCode = '+91'; // Default to India
        } else if (phoneNumber && phoneNumber.startsWith('+')) {
          // Extract country code and mobile number from full phone number
          const match = phoneNumber.match(/^\+(\d{1,3})(.+)$/);
          if (match) {
            countryCode = '+' + match[1];
            mobileNumber = match[2];
          } else {
            // Fallback: assume +91 and remove first 3 characters
            countryCode = '+91';
            mobileNumber = phoneNumber.substring(3);
          }
        } else {
          // Fallback: use phoneNumber as mobile and default country code
          mobileNumber = phoneNumber || '';
          countryCode = '+91';
        }

        console.log('Extracted country code:', countryCode);
        console.log('Extracted mobile number:', mobileNumber);

        verifyData = {
          mobile: mobileNumber,
          otp: otpString,
          otpbycall: 1,
          sessionId: sessionId
        };
      }

      // Always call verifyOTP API for verification
      console.log('[OTP] Calling verifyOTP API with data', {
        attemptId,
        verifyData,
      });
      result = await API.verifyOTP(verifyData);
      console.log('[OTP] VerifyOTP API raw result', {
        attemptId,
        result,
      });

      if (!result) {
        throw new Error('Verification failed');
      }

      // Decode the JWT token to get the actual response
      const decodedResult = API.decodeJwtToken(result);
      console.log('[OTP] Decoded verifyOTP result', {
        attemptId,
        decodedResult,
      });

      if (!decodedResult || decodedResult.error) {
        throw new Error(decodedResult?.error || 'Verification failed');
      }

      // Check if OTP verification was actually successful
      // The API response structure: { success: true, message: "Login successful", data: [{ token, key }] }
      if (!decodedResult || decodedResult.error) {
        throw new Error(decodedResult?.error || 'Verification failed');
      }

      // Check if response indicates success
      if (decodedResult.success !== true) {
        throw new Error(decodedResult?.message || 'Invalid OTP, please try again.');
      }

      // Extract token from response data
      const userDataFromToken = Array.isArray(decodedResult.data) ? decodedResult.data[0] : decodedResult.data;

      // Validate that we have a token
      if (!userDataFromToken || !userDataFromToken.token) {
        throw new Error('Invalid OTP, please try again.');
      }

      // Decode the JWT token to extract userId and other user data
      const authToken = userDataFromToken.token;
      const decodedToken = API.decodeJwtToken(authToken);

      // Extract userId from decoded token (token contains data.userId)
      const userId = decodedToken?.data?.userId || decodedToken?.userId || decodedToken?.data?.id || null;
      const mobile = decodedToken?.data?.mobile || decodedToken?.mobile || null;
      const email = decodedToken?.data?.email || decodedToken?.email || null;
      const name = decodedToken?.data?.name || decodedToken?.name || '';

      console.log('[OTP] Decoded auth token payload', {
        attemptId,
        userId,
        mobile,
        email,
        name,
      });

      // Set auth token
      console.log('[OTP] Setting auth token', {
        attemptId,
      });
      API.setAuthToken(authToken);
      await AsyncStorage.setItem('authToken', authToken);
      await AsyncStorage.setItem('userType', loginType === 'email' ? 'email' : 'phone');
      const loginTypeStored = loginType === 'email' ? 'email' : 'phone';
      const analyticsService = require('../services/analytics').default;
      const properties = {
        entry_point: 'splash',
        is_new_user: 'no',
        login_by: loginTypeStored,
        Phone: loginType === 'phone' ? (cleanMobile || phoneNumber || displayPhoneNumber || '') : '',
        Mail: loginType === 'email' ? (cleanEmail || emailId || displayEmail || '') : '',
      };
      // Log login success and bind analytics user id for OTP logins
      analyticsService.logLoginSuccessful(loginTypeStored, properties);
      // Update AuthContext with user data
      console.log('[OTP] Full decoded result structure', {
        attemptId,
        decodedResult,
      });

      if (userId && authToken) {
        const userData = {
          userId: userId,
          mobile: loginType === 'phone' ? (mobile || cleanMobile || mobileNumber) : null,
          email: loginType === 'email' ? (email || emailId || cleanEmail) : null,
          key: userDataFromToken.key || '',
          name: name || '',
          displayName: name || 'User',
          authToken: authToken, // Include the token for persistence
        };
        console.log('[OTP] Setting authenticated user in context', {
          attemptId,
          userData,
        });
        // Ensure analytics layer knows this user's id
        analyticsService.setUserId(String(userId));
        const properties = {
          login_method: 'otp verification',
          is_logged_in: true,
          is_guest_user: false,
          login_by: loginType === 'email' ? 'email' : 'phone',
          userId : userData.userId,
          mobile: userData.mobile || '',
          email: userData.email || '',
          name: userData.name || '',
          displayName: userData.displayName || '',
        };
        analyticsService.setUserProperties(properties);
        const authResult = await setAuthenticatedUser(userData);
        console.log('[OTP] Auth context update result', {
          attemptId,
          authResult,
        });

        // Check subscription status after successful authentication
        if (authResult.success) {
          try {
            const subscriptionResult = await checkSubscriptionStatus();
            if (!subscriptionResult.success) {
              console.warn('[OTP] Failed to check subscription status', {
                attemptId,
                error: subscriptionResult.error,
              });
            }
          } catch (error) {
            console.error('[OTP] Error checking subscription status', {
              attemptId,
              error,
            });
          }
        }

        // Mark as verified and navigate
        setIsVerified(true);

        // Show success message
        const successMessage = loginType === 'email'
          ? 'Email verified successfully!'
          : 'Phone number verified successfully!';
        setToastMessage(successMessage);
        setToastType('success');
        setToastVisible(true);

        console.log('[OTP] Verification successful, navigating to MainTabs', {
          attemptId,
          source,
        });

        setTimeout(async () => {
          const applied = await runPostLoginRedirect({ navigation, checkSubscriptionStatus });
          if (!applied) {
            const pendingUrl = deepLinkingService.getAndClearPendingInitialUrl();
            if (pendingUrl && typeof pendingUrl === 'string' && pendingUrl.trim()) {
              deepLinkingService.setPostLoginDeeplinkHandled();
              navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
              setTimeout(() => deepLinkingService.processURL(pendingUrl), 100);
              return;
            }
            const pendingParsed = deepLinkingService.getAndClearPendingParsed();
            if (pendingParsed) {
              deepLinkingService.setPostLoginDeeplinkHandled();
              navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
              setTimeout(() => deepLinkingService.processParsed(pendingParsed), 100);
              return;
            }
            const deeplinkHandled = deepLinkingService.getAndClearPostLoginDeeplinkHandled();
            if (!deeplinkHandled) {
              navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
            }
          }
        }, 2000);
      } else {
        // If we don't have userId from token, treat as verification failure
        throw new Error('Invalid OTP, please try again.');
      }

    } catch (error) {
      // Log as warn so dev overlay doesn't show; error is already shown to user via toast
      console.warn('[OTP] OTP verification failed', {
        attemptId,
        source,
        message: error?.message,
      });

      // Restricted attempts: max 5 incorrect OTP attempts; countdown notification from 2nd consecutive wrong attempt
      setIncorrectAttempts((prev) => {
        const next = Math.min(5, prev + 1);
        console.log('[OTP] Updating incorrectAttempts after failure', {
          attemptId,
          previous: prev,
          next,
        });
        if (next >= 2) {
          const attemptsLeft = 5 - next;
          if (attemptsLeft === 0) {
            setInvalidOtpMessage('Invalid OTP Entered! Attempts Exhausted');
          } else {
            setInvalidOtpMessage(`Invalid OTP Entered! ${attemptsLeft} Attempts Left`);
          }
        } else {
          setInvalidOtpMessage('');
        }
        return next;
      });

      // Clear OTP input fields when verification fails
      setOtp(['', '', '', '']);

      // Focus on first input field for easy retry
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);

      setToastMessage(error.message || 'Invalid OTP, please try again.');
      setToastType('error');
      setToastVisible(true);
    } finally {
      verificationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  // Handle OS-level one-time-code autofill (SMS OTP suggestion / auto-fill).
  // On iOS this is driven by `textContentType="oneTimeCode"` and on Android
  // we also integrate with SMS Retriever below.
  const handleAutoFillOtpChange = useCallback(
    (value) => {
      // Keep only digits and at most 4 chars
      const numeric = (value || '').replace(/\D/g, '').slice(0, 4);
      setAutoOtpValue(numeric);
      console.log('[OTP] handleAutoFillOtpChange received value', {
        rawValue: value,
        numeric,
      });

      if (numeric.length === 4) {
        const digits = numeric.split('');
        // Reflect into the visible 4-input UI
        setOtp(digits);

        // Dismiss keyboard for a smoother transition
        if (Platform.OS !== 'web') {
          try {
            const { Keyboard } = require('react-native');
            Keyboard.dismiss();
          } catch (e) {
            // Ignore keyboard errors
          }
        }

        // Verify using the auto-filled code
        requestAnimationFrame(() => {
          handleVerifyOTP(digits, 'sms_autofill');
        });
      }
    },
    [handleVerifyOTP]
  );

  // Android-only: start SMS Retriever to auto-read OTP from incoming SMS
  // via react-native-otp-verify (no READ_SMS permission required).
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let listenerAttached = false;

    const startListening = async () => {
      try {
        const hashes = await getHash();
        console.log('Android SMS Retriever app hash(es):', hashes);

        await startOtpListener(message => {
          listenerAttached = true;
          if (!message) {
            return;
          }
          // Extract a 4–6 digit code from the SMS body
          const match = message.match(/\b(\d{4,6})\b/);
          if (match && match[1]) {
            const code = match[1].slice(0, 4);
            console.log('Received OTP via SMS Retriever:', code);
            handleAutoFillOtpChange(code);
          }
        });
      } catch (e) {
        console.warn('OTP SMS Retriever error', e);
      }
    };

    startListening();

    return () => {
      try {
        if (listenerAttached) {
          removeListener();
        }
      } catch (e) {
        // Best-effort cleanup
      }
    };
  }, [handleAutoFillOtpChange]);

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;

    setIsLoading(true);

    try {
      console.log('Resending OTP, userExists:', userExists, 'loginType:', loginType);

      let result;

      if (loginType === 'email') {
        // Email-based resend
        const email = emailId || cleanEmail;
        console.log('Resending OTP to email:', email);

        if (userExists) {
          // User exists, call sendOTP API with emailId
          console.log('User exists, calling sendOTP API');
          const sendOTPData = {
            emailId: email
          };

          result = await API.sendOTP(sendOTPData);
          console.log('SendOTP API result:', result);
        } else {
          // User doesn't exist, call register API
          console.log('User does not exist, calling register API');
          const registerData = {
            emailId: email,
            loginSource: 3,
            deviceType: getDeviceType().toString()
          };

          result = await API.registerUser(registerData);
          console.log('Register API result:', result);
        }
      } else {
        // Phone-based resend
        // Use cleanMobile if available, otherwise extract from phoneNumber
        let mobileNumber;
        let countryCode;

        if (cleanMobile) {
          mobileNumber = cleanMobile;
        } else if (phoneNumber && phoneNumber.startsWith('+')) {
          // Extract mobile number from full phone number
          const match = phoneNumber.match(/^\+(\d{1,3})(.+)$/);
          if (match) {
            mobileNumber = match[2];
            countryCode = match[1];
          } else {
            // Fallback: assume +91 and remove first 3 characters
            mobileNumber = phoneNumber.substring(3);
          }
        } else {
          // Fallback: use phoneNumber as mobile
          mobileNumber = phoneNumber || '';
        }

        const hashValue = await getHash();
        if (userExists) {
          // User exists, call sendOTP API
          console.log('User exists, calling sendOTP API');
          const sendOTPData = {
            mobile: mobileNumber,
            hash: hashValue,
            code: countryCode,
          };

          result = await API.sendOTP(sendOTPData);
          console.log('SendOTP API result:', result);
        } else {
          // User doesn't exist, call register API
          console.log('User does not exist, calling register API');
          const registerData = {
            mobile: mobileNumber,
            loginSource: 3,
            deviceType: getDeviceType().toString(),
            hash: hashValue,
            code: countryCode,
          };

          result = await API.registerUser(registerData);
          console.log('Register API result:', result);
        }
      }

      if (!result) {
        throw new Error('Failed to resend OTP');
      }
      // Response may be plain JSON or JWT; normalize to decoded payload
      const result1 =
        result && typeof result === 'object' && !Array.isArray(result) && 'success' in result
          ? result
          : API.decodeJwtToken(result);
      if (result1 && result1.success === false) {
        setToastMessage("Unable to send OTP. Try again or use another login method");
        setToastType('error');
        setToastVisible(true);
        return;
      }
      if (result1?.error) {
        throw new Error(result1.error || 'Failed to resend OTP');
      }
      // Store sessionId from response
      if (result1?.data && result1.data[0] && result1.data[0].sessionId) {
        setSessionId(result1.data[0].sessionId);
        console.log('SessionId stored:', result1.data[0].sessionId);
      }

      setToastMessage('New verification code sent!');
      setToastType('success');
      setToastVisible(true);

      // Reset incorrect attempt count so user gets 5 fresh attempts
      setIncorrectAttempts(0);
      setInvalidOtpMessage('');

      // Start resend cooldown (2 min 30 sec)
      setResendTimer(RESEND_OTP_COOLDOWN_SECONDS);

    } catch (error) {
      console.error('Resend OTP error:', error);

      setToastMessage(error.message || 'Failed to resend code. Please try again.');
      setToastType('error');
      setToastVisible(true);
    } finally {
      setIsLoading(false);
    }
  };

  const canVerify = otp.every(digit => digit !== '') && !isLoading;
  const canResend = resendTimer === 0 && !isLoading;
  const showButtons = !isVerified || !isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      <LinearGradient
        colors={['#1a1a1a', '#2d2d2d', '#1a1a1a']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + 20 : 20 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>OTP verification</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Main Content with Keyboard Handling */}
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          // Use padding on iOS for smoother animation, and default behavior on Android
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          // Offset by top inset so content doesn't jump when keyboard appears
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.welcomeSection}>
              <Svg width={60} height={60} viewBox="0 0 41 48" fill="none">
                <Path
                  d="M20.01 0L0 11.1471C0 25.9337 3.17057 41.1754 20.01 48C36.8494 41.1754 40.02 25.9337 40.02 11.1471L20.01 0ZM20.01 33.6454C14.682 33.6454 10.3646 29.328 10.3646 24C10.3646 18.672 14.682 14.3546 20.01 14.3546C25.338 14.3546 29.6554 18.672 29.6554 24C29.6554 29.328 25.338 33.6454 20.01 33.6454Z"
                  fill="#FFFFFF"
                />
                <Path
                  d="M23.8878 20.2543C23.298 19.8608 22.5 20.0151 22.1032 20.604L18.8118 25.4983L16.9166 23.5354C16.4246 23.0246 15.6103 23.0108 15.0986 23.5037C14.5878 23.9966 14.574 24.8108 15.0669 25.3217L18.0669 28.4288C18.3103 28.6808 18.6446 28.8214 18.9918 28.8214C19.0295 28.8214 19.0672 28.8197 19.1049 28.8163C19.4915 28.782 19.842 28.5754 20.0589 28.2531L24.2375 22.0388C24.6343 21.4491 24.4775 20.6511 23.8878 20.2543Z"
                  fill="#FFFFFF"
                />
              </Svg>
              <Text style={styles.welcomeTitle}>Enter Verification Code</Text>
              <Text style={styles.welcomeSubtitle}>
                We have sent a 4-digit code to your phone.{'\n'}
                <Text style={styles.phoneNumber}>
                  {loginType === 'email' ? (displayEmail || emailId || cleanEmail) : (displayPhoneNumber || phoneNumber)}
                </Text>
              </Text>
            </View>

            {/* OTP Input */}
            <View style={styles.otpContainer}>
              {/* <Text style={styles.otpLabel}>Enter the 4-digit code</Text> */}
              <View style={styles.otpInputContainer}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => (inputRefs.current[index] = ref)}
                    style={[
                      styles.otpInput,
                      digit && styles.otpInputFilled,
                      invalidOtpMessage ? styles.otpInputError : null
                    ]}
                    value={digit}
                    onChangeText={(text) => handleOtpChange(text, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    keyboardType="number-pad"
                    maxLength={1}
                  />
                ))}
              </View>

              {/* Countdown notification: show from 2nd consecutive wrong OTP */}
              {invalidOtpMessage ? (
                <Text style={styles.invalidOtpMessage}>{invalidOtpMessage}</Text>
              ) : null}

              {/* Hidden field to receive OS one-time-code auto-fill directly.
                  When the OS suggests an SMS code, it will often fill this
                  field; we then mirror it into the 4 visible boxes and
                  trigger verification automatically. */}
              {Platform.OS !== 'web' && (
                <TextInput
                  ref={autoOtpInputRef}
                  style={styles.hiddenOtpAutofillInput}
                  value={autoOtpValue}
                  onChangeText={handleAutoFillOtpChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : 'none'}
                  autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'off'}
                  importantForAutofill="yes"
                  // Keep it out of normal tab order / focus flow
                  autoCorrect={false}
                  autoCapitalize="none"
                  underlineColorAndroid="transparent"
                  accessible={false}
                  autoFocus
                />
              )}
            </View>

            {/* Verify / Re-enter CTA: when attempts exhausted, show Re-enter Mobile/Email and go back */}
            {showButtons && (
              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  (!canVerify || isVerified) && !(incorrectAttempts >= 5) && styles.disabledButton
                ]}
                onPress={
                  incorrectAttempts >= 5
                    ? () => navigation.goBack()
                    : () => handleVerifyOTP(undefined, 'verify_button')
                }
                disabled={incorrectAttempts >= 5 ? false : (!canVerify || isVerified)}
                activeOpacity={0.8}
              >
                <View style={styles.buttonContent}>
                  {isLoading && incorrectAttempts < 5 ? (
                    <Text style={styles.buttonText}>Verifying...</Text>
                  ) : isVerified ? (
                    <Text style={styles.buttonText}>Verified Successfully!</Text>
                  ) : incorrectAttempts >= 5 ? (
                    <Text style={styles.buttonText}>
                      {loginType === 'email' ? 'Re-enter Email Address' : 'Re-enter Mobile Number'}
                    </Text>
                  ) : (
                    <Text style={styles.buttonText}>Verify Code</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}

            {/* Resend OTP */}
            {showButtons && (
              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>Did not receive the code?</Text>
                <TouchableOpacity
                  onPress={handleResendOTP}
                  disabled={!canResend || isVerified}
                  style={styles.resendButton}
                >
                  <Text style={[
                    styles.resendButtonText,
                    (!canResend || isVerified) && styles.resendButtonDisabled
                  ]}>
                    {resendTimer > 0 ? `Resend in ${formatResendCountdown(resendTimer)}` : 'Resend Code'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>

      {/* Toast */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 30,
    paddingTop: 40,
    paddingBottom: 40,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 50,
  },
  welcomeTitle: {
    fontFamily: 'Product Sans',
    fontSize: 23,
    fontWeight: 700,
    color: '#FFFFFF',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    fontWeight: 400,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 23,
  },
  phoneNumber: {
    fontFamily: 'Product Sans',
    fontSize: 15,
    fontWeight: 400,
    color: '#FFFFFF',
  },
  otpContainer: {
    marginBottom: 40,
  },
  otpLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  otpInputContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 10,
  },
  otpInput: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    textAlign: 'center',
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  otpInputFilled: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
  },
  otpInputError: {
    borderColor: '#E53935',
  },
  invalidOtpMessage: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  verifyButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 24,
    marginBottom: 30,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  disabledButton: {
    backgroundColor: '#666666',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  resendText: {
    color: '#888888',
    fontSize: 14,
  },
  resendButton: {
    marginLeft: 4,
  },
  resendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  resendButtonDisabled: {
    color: '#666666',
    textDecorationLine: 'none',
  },
  // Hidden input that actually receives the OS one-time-code autofill.
  // We keep it effectively invisible but still focusable so the system
  // can attach its SMS code suggestion to it.
  hiddenOtpAutofillInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
    padding: 0,
    margin: 0,
  },
});

export default OTPVerificationScreen; 