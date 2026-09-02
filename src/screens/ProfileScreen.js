import React, { useState, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AppStatusBar from '../components/AppStatusBar';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  BackHandler,
  Modal,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import LazyImage from '../components/LazyImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieLoader from '../components/LottieLoader';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Clipboard from 'expo-clipboard';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import { redirectGuestToLogin } from '../utils/guestUtils';
import { AppLogo, HelpSupport } from '../components/Icons';
import notificationService from '../services/notificationService';
const ProfileScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false); // edit profile sheet visibility
  const [editedName, setEditedName] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedGender, setEditedGender] = useState('');
  const [editedDob, setEditedDob] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutModalFadeAnim = useRef(new Animated.Value(0)).current;
  const logoutModalScaleAnim = useRef(new Animated.Value(0.9)).current;

  const [profileData, setProfileData] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [recentlyUpdatedName, setRecentlyUpdatedName] = useState(null);
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(true);
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);
  const { isSubscribed } = useSubscription();
  const { user, signOut, updateUserProfile, isGuestUser } = useAuth();



  // Use auth context user data or fallback to mock data
  const userData = user || {
    displayName: 'Guest User',
    email: 'guest@example.com',
    photoURL: null,
    userId: 'N/A',
    mobile: 'N/A'
  };

  const appVersion = Constants?.expoConfig?.version || Constants?.manifest?.version || '—';
  const buildVersion = Constants?.expoConfig?.build || Constants?.manifest?.build || '';
  const deviceName = Device.deviceName ?? null;
  const deviceOsName = Device.osName ?? null;
  const deviceOsVersion = Device.osVersion ?? null;


  const osVersion = deviceName && deviceOsVersion
    ? `${deviceName}, ${deviceOsVersion}`
    : deviceName || '—';
  const displayUserId = userData.userId || userData.uid || '';

  const handleCopyUserId = async () => {
    try {
      await Clipboard.setStringAsync(String(displayUserId));
      Alert.alert('Copied', 'User ID copied to clipboard');
    } catch (e) {
      console.warn('Failed to copy userId', e);
    }
  };

  // Initialize displayed name and edited name when component mounts or user data changes
  React.useEffect(() => {
    const rawName = userData.displayName || userData.name;
    const initialName = rawName
      ? rawName
      : (userData.provider === 'apple' ? 'Apple User' : 'Guest User');
    setDisplayName(initialName);
    setEditedName(initialName);
    setProfileImage(userData.photoURL);
  }, [userData.displayName, userData.name, userData.photoURL, userData.provider]);



  // Fetch profile data when component mounts (only once)
  React.useEffect(() => {
    // Do not fetch profile for guest users
    if (!isGuestUser && user && (user.userId || user.uid)) {
      fetchProfileData();
    }
  }, []); // Remove user dependency to prevent re-fetching

  // Refetch profile when screen gains focus (e.g. returning from Edit Profile) so UI shows latest data
  useFocusEffect(
    React.useCallback(() => {
      if (!isGuestUser && user && (user.userId || user.uid)) {
        fetchProfileData();
      }
    }, [isGuestUser, user?.userId, user?.uid])
  );

  // Check notification permission on mount and when screen gains focus (e.g. returning from Settings)
  const checkNotificationPermission = React.useCallback(async () => {
    try {
      const status = await notificationService.getPermissionStatus();
      setNotificationPermissionGranted(status.granted);
    } catch (error) {
      setNotificationPermissionGranted(true);
    }
  }, []);

  React.useEffect(() => {
    checkNotificationPermission();
  }, [checkNotificationPermission]);

  useFocusEffect(
    React.useCallback(() => {
      checkNotificationPermission();
    }, [checkNotificationPermission])
  );

  // Handle back button press - navigate back
  React.useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [navigation]);

  // Fetch profile data from API
  const fetchProfileData = async () => {
    // Guard: skip API call for guest users
    if (isGuestUser) {
      return;
    }
    try {
      // Get user ID from auth token
      const authToken = await AsyncStorage.getItem('authToken');
      let userId = null;

      if (authToken) {
        try {
          const decodedToken = API.decodeJwtToken(authToken);

          // Extract userId from the correct path in the token
          userId = decodedToken?.data?.userId || decodedToken?.userId || decodedToken?.id || user?.userId || user?.uid || 57;
        } catch (error) {
          console.error('Error decoding auth token:', error);
          userId = user?.userId || user?.uid || 57; // Fallback to user context or demo ID
        }
      } else {
        userId = user?.userId || user?.uid || 57; // Fallback to user context or demo ID
      }

      // Check if auth token is set in API service
      const currentAuthToken = await AsyncStorage.getItem('authToken');

      // Ensure auth token is set in API service before making the call
      if (currentAuthToken) {
        API.setAuthToken(currentAuthToken);
      }
      setIsLoadingProfile(true);
      const response = await API.getProfile(userId);

      // Decode the response if it's a JWT token
      let decodedResponse = response;
      if (typeof response === 'string') {
        try {
          decodedResponse = API.decodeJwtToken(response);
        } catch (error) {
          console.error('Failed to decode profile response:', error);
        }
      }

      if (decodedResponse && decodedResponse.success && decodedResponse.data) {
        const profile = decodedResponse.data;
        setProfileData(profile);

        // Update display name from API response only if it's different and not recently updated
        const apiName = profile.firstName || profile.middleName || profile.lastName || '';
        if (apiName.trim() && apiName.trim() !== displayName && apiName.trim() !== recentlyUpdatedName) {
          setDisplayName(apiName.trim());
          setEditedName(apiName.trim());
        }

        // Update profile image if available
        if (profile.avtar_img || profile.picture || profile.filePath) {
          setProfileImage(profile.avtar_img || profile.picture || profile.filePath);
        }
      } else {
        console.warn('No profile data found in API response');
      }
    } catch (error) {
      console.error('Error fetching profile data:', error);
      // Don't show error toast for profile fetch, just log it
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleEditName = () => {
    // Navigate to dedicated EditProfile screen with pre-filled values
    const profile = profileData || {};
    const initialName = displayName || userData.displayName || '';
    const initialEmail = profile.emailId;
    const initialPhone = profile.mobile || '';
    const initialGender = profile.sex || '';

    // Accept any date format that JS Date (and the DateTimePicker) can parse,
    // but always normalize to YYYY-MM-DD for passing into EditProfile.
    const normalizeDobFromAny = (value) => {
      if (!value || typeof value !== 'string') {
        return '';
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return '';
      }
      const date = new Date(trimmed);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const initialDob = normalizeDobFromAny(profile.dateOfBirth || '');

    navigation.navigate('EditProfile', {
      initialName,
      initialEmail,
      initialPhone,
      initialGender,
      initialDob,
      initialProfileImage: profileImage,
    });
  };

  const handleSaveName = async () => {
    if (editedName.trim()) {
      try {
        setIsLoading(true);

        // Get user ID from auth token
        const authToken = await AsyncStorage.getItem('authToken');
        let userId = null;

        if (authToken) {
          try {
            const decodedToken = API.decodeJwtToken(authToken);
            // Extract userId from the correct path in the token
            userId = decodedToken?.data?.userId || decodedToken?.userId || decodedToken?.id || user?.userId || user?.uid || 57;
          } catch (error) {
            console.error('Error decoding auth token:', error);
            userId = user?.userId || user?.uid || 57; // Fallback to user context or demo ID
          }
        } else {
          userId = user?.userId || user?.uid || 57; // Fallback to user context or demo ID
        }

        // Ensure auth token is set in API service before making the call
        if (authToken) {
          API.setAuthToken(authToken);
        }

        const userEmail = user?.email || userData.email || '';

        // Use profile data from API response if available, otherwise use defaults
        const currentProfile = profileData || {};

        // Prepare the request body exactly as shown in your curl command
        const requestBody = {
          id: userId.toString(), // Convert to string to match curl format
          firstName: editedName.trim(),
          emailId: editedEmail || currentProfile.emailId || userEmail,
          dateOfBirth: editedDob || currentProfile.dateOfBirth || '0000-00-00',
          sex: editedGender || currentProfile.sex || '',
          fileName: currentProfile.fileName || '',
          fileType: currentProfile.fileType || '',
          filePath: currentProfile.filePath || ''
        };

        // Call the profile update API
        const response = await API.updateProfile(requestBody);

        // Since the API call didn't throw an error, consider it successful
        // and update the UI immediately

        // Update the displayed name immediately when API call succeeds
        const newName = editedName.trim();

        setDisplayName(newName);
        setEditedName(newName); // Keep edited name in sync
        setRecentlyUpdatedName(newName); // Mark as recently updated

        // Clear the recently updated flag after 5 seconds
        setTimeout(() => {
          setRecentlyUpdatedName(null);
        }, 5000);

        // Update local profile data immediately
        if (profileData) {
          setProfileData({
            ...profileData,
            firstName: newName
          });
        }

        // Update AuthContext if needed
        if (user) {
          // Update the user context with new name
          const updateResult = await updateUserProfile({
            displayName: newName,
            name: newName
          });
          if (!updateResult.success) {
            console.warn('Failed to update auth context:', updateResult.error);
          }
        }

        // Force a small delay to ensure state updates are processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Close the modal
        setIsEditingName(false);

      } catch (error) {
        console.error('Error updating profile:', error);
        // Close modal on error as well
        setIsEditingName(false);
        require('../utils/errorReporting').reportErrorAlert('Error', `Failed to update profile: ${error.message || 'Please try again.'}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      Alert.alert('Error', 'Name cannot be empty');
    }
  };

  const handleCancelEdit = () => {
    if (isLoading) {
      // Don't allow canceling while saving
      return;
    }
    setEditedName(displayName); // Reset to current displayed name
    setIsEditingName(false);
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const handleCancelLogout = () => {
    setShowLogoutModal(false);
  };

  // Animate logout modal when visibility changes
  useEffect(() => {
    if (showLogoutModal) {
      logoutModalFadeAnim.setValue(0);
      logoutModalScaleAnim.setValue(0.9);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(logoutModalFadeAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.spring(logoutModalScaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      logoutModalFadeAnim.setValue(0);
      logoutModalScaleAnim.setValue(0.9);
    }
  }, [showLogoutModal]);

  const handleConfirmLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      const result = await signOut();

      if (result && result.success) {
        setShowLogoutModal(false);
        if (navigation && navigation.reset) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Auth' }],
          });
        } else {
          require('../utils/errorReporting').reportErrorAlert('Error', 'Navigation not available. Please restart the app.');
        }
      } else {
        const errorMsg = result?.error || 'Unknown error';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('Logout error:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', `Failed to logout: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handlePremiumSubscriptionClick = async () => {
    try {
      // Block guest users from accessing subscription plans
      if (isGuestUser) {
        Alert.alert(
          'Guest Account',
          'You are currently using a guest account. Please log to view subscription plans.'
        );
        return;
      }

      // Navigate to subscription webview
      navigation.navigate(Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView');
      return;
    } catch (error) {
      console.error('Error calling subscription API:', error);
      // Fallback - just navigate to subscription screen
      navigation.navigate(Platform.OS === 'ios' ? 'Subscription' : 'SubscriptionWebView');
    } finally {
      setIsLoadingSubscription(false);
      try {
         var userIdEvent = "", subscriptionTierEvent = "", subscriptionPlanName = "", isLoggedIn = "", languageEvent = "";
    if(isGuestUser){
      userIdEvent = "";
      subscriptionTierEvent = "free";
      subscriptionPlanName = "free_plan";
      isLoggedIn = false;
      languageEvent = "en";
    }
    if(!isGuestUser && user){
      userIdEvent = user?.userId || user?.uid || "";
      subscriptionTierEvent = isSubscribed ? "premium" : "free";
      subscriptionPlanName = isSubscribed ? (user.subscriptionPlanName || "premium_plan") : "free_plan";
      isLoggedIn = true;
      languageEvent = user.languagePreference || "en";
    }
        const analyticsService = require('../services/analytics').default;
        var properties = {
          content_id:  '',
          content_title:  '',
          content_type: 'Profile Screen',
          season_number: 1,
          total_episodes: 0,
          page_name: "Profile Screen",
          button_name: "Subscription",
          button_location: "Profile Screen Banner",
          action_type: "subscription_required",
          reason_for_prompt: "premium_content_access",
          conversion_step: "subscription_prompt",
           user_id: userIdEvent,
      subscription_tier: subscriptionTierEvent,
      subscription_plan_name: subscriptionPlanName,
      is_logged_in: isLoggedIn,
      language: languageEvent,
        }
        analyticsService.logSubscriptionButtonClicked("Subscription", properties);
      } catch (error) {
        // Error logged
        return;
      }
    }
  };

  const renderProfileHeader = () => (
    <View
      style={[
        styles.profileHeader,
        {
          paddingTop: Platform.OS === 'android' && insets.top + 20,
        },
      ]}
    >
      <LinearGradient
        colors={['#1A1A1A', '#2D2D2D']}
        style={styles.profileGradient}
      >
        {/* Edit Button at Top Corner */}
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEditName}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.avatarContainer}>
          <View style={styles.avatarTouchable}>
            {profileImage ? (
              <LazyImage source={{ uri: profileImage }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, isSubscribed && styles.premiumAvatarPlaceholder]}>
                <Ionicons name="person" size={40} color="#FFFFFF" />
              </View>
            )}
          </View>
        </View>
        <Text style={styles.userName}>
          {isLoadingProfile
            ? 'Loading...'
            : (() => {
                const nameToShow = displayName || (userData.provider === 'apple' ? 'Apple User' : 'Guest User');
                return nameToShow.length > 30
                  ? `${nameToShow.slice(0, 30)}...`
                  : nameToShow;
              })()}
        </Text>
        <Text style={[styles.userEmail]}>
          {/* Always show mobile if available, otherwise fall back to email */}
          {profileData?.mobile
            ? profileData.mobile
            : (user?.email || userData.email || 'Guest User')}
        </Text>

      </LinearGradient>
    </View>
  );

  const renderMenuItem = ({ icon, title, subtitle, onPress, showArrow = true, showBadge = false, badgeValue = '', isPremium = false, isLoading = false, isLast = false }) => {
    // Check if icon is a React component or a string (Ionicons name)
    const renderIcon = () => {
      if (isLoading) {
        return <LottieLoader size="small" />;
      }
      if (typeof icon === 'string') {
        // Ionicons icon (string name)
        return <Ionicons name={icon} size={24} color="#FFFFFF" />;
      }
      // Custom icon component (e.g., SVG)
      const IconComponent = icon;
      return <IconComponent />;
    };

    return (
      <TouchableOpacity
        style={[styles.menuItem, isPremium && styles.premiumMenuItem, isLast && styles.menuItemLast]}
        onPress={onPress}
        activeOpacity={0.7}
        disabled={isLoading}
      >
        <View style={styles.menuItemLeft}>
          <View style={[styles.menuIconContainer, isPremium && styles.premiumIconContainer]}>
            {renderIcon()}
          </View>
          <View style={styles.menuItemText}>
            <Text style={[styles.menuItemTitle, isPremium && styles.premiumMenuItemTitle]}>{title}</Text>
            {subtitle && <Text style={[styles.menuItemSubtitle, isPremium && styles.premiumMenuItemSubtitle]}>{subtitle}</Text>}
          </View>
        </View>
        <View style={styles.menuItemRight}>
          {showBadge && (
            <View style={[styles.badge, isPremium && styles.premiumBadge]}>
              <Text style={[styles.badgeText, isPremium && styles.premiumBadgeText]}>{badgeValue}</Text>
            </View>
          )}
          {showArrow && !isLoading && (
            <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSubscriptionCard = () => (
    <View style={styles.subscriptionCard}>
      <LinearGradient
        colors={['#2D2D2D', '#1A1A1A']}
        style={styles.subscriptionCardGradient}
      >
        <View style={styles.subscriptionCardHeader}>
          <Text style={styles.subscriptionCardTitle}>
            Upgrade to FastTV Premium
          </Text>
        </View>
        <Text style={styles.subscriptionCardSubtitle}>
          Unlock every episode and enjoy exclusive premium shows.
        </Text>
        <TouchableOpacity
          style={styles.subscriptionCardButton}
          onPress={handlePremiumSubscriptionClick}
          activeOpacity={0.8}
          disabled={isLoadingSubscription}
        >
          {isLoadingSubscription ? (
            <View style={styles.subscriptionCardButtonLoading}>
              <LottieLoader size="small" />
            </View>
          ) : (
            <Text style={styles.subscriptionCardButtonText}>
              View Plans
            </Text>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );

  const renderMenuSection = () => (
    <View style={styles.menuSection}>
      {/* Manage My Subscription - only for subscribed users */}
      {isSubscribed && renderMenuItem({
        icon: 'card',
        title: 'Manage My Subscription',
        subtitle: 'View subscription details and auto-pay',
        onPress: () => navigation.navigate('ManageSubscription'),
      })}

      {/* My List */}
      {!isGuestUser && renderMenuItem({
        icon: 'bookmark',
        title: 'My List',
        subtitle: 'Save all your favorites here',
        onPress: () => navigation.navigate('MainTabs', {
          screen: 'My List',
          params: { screen: 'MyListMain', params: { fromProfile: true } },
        }),
      })}

      {/* Watch History */}
      {!isGuestUser && renderMenuItem({
        icon: 'time',
        title: 'Watch History',
        subtitle: 'Your recently watched shows',
        onPress: () => navigation.navigate('WatchHistory'),
      })}

      {/* Settings */}
      {renderMenuItem({
        icon: 'settings',
        title: 'Settings',
        subtitle: 'App preferences and account',
        onPress: () => navigation.navigate('Settings'),
        isLast: false,
      })}

      {/* Help & Support */}
      {renderMenuItem({
        icon: HelpSupport,
        title: 'Help & Support',
        subtitle: 'Get support whenever you need',
        onPress: () => navigation.navigate('LegalWebView', {
          title: 'Help & Support',
          url: 'https://helpdesk.fasttv.app/portal/',
        }),
        isLast: false,
      })}

      {/* Logout - Show for both guest and regular users */}
      {!isGuestUser && renderMenuItem({
        icon: 'log-out',
        title: isGuestUser ? 'Exit Guest Mode' : 'Log out',
        subtitle: isGuestUser ? 'Log out of guest account' : 'Log out of your account',
        onPress: handleLogout,
        showArrow: false,
        isLast: true,
      })}
    </View>
  );

  const handleGuestLoginRedirect = async () => {
    await redirectGuestToLogin({
      navigation,
      signOut,
      setIsLoggingOut,
      redirectToProfileAfterLogin: true,
    });
  };

  const handleEnableNotifications = async () => {
    if (isEnablingNotifications) return;
    setIsEnablingNotifications(true);
    try {
      const result = await notificationService.requestPermissionWithPopup();
      if (result.success && result.granted) {
        setNotificationPermissionGranted(true);
        await notificationService.initialize();
        Alert.alert('Success', 'Notification permission granted! You will now receive push notifications.');
      }
    } catch (error) {
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to request notification permission.');
    } finally {
      setIsEnablingNotifications(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {isGuestUser ? (
        <>
          <AppStatusBar />
          {/* <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <View style={[styles.guestCenterContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, flex: 0 }]}> */}
          <View style={[styles.guestCenterContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, flex: 0 }]}>
            <View style={styles.guestCard}>
              <AppLogo width={100} height={30} />
              <Text style={styles.guestTitle}>Welcome to FastTV</Text>
              <Text style={styles.guestSubtitle}>
                Log in to continue watching, save your favourites, and unlock premium episodes.
              </Text>
              <TouchableOpacity
                style={styles.guestPrimaryButton}
                activeOpacity={0.85}
                onPress={handleGuestLoginRedirect}
                disabled={isLoggingOut}
              >
                <Text style={styles.guestPrimaryButtonText}>
                  {isLoggingOut ? 'Please wait…' : 'Login to your account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView 
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + (insets.bottom || 0) + 10 + 40 }]}
          >
            {renderMenuSection()}

            {/* App version footer for guest (User ID hidden for guests) */}
            <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 16 }}>
              <Text style={{ color: '#8E8E93', fontSize: 12, marginBottom: 4 }}>
                v{appVersion}{buildVersion ? ` (${buildVersion})` : ''}
              </Text>
              <Text style={{ color: '#8E8E93', fontSize: 12, marginBottom: 4 }}>
                {osVersion}
              </Text>
            </View>

            {/* Action Needed nudge for guest - show when push notifications are declined (native only) */}
            {!notificationPermissionGranted && Platform.OS !== 'web' && (
              <View style={styles.notificationNudge}>
                <LinearGradient
                  colors={['#FF8C42', '#E85A2A', '#D44A1E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.notificationNudgeGradient}
                >
                  <View style={styles.notificationNudgeLeft}>
                    <View style={styles.notificationNudgeIconContainer}>
                      <Image
                        source={require('../../assets/notification-nudge-icon.png')}
                        style={styles.notificationNudgeIconImage}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.notificationNudgeText}>
                      <Text style={styles.notificationNudgeTitle}>Action Needed</Text>
                      <Text style={styles.notificationNudgeSubtitle}>Enable notification to stay updated</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.notificationNudgeButton}
                    onPress={handleEnableNotifications}
                    activeOpacity={0.8}
                    disabled={isEnablingNotifications}
                  >
                    <Text style={styles.notificationNudgeButtonText}>
                      {isEnablingNotifications ? '...' : 'Enable'}
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            )}
          </ScrollView>
        </>
      ) : (
        <>
          <AppStatusBar />
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + (insets.bottom || 0) + 10 + 40 }]}
          >
            {renderProfileHeader()}
            {/* Show subscription upsell only for logged-in, non-subscribed users */}
            {!isSubscribed && renderSubscriptionCard()}
            {renderMenuSection()}

            {/* App version & User ID footer (User ID hidden for guests) */}
            <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 16 }}>
              <Text style={{ color: '#8E8E93', fontSize: 12, marginBottom: 4 }}>
                v{appVersion}{buildVersion ? ` (${buildVersion})` : ''}
              </Text>
              {!isGuestUser && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: '#8E8E93', fontSize: 12 }}>
                    User ID: {displayUserId}
                  </Text>
                  <TouchableOpacity
                    onPress={handleCopyUserId}
                    style={{ marginLeft: 6, padding: 4 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="copy-outline" size={14} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={{ color: '#8E8E93', fontSize: 12, marginBottom: 4 }}>
                {osVersion}
              </Text>
            </View>

            {/* Action Needed nudge - show when push notifications are declined (native only) */}
            {!notificationPermissionGranted && Platform.OS !== 'web' && (
              <View style={styles.notificationNudge}>
                <LinearGradient
                  colors={['#FF8C42', '#E85A2A', '#D44A1E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.notificationNudgeGradient}
                >
                  <View style={styles.notificationNudgeLeft}>
                    <View style={styles.notificationNudgeIconContainer}>
                      <Image
                        source={require('../../assets/notification-nudge-icon.png')}
                        style={styles.notificationNudgeIconImage}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.notificationNudgeText}>
                      <Text style={styles.notificationNudgeTitle}>Action Needed</Text>
                      <Text style={styles.notificationNudgeSubtitle}>Enable notification to stay updated</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.notificationNudgeButton}
                    onPress={handleEnableNotifications}
                    activeOpacity={0.8}
                    disabled={isEnablingNotifications}
                  >
                    <Text style={styles.notificationNudgeButtonText}>
                      {isEnablingNotifications ? '...' : 'Enable'}
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            )}
          </ScrollView>

          {/* Logout confirmation modal overlay */}
          <Modal
            visible={showLogoutModal}
            transparent
            animationType="fade"
            onRequestClose={handleCancelLogout}
            statusBarTranslucent
          >
            <View style={styles.logoutModalBackdrop}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={handleCancelLogout}
              />
              <Animated.View
                style={[
                  styles.logoutModalBox,
                  {
                    opacity: logoutModalFadeAnim,
                    transform: [{ scale: logoutModalScaleAnim }],
                  },
                ]}
              >
                <View style={styles.logoutModalContent}>
                  <View style={styles.logoutModalIconContainer}>
                    <Ionicons
                      name={isGuestUser ? "person-outline" : "log-out-outline"}
                      size={48}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.logoutModalTitle}>
                    {isGuestUser ? 'Exit Guest Mode' : 'Logout of FastTV?'}
                  </Text>
                  <Text style={styles.logoutModalMessage}>
                    {isGuestUser
                      ? 'Are you sure you want to exit guest mode? You will need to sign in again to access your account.'
                      : 'You will need to Login in again to continue your shows.'}
                  </Text>
                  <View style={styles.logoutModalButtons}>
                    <TouchableOpacity
                      style={[styles.logoutModalButton, styles.logoutModalButtonCancel]}
                      onPress={handleCancelLogout}
                      activeOpacity={0.7}
                      disabled={isLoggingOut}
                    >
                      <Text style={styles.logoutModalButtonCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.logoutModalButton, styles.logoutModalButtonConfirm]}
                      onPress={handleConfirmLogout}
                      activeOpacity={0.8}
                      disabled={isLoggingOut}
                    >
                      {isLoggingOut ? (
                        <View style={styles.logoutLoadingContainer}>
                          <Text style={styles.logoutModalButtonConfirmText}>Logging out...</Text>
                        </View>
                      ) : (
                        <Text style={styles.logoutModalButtonConfirmText}>
                          {isGuestUser ? 'Exit Guest Mode' : 'Logout'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileHeader: {
    marginBottom: 20,
    paddingTop: 20,
  },
  profileGradient: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 50,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatarTouchable: {
    position: 'relative',
    width: 100,
    height: 100,
    borderRadius: 50,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 4,
  },

  premiumAvatarPlaceholder: {
    borderColor: '#FFFFFF',
  },
  premiumUserEmail: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  premiumTagContainer: {
    marginTop: 12,
  },
  premiumTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  premiumTagText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  editButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
  },
  menuSection: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  badgeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  premiumMenuItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFFFFF',
  },
  premiumIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  premiumMenuItemTitle: {
    color: '#FFFFFF',
  },
  premiumMenuItemSubtitle: {
    color: '#AAAAAA',
  },
  premiumBadge: {
    backgroundColor: '#FFFFFF',
  },
  premiumBadgeText: {
    color: '#1a1a1a',
  },
  guestCenterContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 21,
  },
  guestCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    backgroundColor: '#1B1B1F',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  guestLogo: {
    width: 120,
    height: 40,
    marginBottom: 18,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  guestSubtitle: {
    fontSize: 14,
    color: '#D0D0D0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  guestPrimaryButton: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  guestPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subscriptionCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  subscriptionCardGradient: {
    padding: 24,
  },
  subscriptionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  subscriptionCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subscriptionCardSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
    marginBottom: 20,
  },
  subscriptionCardButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  subscriptionCardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subscriptionCardButtonLoading: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  nameInput: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2D2D2D',
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#FFFFFF',
  },
  saveButtonDisabled: {
    backgroundColor: '#666666',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  saveButtonTextDisabled: {
    color: '#999999',
  },
  // Logout confirmation modal overlay
  logoutModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  logoutModalBox: {
    width: Dimensions.get('window').width * 0.85,
    maxWidth: 400,
    marginHorizontal: 20,
  },
  logoutModalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  logoutModalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoutModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  logoutModalMessage: {
    fontSize: 15,
    color: '#AAAAAA',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  logoutModalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  logoutModalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  logoutModalButtonCancel: {
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  logoutModalButtonConfirm: {
    backgroundColor: '#FFFFFF',
  },
  logoutModalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  logoutModalButtonConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.3,
  },
  logoutLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  editHeaderBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  editScroll: {
    flex: 1,
  },
  editScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  editAvatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  editAvatarTouchable: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
  },
  editAvatar: {
    width: '100%',
    height: '100%',
  },
  editAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCameraOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editInput: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#333333',
  },
  editFooter: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
    backgroundColor: '#000000',
  },
  editSaveButton: {
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    alignItems: 'center',
  },
  editSaveButtonDisabled: {
    opacity: 0.7,
  },
  editSaveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  // Action Needed notification nudge
  notificationNudge: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  notificationNudgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  notificationNudgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  notificationNudgeIconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationNudgeIconImage: {
    width: 36,
    height: 36,
  },
  notificationNudgeText: {
    flex: 1,
  },
  notificationNudgeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  notificationNudgeSubtitle: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.95,
  },
  notificationNudgeButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  notificationNudgeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
});

export default ProfileScreen; 