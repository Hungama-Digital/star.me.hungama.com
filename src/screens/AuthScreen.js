import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ImageBackground,
  Image,
  StatusBar,
  Platform,
  BackHandler,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import Toast from '../components/Toast';
import FooterLinkModal from '../components/FooterLinkModal';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { runPostLoginRedirect } from '../utils/guestUtils';
import deepLinkingService from '../services/deepLinkingService';
// i18n not used in app
// import { useTranslation } from "react-i18next";
import LottieLoader from '../components/LottieLoader';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isIpad = Platform.OS === 'ios' && Platform.isPad;
// On iPad, primary and social buttons share this width so their start/end align (Figma)
const ipadButtonsContainerWidth = Math.min(screenWidth * 0.5, 420);
// On iPad, percentage height for the gradient overlay can fail; fill the container so the transparent-to-black merge matches mobile
const gradientOverlayStyleIpad = isIpad ? { top: 0, bottom: 0, height: undefined } : undefined;

// Default login config when Firebase/Remote Config is unavailable
const DEFAULT_LOGIN_CONFIG = {
  primaryLogin: 'phone',
  google: false,
  facebook: false,
  apple: true,
  guest: true,
};

// Wait for Firebase to be ready (native app can take a moment to register the default app)
const waitForFirebase = (maxWaitMs = 2500, intervalMs = 300) => {
  const { initializeFirebase, isFirebaseReady } = require('../config/firebase');
  
  return new Promise((resolve) => {
    initializeFirebase();
    if (isFirebaseReady()) {
      resolve(true);
      return;
    }
    let elapsed = 0;
    const id = setInterval(() => {
      initializeFirebase();
      elapsed += intervalMs;
      if (isFirebaseReady()) {
        clearInterval(id);
        resolve(true);
        return;
      }
      if (elapsed >= maxWaitMs) {
        clearInterval(id);
        resolve(false);
      }
    }, intervalMs);
  });
};

