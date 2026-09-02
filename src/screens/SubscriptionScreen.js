import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
  Platform,
  BackHandler,
  ImageBackground,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieLoader from '../components/LottieLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Text as SvgText, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import StripeCardForm from '../components/StripeCardForm';
import { requestIosSubscription, IOS_PRODUCT_IDS } from '../services/iapService';
import { FourK, Devices, Block, AppLogo } from '../components/Icons';
import { usePaymentFeedback } from '../context/PaymentFeedbackContext';

// Conditional import - only import when needed
// import StripeCardForm from '../components/StripeCardForm';

const { width } = Dimensions.get('window');

const StarIcon = ({ size = 13, color = '#8A7A6A', style }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 13 13"
    fill="none"
    style={style}
  >
    <Path
      d="M6.13934 0.755273C6.19149 0.649918 6.29887 0.583252 6.41642 0.583252C6.53398 0.583252 6.64136 0.649918 6.69351 0.755273L8.04101 3.48469C8.22096 3.84956 8.56886 4.10257 8.97142 4.16136L11.9849 4.60236C12.1014 4.61923 12.1982 4.70078 12.2346 4.81271C12.271 4.92464 12.2407 5.04752 12.1564 5.12969L9.97709 7.25186C9.68507 7.53601 9.55175 7.94577 9.62067 8.34736L10.1352 11.3457C10.1557 11.4621 10.1081 11.5801 10.0124 11.6496C9.91673 11.7191 9.7898 11.7279 9.68542 11.6724L6.99159 10.256C6.63133 10.0666 6.20094 10.0666 5.84067 10.256L3.14742 11.6724C3.04309 11.7276 2.9164 11.7186 2.82093 11.6492C2.72545 11.5797 2.67786 11.462 2.69826 11.3457L3.21217 8.34794C3.2813 7.94616 3.14797 7.53614 2.85576 7.25186L0.676424 5.13027C0.591439 5.04819 0.560668 4.92485 0.597136 4.81247C0.633605 4.70009 0.730936 4.61831 0.847924 4.60177L3.86084 4.16136C4.26384 4.10293 4.61224 3.84986 4.79242 3.48469L6.13934 0.755273"
      stroke={color}
      strokeWidth={1.16667}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SubscriptionScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const {
    subscriptionDetails,
    subscribeUser,
    isEligibleForSubscription,
    checkSubscriptionStatus,
  } = useSubscription();
  const { user, isAuthenticated } = useAuth();
  const {
    registerPaymentAttempt,
    showPaymentFailed,
    showPaymentSuccess,
    visible: paymentPopupVisible,
    skipSubscriptionRedirectForIap,
  } = usePaymentFeedback();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCardForm, setShowCardForm] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [planDetails, setPlanDetails] = useState(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [isIosPaymentLoading, setIsIosPaymentLoading] = useState(false);
  const [iosPaymentPhase, setIosPaymentPhase] = useState('opening'); // 'opening' | 'processing'
  const iosPaymentLoaderTimeoutRef = React.useRef(null);

  // Get plans data from route params (passed from ProfileScreen)
  const { plansData, fromProfile } = route?.params || {};

  useEffect(() => {
    const backAction = () => {
      if (isAuthenticated) {
        navigation.navigate('MainTabs', { screen: 'Home' });
      } else if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('MainTabs', { screen: 'Home' });
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation, isAuthenticated]);

  // Fetch localized plan details and select correct variant (73 trial / 74 regular)
  useEffect(() => {
    const fetchPlanDetails = async () => {
      try {
        const details = await API.getPlanPageDetails('en', 84);
        const defaults = details?.default;
        if (defaults && (defaults['73'] || defaults['74'])) {
          const key = isEligibleForSubscription ? '73' : '74';
          const selected = defaults[key] || defaults['73'] || defaults['74'];
          setPlanDetails(selected);
          console.log('selected: ', selected)
        } else if (defaults) {
          // Fallback: if structure changes, at least use the first entry
          const firstKey = Object.keys(defaults)[0];
          setPlanDetails(defaults[firstKey]);
        }
      } catch (err) {
        console.error('Failed to fetch plan details:', err);
      }
    };

    fetchPlanDetails();
  }, [isEligibleForSubscription]);

  // Ticker rotation effect
  useEffect(() => {
    let interval;
    if (planDetails && Array.isArray(planDetails.plan_page_text_7) && planDetails.plan_page_text_7.length > 0) {
      interval = setInterval(() => {
        setTickerIndex(prev => (prev + 1) % planDetails.plan_page_text_7.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [planDetails]);

  // Clear iOS payment loader timeout on unmount
  useEffect(() => {
    return () => {
      if (iosPaymentLoaderTimeoutRef.current) {
        clearTimeout(iosPaymentLoaderTimeoutRef.current);
        iosPaymentLoaderTimeoutRef.current = null;
      }
    };
  }, []);

  // Resolve userId with fallback to AsyncStorage
  useEffect(() => {
    const resolveUserId = async () => {
      let uid = user?.uid;

      if (!uid) {
        try {
          const storedUser = await AsyncStorage.getItem('user');
          if (storedUser) {
            const userData = JSON.parse(storedUser);
            uid = userData.uid || userData.id || userData.userId;
          }
        } catch (error) {
          console.error('Error resolving user ID:', error);
        }
      }

      setResolvedUserId(uid);
    };

    resolveUserId();
  }, [user]);

  // iOS: Hide loader when payment popup (success/error) becomes visible
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!isIosPaymentLoading) return;
    if (!paymentPopupVisible) return;

    setIsIosPaymentLoading(false);
    if (iosPaymentLoaderTimeoutRef.current) {
      clearTimeout(iosPaymentLoaderTimeoutRef.current);
      iosPaymentLoaderTimeoutRef.current = null;
    }
  }, [isIosPaymentLoading, paymentPopupVisible]);

  // IAP purchase completion is handled at app level by IapListenerSetup.
  // SubscriptionScreen only starts the purchase flow (requestIosSubscription) when user taps a plan.

  // Conditionally import StripeCardForm when needed
  useEffect(() => {
    const loadStripeCardForm = async () => {
      try {
        // Enhanced authentication check with fallback
        let isAuthenticated = false;

        if (user?.uid) {
          isAuthenticated = true;
        } else {
          // Fallback: check AsyncStorage for authentication
          try {
            const authToken = await AsyncStorage.getItem('authToken');
            const storedUser = await AsyncStorage.getItem('user');

            if (authToken && storedUser) {
              const userData = JSON.parse(storedUser);
              if (userData.uid || userData.id || userData.userId) {
                isAuthenticated = true;
              }
            }
          } catch (error) {
            console.error('Error in fallback auth check for StripeCardForm:', error);
          }
        }

        if (showCardForm && selectedPlan && plans.length > 0 && !loading && isAuthenticated) {
          // Additional validation before loading
          const plan = plans.find(p => p.id === selectedPlan);
          if (!plan || !plan.price) {
            console.warn('Invalid plan data, not loading StripeCardForm');
            return;
          }

          const priceStr = plan.price.replace(/[₹$,]/g, '');
          const amount = parseFloat(priceStr);
          if (isNaN(amount) || amount <= 0) {
            console.warn('Invalid amount, not loading StripeCardForm');
            return;
          }
        } 
      } catch (error) {
        console.error('Failed to load StripeCardForm:', error);
        // Optionally show an error to the user
        require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to load payment form. Please try again.');
      }
    };

    loadStripeCardForm();
  }, [showCardForm, selectedPlan, plans, loading, user]);

  // Fetch subscription plans from route params or use empty array
  const fetchSubscriptionPlans = async () => {
    try {
      setLoading(true);

      // Use plans data from route params if available
      if (plansData && Array.isArray(plansData) && plansData.length > 0) {
        const subscriptionPlans = plansData.map(plan => ({
          id: plan.path?.toString() || plan.id?.toString(),
          title: plan.title,
          price: `₹${plan.rate}`,
          period: plan.validityDays === '30' ? 'month' : plan.validityDays === '365' ? 'year' : 'custom',
          validityDays: plan.validityDays,
          description: plan.description,
          subscriptionType: plan.subscriptionType,
          subscriptionFrequency: plan.subscriptionFrequency,
          isActive: plan.isActive === 1,
        }));

        setPlans(subscriptionPlans);

        // Set the first plan as selected by default
        if (subscriptionPlans.length > 0 && !selectedPlan) {
          setSelectedPlan(subscriptionPlans[0].id);
        }
      } else {
        // No plans data available
        setPlans([]);
      }
    } catch (error) {
      console.error('Error processing subscription plans:', error);
    } finally {
      setLoading(false);
    }
  };

  // Process plans data from route params or fetch from API
  React.useEffect(() => {
    if (fromProfile && plansData && plansData.length > 0) {
      console.log('=== Using Plans Data from ProfileScreen ===');
      console.log('Plans data received:', plansData);

      // Process the plans data received from ProfileScreen
      const subscriptionPlans = plansData.map(plan => ({
        id: plan.path.toString(),
        title: plan.title,
        price: `₹${plan.rate}`,
        period: plan.validityDays === '30' ? 'month' : plan.validityDays === '365' ? 'year' : 'custom',
        validityDays: plan.validityDays,
        description: plan.description,
        subscriptionType: plan.subscriptionType,
        subscriptionFrequency: plan.subscriptionFrequency,
        isActive: plan.isActive === 1,
      }));

      console.log('=== Decoded Plans Data in SubscriptionScreen ===');
      console.log('Original plans data:', plansData);
      console.log('Processed plans:', subscriptionPlans);

      setPlans(subscriptionPlans);
      setLoading(false);

      // Set the first plan as selected by default
      if (subscriptionPlans.length > 0 && !selectedPlan) {
        setSelectedPlan(subscriptionPlans[0].id);
      }

      console.log('Processed plans:', subscriptionPlans);
    } else {
      // Fetch plans from API if not provided from ProfileScreen
      console.log('=== Fetching Plans from API ===');
      fetchSubscriptionPlans();
    }
  }, [fromProfile, plansData]);

  const handlePaymentCancel = () => {
    setShowCardForm(false);
  };

  const handlePaymentSuccess = async (result) => {
    try {
      const plan = plans.find(p => p.id === selectedPlan);
      await subscribeUser(plan);
      setShowCardForm(false);

      // Give backend time to update subscription status, then refresh so "Subscribed" shows on Home
      await new Promise((r) => setTimeout(r, 2500));
      try {
        await checkSubscriptionStatus();
      } catch (e) {
        console.warn('Subscription status refresh after payment:', e);
      }

      if (Platform.OS === 'ios') {
        // Derive display details for success popup
        const planTitle = plan?.title || '';
        let amountLabel = plan?.price || '';
        if (plan?.validityDays) {
          const days = Number(plan.validityDays);
          if (!Number.isNaN(days) && days > 0) {
            if (days === 7) {
              amountLabel = `${plan.price} / 3 days`;
            } else if (days === 30) {
              amountLabel = `${plan.price} / month`;
            } else if (days === 90) {
              amountLabel = `${plan.price} / 3 months`;
            } else if (days === 365) {
              amountLabel = `${plan.price} / year`;
            } else {
              amountLabel = `${plan.price} / ${days} days`;
            }
          }
        }

        let validTillLabel = '';
        if (plan?.validityDays) {
          const days = Number(plan.validityDays);
          if (!Number.isNaN(days) && days > 0) {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + days);
            const day = expiry.getDate().toString().padStart(2, '0');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = monthNames[expiry.getMonth()];
            const year = expiry.getFullYear();
            validTillLabel = `${day} ${month} ${year}`;
          }
        }

        const orderId = result?.orderId || result?.transactionId || '';

        // iOS: show success bottom sheet with "Start Watching"
        showPaymentSuccess({
          plan: planTitle,
          amount: amountLabel,
          orderId,
          validTill: validTillLabel,
          onPrimary: () => {
            if (isAuthenticated) {
              navigation.navigate('MainTabs', { screen: 'Home' });
            } else if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('MainTabs', { screen: 'Home' });
            }
          },
        });
      } else {
        // Android: no success popup, just navigate as before
        if (isAuthenticated) {
          navigation.navigate('MainTabs', { screen: 'Home' });
        } else if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('MainTabs', { screen: 'Home' });
        }
      }
    } catch (error) {
      console.error('Error activating subscription:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Payment succeeded but there was an issue activating your subscription. Please contact support.');
    }
  };

  const hasUsedTrial = useMemo(() => {
    return subscriptionDetails?.hasUsedTrial === true;
  }, [subscriptionDetails]);

  const isGoldUser = useMemo(() => {
    const normalized = subscriptionDetails?.normalizedProfileType;
    if (!normalized) return false;
    return (
      normalized === 'gold user' ||
      normalized === 'gold' ||
      normalized === 'golduser'
    );
  }, [subscriptionDetails]);

  const isFreeUser = !isGoldUser;

  const handleIosStartTrial = async () => {
    if (Platform.OS !== 'ios') return;
    if (isIosPaymentLoading) return;
    registerPaymentAttempt({ onRetry: handleIosStartTrial, onCancel: handleClose });
    setIosPaymentPhase('opening');
    setIsIosPaymentLoading(true);
    try {
      await requestIosSubscription(IOS_PRODUCT_IDS.TRIAL_3DAY_1R);
    } catch (e) {
      setIsIosPaymentLoading(false);
      showPaymentFailed();
    }
  };

  const handleIosSubscribeRegular = async () => {
    if (Platform.OS !== 'ios') return;
    if (isIosPaymentLoading) return;
    registerPaymentAttempt({
      onRetry: handleIosSubscribeRegular,
      onCancel: handleClose,
    });
    setIosPaymentPhase('opening');
    setIsIosPaymentLoading(true);
    try {
      await requestIosSubscription(IOS_PRODUCT_IDS.QUARTERLY_399);
    } catch (e) {
      setIsIosPaymentLoading(false);
      showPaymentFailed();
    }
  };

  const handleClose = async () => {
    if (isAuthenticated) {
      navigation.navigate('MainTabs', { screen: 'Home' });
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  };

  // Already subscribed: redirect back immediately unless we're about to show IAP success popup on this screen.
  useEffect(() => {
    if (skipSubscriptionRedirectForIap) return;
    if (isGoldUser) {
      if (isAuthenticated) {
        navigation.navigate('MainTabs', { screen: 'Home' });
      } else if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('MainTabs', { screen: 'Home' });
      }
    }
  }, [isGoldUser, navigation, skipSubscriptionRedirectForIap, isAuthenticated]);

  // --- Main Render with Background ---
  return (
    <ImageBackground
      source={require('../../assets/Subscription_BG.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      {/* iOS: Full-screen loader while Apple Pay / sandbox drawer is opening (prevents double-tap) */}
      {Platform.OS === 'ios' && isIosPaymentLoading && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.iosPaymentLoaderOverlay}>
            <LottieLoader size="large" />
            <Text style={styles.iosPaymentLoaderText}>
              {iosPaymentPhase === 'processing' ? 'Processing payment…' : 'Opening payment…'}
            </Text>
            <Text style={styles.iosPaymentLoaderSubtext}>Please wait</Text>
          </View>
        </Modal>
      )}

      {/* Unified State Handling - isGoldUser: redirect only (useEffect), no UI */}
      {isGoldUser ? null : isFreeUser && !hasUsedTrial ? (
        /* Redesigned PREMIUM TRIAL OFFER screen - Unified for all platforms */
        <View style={styles.trialContainer}>
          {/* Header Close Button (sticky) */}
          <View
            style={[
              styles.trialHeader,
              {
                paddingTop: Math.max(insets.top, 20),
              },
            ]}
          >
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => handleClose()}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>



          <ScrollView
            contentContainerStyle={[
              styles.trialScrollContent,
              { paddingTop: Math.max(insets.top + 40, 80) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.trialShuruKare}>{planDetails?.plan_page_text_1 || ''}</Text>

            <View style={styles.trialOfferTitleContainer}>
              <Svg height="45" width="220">
                <Defs>
                  <SvgGradient id="grad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="rgba(247, 253, 255, 1)" stopOpacity="1" />
                    <Stop offset="1" stopColor="rgba(187, 224, 238, 1)" stopOpacity="1" />
                  </SvgGradient>
                </Defs>
                <SvgText
                  fill="url(#grad)"
                  fontSize="32"
                  fontWeight="700"
                  fontFamily="Product Sans"
                  x="110"
                  y="32"
                  textAnchor="middle"
                >
                  {planDetails?.plan_page_text_2 || ''}
                </SvgText>
              </Svg>
            </View>

            <LinearGradient
              colors={['rgba(11, 42, 54, 1)', 'rgba(17, 66, 85, 1)', 'rgba(11, 42, 54, 1)']}
              locations={[0, 0.1788, 0.4786]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.trialLimitPill}
            >
              <Text style={styles.trialLimitText}>{planDetails?.plan_page_text_3 || ''}</Text>
            </LinearGradient>


            {/* Preview Container */}
            <View style={styles.trialPreviewContainer}>
              <Video
                source={{ uri: planDetails?.plan_page_text_8 }}
                style={styles.trialPreviewImage}
                resizeMode={ResizeMode.COVER}
                shouldPlay={true}
                isLooping={true}
                isMuted={isMuted}
                onLoadStart={() => setIsVideoLoading(true)}
                onLoad={() => setIsVideoLoading(false)}
                onError={(e) => {
                  console.error('Video Load Error:', e);
                  setIsVideoLoading(false);
                }}
              />
              {isVideoLoading && (
                <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }]}>
                  <LottieLoader size="large" />
                </View>
              )}
              <TouchableOpacity
                style={styles.trialMuteIndicator}
                onPress={() => setIsMuted(!isMuted)}
              >
                <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Ticker Row */}
            <View style={styles.trialTickerContainer}>
              <Text
                style={styles.trialTickerText}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                🎉 {planDetails?.plan_page_text_7?.[tickerIndex] || 'Sid from Chennai'} just started free trial! 🚀
              </Text>
            </View>

            {/* User Count / Rating */}
            <View style={styles.trialRatingRow}>
              <Text style={styles.trialRatingText}>{planDetails?.plan_page_text_4 || '1 Crore+ Users • Rated 4.9'}</Text>
              {/* <Ionicons name="star-outline" size={14} color="#FFD700" style={{ opacity: 0.8 }} /> */}
            </View>

            {/* Feature Icons Row with vertical dividers between items */}
            <View style={styles.trialFeatureIconsRow}>
              <View style={styles.trialFeatureIconItem}>
                <FourK />
                <Text style={styles.trialFeatureIconLabel}>250+ Latest content</Text>
              </View>

              <View style={styles.trialFeatureIconVerticalDivider} />

              <View style={styles.trialFeatureIconItem}>
                <Devices />
                <Text style={styles.trialFeatureIconLabel}>Every week new series</Text>
              </View>

              <View style={styles.trialFeatureIconVerticalDivider} />

              <View style={styles.trialFeatureIconItem}>
                <Block />
                <Text style={styles.trialFeatureIconLabel}>Ad-free Experience</Text>
              </View>
            </View>

            {/* Legal links required by App Store */}
            <View style={styles.legalLinksContainer}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() =>
                  navigation.navigate('LegalWebView', {
                    title: 'Terms & Conditions',
                    url: 'https://fasttv.app/terms',
                  })
                }
              >
                <Text style={styles.legalLinkText}>Terms & Conditions</Text>
              </TouchableOpacity>              
            </View>


            <View style={styles.iTuneDivider} />

            {/* iTunes policy by App Store */}
            <View style={styles.iTunePolicyContainer}>
              <TouchableOpacity
                activeOpacity={1}
              >
                <Text style={styles.iTuneTitleLabel}>iTunes Terms</Text>
                <Text style={styles.iTuneDescription}>Apple will charge your selected payment method (such as your
credit card, debit card, gift card/code, or other method available in
your Home Country) for any paid Transactions, including any
applicable taxes.</Text>
              </TouchableOpacity>              
            </View>
          </ScrollView>

          {/* Bottom Fixed Area */}
          <View style={[styles.trialBottomArea, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.trialBottomBorder}
            />
            <LinearGradient
              colors={['rgba(12, 33, 41, 1)', 'rgba(16, 9, 5, 1)']}
              locations={[0, 0.6038]}
              style={styles.bottomGradient}
            />

            <Text style={styles.trialAutoPayText}>
              {planDetails
                ? `${planDetails.plan_page_text_5} ₹399 ${planDetails.plan_page_text_6}`
                : 'After 3 days, auto pay ₹399 for 3 months'}
            </Text>

            <TouchableOpacity
              style={[styles.trialPayButton, Platform.OS === 'ios' && isIosPaymentLoading && styles.trialPayButtonDisabled]}
              onPress={handleIosStartTrial}
              disabled={Platform.OS === 'ios' && isIosPaymentLoading}
              activeOpacity={0.9}
            >
              <Text style={styles.trialPayButtonText}>
                {Platform.OS === 'ios' && isIosPaymentLoading ? 'Opening…' : 'Subscribe'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.trialCancelText}>Cancel Anytime</Text>
          </View>
        </View>
      ) : (
        /* Regular Subscription flow (e.g. has already used trial) - MATCHING NEW UI */
        <View style={styles.trialContainer}>
          {/* Header Close Button (sticky) */}
          <View
            style={[
              styles.trialHeader,
              {
                paddingTop: Math.max(insets.top, 50),
              },
            ]}
          >
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => handleClose()}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.regScrollContent} showsVerticalScrollIndicator={false}>
            {/* Logo Row */}
            <View style={[styles.regLogoContainer, {marginTop: 70}]}>
              <AppLogo width={100} height={30} />
            </View>

            <Text style={styles.regPlanLabel}>Single Plan</Text>
            <Text style={styles.regPlanTitle}>Quarterly Plan</Text>
            <Text style={styles.regPrice}>₹399</Text>
            <Text style={styles.regRenewText}>Subscription is automatically renewed every 90 days</Text>

            <View style={[styles.regDivider, {marginBottom: 40}]} />

            {/* Benefit rows */}
            <View style={styles.regBenefitContainer}>
              <View style={styles.regBenefitRow}>
                <View style={styles.regBenefitIcon}>
                  <Svg width="20" height="28" viewBox="0 0 15 15">
                    <Path d="M12.5 10L10.625 7.5L12.5 5H11.0547L9.57031 6.875V5H8.32031V10H9.57031V8.125L11.0547 10H12.5ZM7.5 8.75V7.5H6.67969V5H5.42969V7.5H4.17969V5H2.92969V8.75H5.42969V10H6.67969V8.75H7.5ZM13.3203 0C13.763 0 14.1536 0.169271 14.4922 0.507812C14.8307 0.846354 15 1.23698 15 1.67969V13.3203C15 13.763 14.8307 14.1536 14.4922 14.4922C14.1536 14.8307 13.763 15 13.3203 15H1.67969C1.23698 15 0.846354 14.8307 0.507812 14.4922C0.169271 14.1536 0 13.763 0 13.3203V1.67969C0 1.23698 0.169271 0.846354 0.507812 0.507812C0.846354 0.169271 1.23698 0 1.67969 0H13.3203Z" fill="white" />
                  </Svg>
                </View>
                <Text style={styles.regBenefitText}>250+ Latest content</Text>
              </View>

              <View style={styles.regBenefitRow}>
                <View style={styles.regBenefitIcon}>
                  <Svg width="20" height="28" viewBox="0 0 20 14">
                    <Path d="M18.3203 10.8594V5H15V10.8594H18.3203ZM19.1797 3.35938C19.4141 3.35938 19.6094 3.4375 19.7656 3.59375C19.9219 3.75 20 3.94531 20 4.17969V12.5C20 12.7344 19.9219 12.9427 19.7656 13.125C19.6094 13.2812 19.4141 13.3594 19.1797 13.3594H14.1797C13.9453 13.3594 13.737 13.2812 13.5547 13.125C13.3984 12.9427 13.3203 12.7344 13.3203 12.5V4.17969C13.3203 3.94531 13.3984 3.75 13.5547 3.59375C13.737 3.4375 13.9453 3.35938 14.1797 3.35938H19.1797ZM3.32031 1.67969V10.8594H11.6797V13.3594H0V10.8594H1.67969V1.67969C1.67969 1.23698 1.83594 0.846354 2.14844 0.507812C2.48698 0.169271 2.8776 0 3.32031 0H18.3203V1.67969H3.32031Z" fill="white" />
                  </Svg>
                </View>
                <Text style={styles.regBenefitText}>Every week new series</Text>
              </View>

              <View style={styles.regBenefitRow}>
                <View style={styles.regBenefitIcon}>
                  <Svg width="20" height="28" viewBox="0 0 17 17">
                    <Path d="M8.32031 15C10.1432 15 11.7057 14.349 13.0078 13.0469C14.3359 11.7188 15 10.1432 15 8.32031C15 7.69531 14.8568 6.97917 14.5703 6.17188C14.3099 5.36458 13.9844 4.71354 13.5938 4.21875L4.21875 13.5938C5.39062 14.5312 6.75781 15 8.32031 15ZM1.64062 8.32031C1.64062 8.94531 1.77083 9.66146 2.03125 10.4688C2.31771 11.276 2.65625 11.9271 3.04688 12.4219L12.4219 3.04688C11.25 2.10938 9.88281 1.64062 8.32031 1.64062C6.4974 1.64062 4.92188 2.30469 3.59375 3.63281C2.29167 4.9349 1.64062 6.4974 1.64062 8.32031ZM2.42188 2.46094C4.0625 0.820312 6.02865 0 8.32031 0C10.612 0 12.5651 0.820312 14.1797 2.46094C15.8203 4.07552 16.6406 6.02865 16.6406 8.32031C16.6406 10.612 15.8203 12.5781 14.1797 14.2188C12.5651 15.8333 10.612 16.6406 8.32031 16.6406C6.02865 16.6406 4.0625 15.8333 2.42188 14.2188C0.807292 12.5781 0 10.612 0 8.32031C0 6.02865 0.807292 4.07552 2.42188 2.46094Z" fill="white" />
                  </Svg>
                </View>
                <Text style={styles.regBenefitText}>Ad-free Experience</Text>
              </View>
            </View>

            {/* Social Proof */}
            <View style={styles.regRatingRow}>
              <Text style={styles.regRatingText}>1 Crore+ Users • Rated 4.9</Text>
              <StarIcon size={14} style={{ opacity: 0.8 }} />
            </View>

            {/* Legal links required by App Store */}
            <View style={styles.legalLinksContainer399}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() =>
                  navigation.navigate('LegalWebView', {
                    title: 'Terms & Conditions',
                    url: 'https://fasttv.app/terms',
                  })
                }
              >
                <Text style={styles.legalLinkText}>Terms & Conditions</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.regDivider, {marginBottom: 30}]} />

            {/* iTunes policy by App Store */}
            <View style={styles.iTunePolicyContainer}>
              <TouchableOpacity
                activeOpacity={1}
              >
                <Text style={styles.iTuneTitleLabel}>iTunes Terms</Text>
                <Text style={styles.iTuneDescription}>Apple will charge your selected payment method (such as your
credit card, debit card, gift card/code, or other method available in
your Home Country) for any paid Transactions, including any
applicable taxes.</Text>
              </TouchableOpacity>              
            </View>
          </ScrollView>

          {/* Bottom area */}
          <View style={[styles.trialBottomArea, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.trialBottomBorder}
            />
            <LinearGradient
              colors={['rgba(12, 33, 41, 1)', 'rgba(16, 9, 5, 1)']}
              locations={[0, 0.6038]}
              style={styles.bottomGradient}
            />
            <Text style={styles.regAutoPayText}>
              Auto pay ₹399 for 3 months
            </Text>

            <TouchableOpacity
              style={[styles.trialPayButton, Platform.OS === 'ios' && isIosPaymentLoading && styles.trialPayButtonDisabled]}
              onPress={handleIosSubscribeRegular}
              disabled={Platform.OS === 'ios' && isIosPaymentLoading}
              activeOpacity={0.9}
            >
              <Text style={styles.trialPayButtonText}>
                {Platform.OS === 'ios' && isIosPaymentLoading ? 'Opening…' : 'Pay ₹399'}
              </Text>
            </TouchableOpacity>

              <Text style={styles.trialCancelText}>Cancel Anytime</Text>
          </View>
        </View>
      )}

      {/* Stripe Card Form Modal */}
      <Modal
        visible={showCardForm}
        animationType="slide"
        transparent={true}
        onRequestClose={handlePaymentCancel}
      >
        <StripeCardForm
          amount={parseFloat(plans.find(p => p.id === selectedPlan)?.price?.replace(/[₹$,]/g, '') || '0')}
          currency="inr"
          planData={plans.find(p => p.id === selectedPlan)}
          userId={resolvedUserId}
          onSuccess={handlePaymentSuccess}
          onCancel={handlePaymentCancel}
        />
      </Modal>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  trialContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  trialHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialScrollContent: {
    alignItems: 'center',
    paddingBottom: 150, // space for bottom fixed area
  },
  trialShuruKare: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Product Sans',
  },
  trialOfferTitleContainer: {
    height: 45,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  trialOfferTitle: {
    color: '#FDA714',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'Product Sans',
  },
  trialLimitPill: {
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 48,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#4481984D',
  },
  trialLimitText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    fontFamily: 'Product Sans',
  },
  trialPriceContainer: {
    marginBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  trialPrice: {
    color: '#FFFFFF',
    fontFamily: 'PP Fraktion Sans',
    fontSize: 97,
    fontWeight: '700',
    lineHeight: 97,
    textAlign: 'center',
  },
  trialPreviewContainer: {
    width: width * 0.88,
    aspectRatio: 16/9,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 24,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  trialPreviewImage: {
    width: '100%',
    height: '100%',
  },
  trialMuteIndicator: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialTickerContainer: {
    backgroundColor: '#2C241F',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
    marginHorizontal: 24,
  },
  trialTickerText: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  trialRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 0.8,
    marginBottom: 20,
  },
  trialRatingText: {
    color: '#8A7A6A',
    fontSize: 13,
    marginRight: 6,
    fontFamily: 'Product Sans',
    fontWeight: '400',
  },
  trialIconsDivider: {
    width: width * 0.8,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 14,
  },
  trialFeatureIconsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: width * 0.8,
    marginBottom: 20,
  },
  trialFeatureIconItem: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  trialFeatureIconVerticalDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 12,
    marginTop: 4,
  },
  trialFeatureIconLabel: {
    color: '#FFFFFF',
    fontWeight: '400',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
    opacity: 0.9,
    fontFamily: 'Product Sans',
  },
  trialBottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    alignItems: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  trialBottomBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 1,
  },
  trialAutoPayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.9,
    fontFamily: 'Product Sans',
  },
  trialPayButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  trialPayButtonDisabled: {
    opacity: 0.7,
  },
  trialPayButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
  },
  iosPaymentLoaderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iosPaymentLoaderText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    fontFamily: 'Product Sans',
  },
  iosPaymentLoaderSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 8,
    fontFamily: 'Product Sans',
  },
  trialPayButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Product Sans',
  },
  trialCancelText: {
    color: '#999',
    fontSize: 11,
    opacity: 0.8,
    fontFamily: 'Product Sans',
    fontWeight: '400',
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  gradient: {
    flex: 1,
  },
  iosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  iosBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  iosCenteredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iosGoldTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  iosGoldSubtitle: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  iosPrimaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosPrimaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  iosCardWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iosSubscriptionCard: {
    width: '100%',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iosLogoRow: {
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iosFastTvBadge: {
    backgroundColor: '#FF4C4C',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iosFastTvText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  iosFastTvTextAccent: {
    color: '#FFD54F',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 4,
  },
  iosCardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  iosCardSubtitle: {
    color: '#CCCCCC',
    fontSize: 13,
    marginBottom: 20,
  },
  iosPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  iosCardPrice: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  iosCardPricePeriod: {
    color: '#CCCCCC',
    fontSize: 14,
    marginLeft: 6,
    marginBottom: 4,
  },
  iosBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iosBulletText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginLeft: 10,
  },
  iosSecureText: {
    marginTop: 16,
    fontSize: 11,
    color: '#888888',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  regScrollContent: {
    paddingTop: 100,
    paddingHorizontal: 24,
    paddingBottom: 160,
  },
  regLogoContainer: {
    marginBottom: 30,
    alignItems: 'flex-start',
  },
  regLogoImage: {
    width: 120,
    height: 41,
  },
  regPlanLabel: {
    color: '#999',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
    marginBottom: 8,
    fontFamily: 'Product Sans',
  },
  regPlanTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 25,
    marginBottom: 10,
    fontFamily: 'Product Sans',
  },
  regPrice: {
    color: '#FFFFFF',
    fontSize: 41,
    fontWeight: '700',
    lineHeight: 41,
    marginBottom: 16,
    fontFamily: 'Product Sans',
  },
  regRenewText: {
    color: '#A8A29E',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 30,
    fontFamily: 'Airbnb Cereal App',
  },
  regDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  regBenefitContainer: {
    width: '100%',
  },
  regBenefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  regBenefitIcon: {
    width: 20,
    height: 28,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regBenefitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    fontFamily: 'Product Sans',
  },
  legalLinksContainer399: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 30,
  },
  legalLinksContainer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 30,
  },
  iTunePolicyContainer: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 38,
  },
  iTuneTitleLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 14,
    opacity: 0.9,
    fontFamily: 'Product Sans',
  },
  iTuneDescription: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '400',
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Product Sans',
    textAlign: 'center',
  },
  iTuneDivider: {
    width: 200,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 12,
    marginBottom: 28,
  },
  legalLinkText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '400',
    fontSize: 11,
    fontFamily: 'Product Sans',
  },
  legalSeparator: {
    width: 8,
    height: 1,
    marginHorizontal: 8,
  },
  regRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 40,
    opacity: 1,
  },
  regRatingText: {
    color: '#8A7A6A',
    fontSize: 13,
    fontWeight: '400',
    marginRight: 6,
    fontFamily: 'Product Sans',
  },
  regAutoPayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.9,
    fontFamily: 'Product Sans',
  },
});

export default SubscriptionScreen; 