const AuthScreen = ({ navigation }) => {
  // const { t, i18n } = useTranslation(); // i18n not used in app
  const insets = useSafeAreaInsets();
  const { signInAsGuest, signInWithApple, signInWithFacebook } = useAuth();
  const { checkSubscriptionStatus } = useSubscription();
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  // Footer link modal state
  const [footerLinkModalVisible, setFooterLinkModalVisible] = useState(false);
  const [currentFooterLink, setCurrentFooterLink] = useState(null);

  // Remote Config state for login options
  const [loginConfig, setLoginConfig] = useState({
    primaryLogin: 'phone', // 'phone' or 'email' - determined from phone/email flags
    google: false, // Gmail login removed
    facebook: true,
    apple: true,
    guest: true, // allow guest login by default; controlled by Firebase Remote Config
  });
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  // Remote Config: onboarding_bg_image { image_url, fallback_color }. Null = use default local image.
  const [onboardingBg, setOnboardingBg] = useState(null);

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

  const handleGoogleSignInSuccess = async (user) => {
    console.log('Google Sign-In successful:', user);
    if (!user) {
      console.warn('Google Sign-In success callback received null/undefined user');
      return;
    }

    // Track analytics
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
      is_new_user: user.isNewUser ? 'yes' : 'no',
      login_by: user.email ? user.email : user.phoneNumber ? user.phoneNumber : 'unknown',
      Phone: user.phoneNumber || '',
      Mail: user.email || '',
      Name: user.displayName || '',
    };
    analyticsService.logLoginSuccessful('google', properties);
    // Also bind analytics user id for Google logins
    if (user?.uid) {
      analyticsService.setUserId(String(user.uid));
      const properties1 = {
        login_method: 'google',
        is_logged_in: true,
        is_guest_user: false,
        login_by: properties.login_by,
          mobile: properties.Phone || '',
          email: properties.Mail || '',
          name: properties.Name || '',
    };
    analyticsService.setUserProperties(properties1);
    }
    setToastMessage('Successfully signed in with Google!');
    setToastType('success');
    setToastVisible(true);
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
        const deeplinkHandled = deepLinkingService.getAndClearPostLoginDeeplinkHandled();
        if (!deeplinkHandled) {
          navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        }
      }
    }, 1500);
  };

  const handleGoogleSignInError = (error) => {
    console.error('Google Sign-In error:', error);
    setToastMessage(error || 'Google sign-in failed');
    setToastType('error');
    setToastVisible(true);
    const analyticsService = require('../services/analytics').default;
      var properties = {
        entry_point : "splash",
        fail_reason: error,
        error_code : error,
         }
         analyticsService.logLoginFailed('google', properties);
  };

  const handleSkipLogin = async () => {
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
    };
    analyticsService.logLoginMethodSelected('guest', properties);
    setIsGuestLoading(true);
    try {
      console.log('Creating guest user for skip login...');

      const result = await signInAsGuest();

      if (result.success) {
        console.log('Guest user created successfully:', result);

    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
      is_new_user: 'no',
      login_by: 'unknown',
      Phone: '',
      Mail: '',
    };
    analyticsService.logLoginSuccessful('guest', properties);
        // For guests, bind a stable analytics id ()
        analyticsService.setUserId('2498723492729');
        const properties2 = {
          login_method: 'guest',
          is_logged_in: true,
          is_guest_user: true,
          login_by: 'unknown',
        };
        analyticsService.setUserProperties(properties2);
        setToastMessage('Welcome! You can now browse as a guest.');
        setToastType('success');
        setToastVisible(true);

        // Reset navigation stack to MainTabs after a short delay
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
        }, 1500);
      } else {
        console.error('Failed to create guest user:', result.error);
        setToastMessage(result.error || 'Failed to create guest user');
        setToastType('error');
        setToastVisible(true);
      }
    } catch (error) {
      console.error('Error in handleSkipLogin:', error);
      setToastMessage('An error occurred while creating guest user');
      setToastType('error');
      setToastVisible(true);
    } finally {
      setIsGuestLoading(false);
    }
  };

  const handleFacebookSignInSuccess = async (user) => {
    console.log('Facebook Sign-In successful:', user);
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
      is_new_user: user.isNewUser ? 'yes' : 'no',
      login_by: user.email ? user.email : user.phoneNumber ? user.phoneNumber : 'unknown',
      Phone: user.phoneNumber || '',
      Mail: user.email || '',
      name: user.name || '',
      displayName: user.displayName || '',
    };
    analyticsService.logLoginSuccessful('facebook', properties);
    // Bind analytics user id for Facebook logins
    if (user?.uid) {
      analyticsService.setUserId(String(user.uid));
      const properties1 = {
        login_method: 'facebook',
        is_logged_in: true,
        is_guest_user: false,
        login_by: properties.login_by,
        userId : properties.userId,
          mobile: properties.Phone || '',
          email: properties.Mail || '',
          name: properties.name || '',
          displayName: properties.displayName || '',
    };
    analyticsService.setUserProperties(properties1);
    }
  
    setToastMessage('Successfully signed in with Facebook!');
    setToastType('success');
    setToastVisible(true);
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
        const deeplinkHandled = deepLinkingService.getAndClearPostLoginDeeplinkHandled();
        if (!deeplinkHandled) {
          navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        }
      }
    }, 1500);
  };

  const handleFacebookSignInError = (error) => {
    console.error('Facebook Sign-In error:', error);
    setToastMessage(error || 'Facebook sign-in failed');
    setToastType('error');
    setToastVisible(true);
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
      fail_reason: error,
      error_code: error,
    };
    analyticsService.logLoginFailed('facebook', properties);
  };

  const handleFacebookSignIn = async () => {
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
    };
    analyticsService.logLoginMethodSelected('facebook', properties);
    try {
      setIsFacebookLoading(true);
      const result = await signInWithFacebook();

      if (result.success) {
        handleFacebookSignInSuccess(result.user);
      } else {
        handleFacebookSignInError(result.error);
      }
    } catch (error) {
      handleFacebookSignInError(error.message || 'Facebook sign-in failed');
    } finally {
      setIsFacebookLoading(false);
    }
  };

  const handleAppleSignInSuccess = async (user) => {
    console.log('Apple Sign-In successful:', user);
    
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
      is_new_user: user.isNewUser ? 'yes' : 'no',
      login_by: user.email ? user.email : user.phoneNumber ? user.phoneNumber : 'unknown',
      Phone: user.phoneNumber || '',
      Mail: user.email || '',
    };
    analyticsService.logLoginSuccessful('apple', properties);
    // Bind analytics user id for Apple logins
    if (user?.uid) {
      analyticsService.setUserId(String(user.uid));
      const properties = {
        login_method: 'apple',
        is_logged_in: true,
        is_guest_user: false,
        login_by: user.email ? user.email : user.phoneNumber ? user.phoneNumber : 'unknown',
    };
    analyticsService.setUserProperties(properties);
    }
    setToastMessage('Successfully signed in with Apple!');
    setToastType('success');
    setToastVisible(true);
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
        const deeplinkHandled = deepLinkingService.getAndClearPostLoginDeeplinkHandled();
        if (!deeplinkHandled) {
          navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        }
      }
    }, 1500);
  };

  const handleAppleSignInError = (error) => {
    console.error('Apple Sign-In error:', error);
    setToastMessage(error || 'Apple sign-in failed');
    setToastType('error');
    setToastVisible(true);
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
      fail_reason: error,
      error_code: error,
    };
    analyticsService.logLoginFailed('apple', properties);
  };

  const handleEmailSignIn = () => {
    const analyticsService = require('../services/analytics').default;
    const properties = {
      entry_point: 'splash',
    };
    analyticsService.logLoginMethodSelected('email', properties);
    // Navigate to Email Login Screen
    navigation.navigate('EmailLogin');
  };

  // Calculate visible social buttons count for dynamic width
  const getVisibleSocialButtons = () => {
    const buttons = [];
    // Google (Gmail) login removed
    if (loginConfig.facebook) buttons.push('facebook');
    if (loginConfig.apple && Platform.OS === 'ios') buttons.push('apple');
    return buttons;
  };

  const visibleSocialButtons = getVisibleSocialButtons();
  const socialButtonCount = visibleSocialButtons.length;

  // Handle footer link clicks
  const handleFooterLinkClick = async (linkType) => {
    console.log('🔗 Footer link clicked:', linkType);
    try {
      if (linkType === 'terms') {
        navigation.navigate('LegalWebView', {
          title: 'Terms & Conditions',
          url: 'https://fasttv.app/terms',
        });
      } else if (linkType === 'privacy') {
        navigation.navigate('LegalWebView', {
          title: 'Privacy Policy',
          url: 'https://fasttv.app/privacy',
        });
      }
    } catch (error) {
      console.error('Error handling footer link click:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to load content. Please try again.');
    }
  };

  // Close footer link modal
  const handleCloseFooterLinkModal = () => {
    setFooterLinkModalVisible(false);
    setCurrentFooterLink(null);
  };

  // Load Firebase Remote Config
  useEffect(() => {
    const loadRemoteConfig = async () => {
      if (Platform.OS === 'web') {
        setLoginConfig(DEFAULT_LOGIN_CONFIG);
        setIsConfigLoading(false);
        return;
      }

      const firebaseReady = await waitForFirebase();
      if (!firebaseReady) {
        console.log('Remote Config: Firebase not ready, using default config');
        setLoginConfig(DEFAULT_LOGIN_CONFIG);
        setIsConfigLoading(false);
        return;
      }

      let getApp;
      let getRemoteConfig;
      let setDefaults;
      let setConfigSettings;
      let fetchAndActivate;
      let getString;
      try {
        const appModule = require('@react-native-firebase/app');
        const remoteConfigModule = require('@react-native-firebase/remote-config');
        getApp = appModule.getApp;
        getRemoteConfig = remoteConfigModule.getRemoteConfig;
        setDefaults = remoteConfigModule.setDefaults;
        setConfigSettings = remoteConfigModule.setConfigSettings;
        fetchAndActivate = remoteConfigModule.fetchAndActivate;
        getString = remoteConfigModule.getString;
      } catch (e) {
        console.log('Remote Config: Module not available, using default config', e?.message);
        setLoginConfig(DEFAULT_LOGIN_CONFIG);
        setIsConfigLoading(false);
        return;
      }

      try {
        const app = getApp();
        const remoteConfig = getRemoteConfig(app);

        const defaultRegionConfig = {
          region_feature_config: JSON.stringify({
            login: {
              phone: true,
              email: false,
              google: true,
              facebook: true,
              apple: true,
              guest: true,
            },
            features: {
              new_home: false,
              upi_payments: false,
              referrals: true,
            },
          }),
          onboarding_bg_image: JSON.stringify({
            image_url: '',
            fallback_color: '#0F0F0F',
          }),
        };

        await setDefaults(remoteConfig, defaultRegionConfig);
        await setConfigSettings(remoteConfig, {
          minimumFetchIntervalMillis: 60 * 1000,
        });
        await fetchAndActivate(remoteConfig);

        const jsonStr = getString(remoteConfig, 'region_feature_config') || '{}';

        let cfg = {};
        try {
          cfg = JSON.parse(jsonStr || "{}");
        } catch (e) {
          console.warn('Remote Config: Failed to parse JSON, using defaults', e);
          cfg = {};
        }

        const login = cfg.login || {};

        // Determine primary login based on which one is enabled
        // Only one should be enabled at a time (phone OR email)
        // Handle both boolean and string values from Remote Config
        const phoneEnabled = login.phone === true || login.phone === 'true' || login.phone === 1;
        const emailEnabled = login.email === true || login.email === 'true' || login.email === 1;

        let primaryLogin = 'phone'; // Default fallback
        if (phoneEnabled && !emailEnabled) {
          primaryLogin = 'phone';
        } else if (!phoneEnabled && emailEnabled) {
          primaryLogin = 'email';
        } else if (!phoneEnabled && !emailEnabled) {
          // Both disabled - default to phone
          primaryLogin = 'phone';
        } else if (phoneEnabled && emailEnabled) {
          // Both enabled - prefer email if both are true, or use primaryLogin field if provided
          primaryLogin = (login.primaryLogin === 'email') ? 'email' : 'phone';
        }

        console.log('Remote Config: Determined primaryLogin:', primaryLogin, 'from phone:', login.phone, 'email:', login.email);
        console.log('Remote Config: Parsed values - phoneEnabled:', phoneEnabled, 'emailEnabled:', emailEnabled);

        // Guest login: default true; set false in Remote Config to disable guest mode
        const guestEnabled = login.guest !== false && login.guest !== 'false' && login.guest !== 0;

        setLoginConfig({
          primaryLogin: primaryLogin,
          google: false,
          facebook: false,
          apple: !!login.apple && Platform.OS === 'ios', // Apple only on iOS
          guest: guestEnabled,
        });

        // Parse onboarding_bg_image for login screen background (optional)
        try {
          const onboardingBgStr = getString(remoteConfig, 'onboarding_bg_image') || '';
          if (onboardingBgStr) {
            const bgObj = JSON.parse(onboardingBgStr);
            const imageUrl = typeof bgObj?.image_url === 'string' ? bgObj.image_url.trim() : '';
            if (imageUrl) {
              setOnboardingBg({
                imageUri: imageUrl,
                fallbackColor: typeof bgObj?.fallback_color === 'string' ? bgObj.fallback_color.trim() : '#0F0F0F',
              });
              console.log('Remote Config: onboarding_bg_image loaded', { imageUrl, fallbackColor: bgObj.fallback_color });
            }
          }
        } catch (parseErr) {
          console.warn('Remote Config: onboarding_bg_image parse failed, using default BG', parseErr);
        }

        console.log('Remote Config: Loaded successfully', { login, guest: guestEnabled });
      } catch (err) {
        console.warn('Remote Config: Error loading config, using defaults', err);
        setLoginConfig(DEFAULT_LOGIN_CONFIG);
      } finally {
        setIsConfigLoading(false);
      }
    };

    loadRemoteConfig();
  }, []);

  const defaultBgSource = isIpad
    ? require('../../assets/background_image.png')
    : require('../../assets/carousels/login_background.png');
  const bgSource = onboardingBg?.imageUri ? { uri: onboardingBg.imageUri } : defaultBgSource;
  const containerBgColor = onboardingBg?.fallbackColor ?? undefined;

  // Don't render login options until Remote Config is loaded
  if (isConfigLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: isIpad ? 'black' : containerBgColor }]}>
        <ImageBackground
          source={bgSource}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          imageStyle={styles.backgroundImageStyle}
        >
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)']}
            locations={[0, 0.4, 0.7, 1]}
            style={[styles.gradientOverlay, gradientOverlayStyleIpad]}
          />
          <View style={styles.loadingContainer}>
            <LottieLoader size="large" />
          </View>
        </ImageBackground>
      </View>
    );
  }

  return (
      <ImageBackground
        source={bgSource}
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: '80%' },
          isIpad && { backgroundColor: 'black' },
        ]}
        resizeMode={isIpad ? 'cover' : 'stretch'}
        imageStyle={styles.backgroundImageStyle}
      >
      <StatusBar barStyle="light-content" />
      {/* Gradient Overlay - Creates smooth transition from background to footer (explicit height on iPad so shade is visible) */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)']}
        locations={[0, 0.4, 0.7, 1]}
        style={[styles.gradientOverlay, gradientOverlayStyleIpad]}
      />

      {/* Content: on iPad vertically centered in remaining space below image with "By continuing" at bottom; on phone aligned to bottom */}
      <View style={[styles.bottomContent, isIpad && styles.bottomContentIpad]}>
        {/* On iPad: spacer for image area so content is centered only in the space below the image */}
        {isIpad && <View style={styles.imageSpacerIpad} />}
        {/* Centered block (iPad: in remaining space; phone: part of flow) */}
        <View style={[styles.contentBlock, isIpad && styles.contentBlockCentered]}>
          {/* Text Overlay - Above buttons */}
          <View style={styles.textOverlay}>
            <Text style={[styles.mainTitle, isIpad && styles.mainTitleIpad]}>Binge Short Drama in Minutes</Text>
            <Text style={[styles.subtitle, isIpad && styles.subtitleIpad]}>Quick episodes. Real emotions.</Text>
          </View>

          {/* On iPad: same-width container so primary and social row align (Figma) */}
          <View style={isIpad ? styles.buttonsContainerIpad : styles.buttonsContainerPhone}>
          {/* Primary Login Button - Phone OR Email (only one) */}
          {loginConfig.primaryLogin === 'phone' && (
            <TouchableOpacity
              style={[styles.phoneButton, isIpad && styles.phoneButtonIpad]}
              onPress={() => navigation.navigate('PhoneLogin')}
              activeOpacity={0.8}
            >
              <View style={styles.phoneButtonContent}>
                <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2a15.161 15.161 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1.01A11.36 11.36 0 018.59 3.99C8.59 3.44 8.14 3 7.59 3H4.03C3.48 3 3 3.45 3 4.01c0 9.95 8.03 18 17.99 18 .56 0 1.01-.45 1.01-1.01v-3.61c-.01-.57-.46-1.01-1.01-1.01z"
                    fill="#000000"
                  />
                </Svg>
                <Text style={[styles.phoneButtonText, isIpad && styles.phoneButtonTextIpad]}>Continue with Phone Number</Text>
              </View>
            </TouchableOpacity>
          )}

          {loginConfig.primaryLogin === 'email' && (
            <TouchableOpacity
              style={[styles.phoneButton, isIpad && styles.phoneButtonIpad]}
              onPress={handleEmailSignIn}
              activeOpacity={0.8}
            >
              <View style={styles.phoneButtonContent}>
                <Svg width="18" height="16" viewBox="0 0 18 16" fill="none">
                  <Path
                    d="M16.375 0.215277L9.39543 6.12393C9.13873 6.34104 8.78304 6.33646 8.53137 6.11294L1.80518 0.141991C2.06271 0.0494678 2.33787 0 2.62309 0H15.3767C15.7307 0 16.0671 0.0760338 16.375 0.215277Z"
                    fill="#000000"
                  />
                  <Path
                    d="M18 2.86452V12.8854C18 14.4675 16.8256 15.75 15.3768 15.75H2.6232C1.17444 15.75 0 14.4675 0 12.8854V2.86452C0 2.2819 0.159389 1.73959 0.433705 1.28705L7.47364 7.53465C7.9107 7.92306 8.44004 8.11819 8.96938 8.11819C9.49872 8.11819 9.99282 7.93589 10.4232 7.57129L17.6569 1.44736C17.875 1.86509 18 2.34877 18 2.86452Z"
                    fill="#000000"
                  />
                </Svg>
                <Text style={[styles.phoneButtonText, isIpad && styles.phoneButtonTextIpad]}>Continue with Email</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Social Login Buttons Row - Google, Facebook, Apple (matching widths) */}
          {socialButtonCount > 0 && (
            <View style={[styles.socialButtonsRow, isIpad && styles.socialButtonsRowIpad]}>
              {/* Google (Gmail) login removed */}

              {/* Facebook Button */}
              {loginConfig.facebook && (
                <TouchableOpacity
                  style={[
                    styles.socialButton,
                    isIpad && styles.socialButtonIpad,
                    {
                      flex: 1,
                      marginLeft: socialButtonCount > 1 ? 5 : 0,
                      marginRight: socialButtonCount > 2 ? 5 : 0,
                    }
                  ]}
                  onPress={handleFacebookSignIn}
                  activeOpacity={0.8}
                  disabled={isFacebookLoading}
                >
                  {isFacebookLoading ? (
                    <LottieLoader size="small" />
                  ) : (
                    <Svg width="28" height="28" viewBox="0 0 18 18" fill="none">
                      <Circle cx="9" cy="9" r="9" fill="#1877F2" />
                      <Path
                        d="M10.5 6V7.5H11.5V9H10.5V13H8.5V9H7.5V7.5H8.5V6.5C8.5 5.67 9.17 5 10 5H11.5V6.5H10C9.72 6.5 9.5 6.72 9.5 7V7.5H11.5V9H10.5Z"
                        fill="white"
                      />
                    </Svg>
                  )}
                </TouchableOpacity>
              )}

              {/* Apple Button - Only on iOS */}
              {loginConfig.apple && Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[
                    styles.socialButton,
                    isIpad && styles.socialButtonIpad,
                    {
                      flex: 1,
                      marginLeft: socialButtonCount > 2 ? 5 : 0,
                    }
                  ]}
                  onPress={async () => {
                    try {
                      const result = await signInWithApple();
                      if (result.success) {
                        handleAppleSignInSuccess(result.user);
                      } else {
                        handleAppleSignInError(result.error);
                      }
                    } catch (error) {
                      handleAppleSignInError(error.message);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Image
                    source={require('../../assets/apple-icon.png')}
                    style={[styles.appleIcon, isIpad && styles.appleIconIpad]}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
          </View>

          {/* Skip Sign In Link - only shown when Remote Config allows guest login */}
          {loginConfig.guest && (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkipLogin}
              disabled={isGuestLoading}
              activeOpacity={0.7}
            >
              {isGuestLoading ? (
                <LottieLoader size="small" />
              ) : (
                <Text style={[styles.skipButtonText, isIpad && styles.skipButtonTextIpad]}>Skip</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Terms and Privacy - at bottom; excluded from centered block on iPad. On iPad single Text so it can flow on one line. */}
        <View style={[styles.termsContainer, isIpad && styles.termsContainerIpad]}>
          {isIpad ? (
            <Text style={[styles.termsText, styles.termsTextIpad]}>
              <Text style={styles.termsText1}>By continuing, you agree to our </Text>
              <Text
                style={[styles.linkText, styles.linkTextIpad]}
                onPress={() => handleFooterLinkClick('terms')}
              >
                Terms of Service
              </Text>
              <Text style={styles.termsText1}> and </Text>
              <Text
                style={[styles.linkText, styles.linkTextIpad]}
                onPress={() => handleFooterLinkClick('privacy')}
              >
                Privacy Policy.
              </Text>
            </Text>
          ) : (
            <>
              <Text style={styles.termsText}>
                <Text style={styles.termsText1}>By continuing, you agree to our{' '}</Text>
                <Text style={styles.linkText} onPress={() => handleFooterLinkClick('terms')}>
                  Terms of Service
                </Text>
              </Text>
              <Text style={styles.termsText}>
                <Text style={styles.termsText1}>and{' '}</Text>
                <Text style={styles.linkText} onPress={() => handleFooterLinkClick('privacy')}>
                  Privacy Policy.
                </Text>.
              </Text>
            </>
          )}
        </View>
      </View>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />

      {/* Footer Link Modal */}
      <FooterLinkModal
        visible={footerLinkModalVisible}
        onClose={handleCloseFooterLinkModal}
        link={currentFooterLink}
      />
      </ImageBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundImageStyle: {
    opacity: 1,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '120%',
    zIndex: 0,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    zIndex: 1,
  },
  bottomContentIpad: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
    paddingTop: 24,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  // Reserves top ~45% as "image area"; content is centered in the remaining space below
  imageSpacerIpad: {
    flex: 0.45,
  },
  contentBlock: {},
  contentBlockCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 80,
  },
  buttonsContainerIpad: {
    alignSelf: 'center',
    width: ipadButtonsContainerWidth,
  },
  buttonsContainerPhone: {},
  textOverlay: {
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 23,
    lineHeight: 30, // Increased line height to prevent the 'g' from being cropped
    letterSpacing: 0,
    textAlign: 'center',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  mainTitleIpad: {
    fontSize: 28,
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: 'Product Sans',
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#CCCCCC',
  },
  subtitleIpad: {
    fontSize: 18,
    lineHeight: 23,
  },
  phoneButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  phoneButtonIpad: {
    paddingVertical: 20,
    paddingHorizontal: 26,
    marginBottom: 18,
    width: '100%',
  },
  phoneButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneButtonText: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: 0,
    color: '#000000',
    marginLeft: 12,
  },
  phoneButtonTextIpad: {
    fontSize: 17,
    lineHeight: 24,
  },
  socialButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 0,
    width: '100%',
  },
  socialButtonsRowIpad: {
    marginBottom: 20,
    width: '100%',
  },
  socialButton: {
    height: 54,
    backgroundColor: 'rgba(255, 255, 255, 0.212)', // #FFFFFF36
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)', // #FFFFFF33
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginVertical: 0,
    minHeight: 54,
    minWidth: 60,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    // Remove fixed width to allow flex distribution
  },
  socialButtonIpad: {
    height: 60,
    minHeight: 60,
    minWidth: 60,
    borderRadius: 12,
  },
  socialButtonText: {
    display: 'none',
  },
  appleIcon: {
    width: 18,
    height: 18,
  },
  appleIconIpad: {
    width: 16,
    height: 16,
  },
  facebookIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1877F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  skipButtonText: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: 0,
    color: '#FFFFFF',
  },
  skipButtonTextIpad: {
    fontSize: 17,
    lineHeight: 22,
  },
  termsContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  termsContainerIpad: {
    width: '100%',
    paddingHorizontal: 8,
  },
  termsText: {
    fontFamily: 'Product Sans',
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#DDDDDD',
  },
  termsTextIpad: {
    fontSize: 15,
    lineHeight: 20,
  },
  termsText1: {
    opacity: 0.6,
  },
  linkText: {
    color: '#FFFFFF',
    fontSize: 13,
    textDecorationLine: 'underline',
    fontWeight: '400',
  },
  linkTextIpad: {
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AuthScreen; 