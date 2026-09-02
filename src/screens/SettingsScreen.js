import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  Modal,
  Animated,
  BackHandler,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDataSaver } from '../context/DataSaverContext';
import { useDataCache } from '../context/DataCacheContext';
import { useAutoplay } from '../context/AutoplayContext';
import { useAuth } from '../context/AuthContext';
import notificationService from '../services/notificationService';
import API from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as iapService from '../services/iapService';
import LottieLoader from '../components/LottieLoader';
import { useAppUpdate } from '../context/AppUpdateContext';

const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;
  const deleteModalFadeAnim = React.useRef(new Animated.Value(0)).current;
  const deleteModalScaleAnim = React.useRef(new Animated.Value(0.9)).current;
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [footerLinks, setFooterLinks] = useState([]);
  const [footerLinksLoading, setFooterLinksLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const { isDataSaverEnabled, saveDataSaverSetting, getDataUsageEstimate } = useDataSaver();
  const { clearAllCache } = useDataCache();
  const { autoplayEnabled, updateAutoplaySetting } = useAutoplay();
  const { user, signOut, isGuestUser } = useAuth();
  const { isPendingSoftUpdate, storeUrl, latestVersion } = useAppUpdate();

  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);

  const getUserIdFromStorage = useCallback(async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      if (!storedUser) return null;
      const userData = JSON.parse(storedUser);
      return (
        userData?.userId ||
        userData?.id ||
        userData?.uid ||
        userData?.user_id ||
        null
      );
    } catch (e) {
      console.error('ManageSubscription: error reading user from storage', e);
      return null;
    }
  }, []);

  // Check notification permission on component mount
  useEffect(() => {
    checkNotificationPermission();
  }, []);

  const checkNotificationPermission = async () => {
    try {
      const status = await notificationService.getPermissionStatus();
      setNotificationPermission(status.granted);
      setNotifications(status.granted);
    } catch (error) {
      console.error('Error checking notification permission:', error);
      setNotificationPermission(false);
      setNotifications(false);
    }
  };

  const handleNotificationToggle = async (value) => {
    console.log('🔔 Notification toggle clicked:', value);
    
    if (value) {
      // User wants to enable notifications - trigger native Android permission popup
      console.log('🔔 Requesting notification permission...');
      try {
        const result = await notificationService.requestPermissionWithPopup();
        console.log('🔔 Permission request result:', result);
        
        if (result.success && result.granted) {
          setNotificationPermission(true);
          setNotifications(true);
          
          // Re-initialize notification service to setup listeners and get fresh token
          console.log('🔔 Re-initializing notification service...');
          const initResult = await notificationService.initialize();
          console.log('🔔 Re-initialization result:', initResult);
          
          Alert.alert('Success', 'Notification permission granted! You will now receive push notifications.');
        } else {
          // Permission denied, keep toggle off
          setNotifications(false);
          console.log('🔔 Permission denied, keeping toggle OFF');
          // The alert is already shown by the notification service
        }
      } catch (error) {
        console.error('🔔 Error requesting permission:', error);
        setNotifications(false);
        require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to request notification permission.');
      }
    } else {
      // User wants to disable notifications
      console.log('🔔 Disabling notifications');
      setNotifications(false);
      Alert.alert(
        'Notifications Disabled',
        'You can re-enable notifications anytime from this settings page.',
        [{ text: 'OK' }]
      );
    }
  };



  // Fetch footer links on component mount
  useEffect(() => {
    const fetchFooterLinks = async () => {
      setFooterLinksLoading(true);
      try {
        // Get the current auth token from the API service
        const token = user?.token || user?.accessToken;
        
        if (token) {
          // Decode the JWT token
          const decodedToken = API.decodeJwtToken(token);
          
          // Set the auth token for API calls
          API.setAuthToken(token);
          
          // Fetch footer links
          const response = await API.getFooterLink();
          
          // Handle JWT response if needed
          let footerData = response;
          if (typeof response === 'string') {
            const decodedResponse = API.decodeJwtToken(response);
            footerData = decodedResponse;
          }
          
          // Extract the data array from the response structure
          const linksData = footerData?.data?.data || footerData?.data || footerData || [];
          setFooterLinks(linksData);
        } else {
          // No auth token available
        }
      } catch (error) {
        console.error('Error fetching footer links in Settings:', error);
      } finally {
        setFooterLinksLoading(false);
      }
    };

    fetchFooterLinks();
  }, [user]);

  // Animate modal when visibility changes
  useEffect(() => {
    if (showLogoutModal) {
      // Set initial values and immediately start animation
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      
      // Use requestAnimationFrame to ensure modal is rendered
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      // Reset values when closing
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
    }
  }, [showLogoutModal]);

  // Animate delete account modal when visibility changes
  useEffect(() => {
    if (showDeleteAccountModal) {
      deleteModalFadeAnim.setValue(0);
      deleteModalScaleAnim.setValue(0.9);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(deleteModalFadeAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.spring(deleteModalScaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      deleteModalFadeAnim.setValue(0);
      deleteModalScaleAnim.setValue(0.9);
    }
  }, [showDeleteAccountModal]);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const handleCancelLogout = () => {
    setShowLogoutModal(false);
  };

  const handleConfirmLogout = async () => {
    if (isLoggingOut) return;
    
    setIsLoggingOut(true);
    try {
      // Call signOut which will handle API logout and clearing all data
      const result = await signOut();
      
      if (result && result.success) {
        setShowLogoutModal(false);
        // Navigate back to Auth screen
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

  const handleDeleteAccountPress = () => {
    setShowDeleteAccountModal(true);
  };

  const handleCancelDeleteAccount = () => {
    if (!isDeletingAccount) setShowDeleteAccountModal(false);
  };

  const handleConfirmDeleteAccount = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      const authToken = user?.token || user?.accessToken || (await AsyncStorage.getItem('authToken'));
      if (!authToken) {
        require('../utils/errorReporting').reportErrorAlert('Error', 'You must be signed in to delete your account.');
        return;
      }
      API.setAuthToken(authToken);
      await API.deleteUser();
      setShowDeleteAccountModal(false);
      await signOut();
      if (navigation?.reset) {
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
      } else {
        Alert.alert('Account Deleted', 'Your account has been deleted. Please restart the app.');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', `Failed to delete account: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleClearCache = () => {
    // Handle web platform differently
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to clear cache?');
      if (confirmed) {
        clearAllCache();
        alert('Cache cleared successfully!');
      }
      return;
    }
    
    // Test if Alert is working
    try {
      Alert.alert(
        'Clear Cache',
        'Are you sure you want to clear cache?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: async () => {
            try {
              // Clear all cached data using DataCacheContext
              clearAllCache();
              
              // Clear AsyncStorage cache keys
              const cacheKeys = await AsyncStorage.getAllKeys();
              const cacheKeysToRemove = cacheKeys.filter(key => 
                key.includes('cache') || 
                key.includes('assetListing') || 
                key.includes('video') ||
                key.includes('thumbnail') ||
                key.includes('menuCategory') ||
                key.includes('navigation') ||
                key.includes('series') ||
                key.includes('episode')
              );
              
              if (cacheKeysToRemove.length > 0) {
                await AsyncStorage.multiRemove(cacheKeysToRemove);
              }
              

              
              // Show success message with details
              const clearedCount = cacheKeysToRemove.length;
              Alert.alert(
                'Success', 
                `Cache cleared successfully!\n\nCleared ${clearedCount} cached items including:\n• Video data\n• Series information\n• Navigation data\n• Thumbnails`
              );
            } catch (error) {
              console.error('Error clearing cache:', error);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          },
        },
      ]
    );
    } catch (error) {
      console.error('Error showing Alert:', error);
      // Fallback: directly clear cache without confirmation
      console.log('Alert failed, clearing cache directly...');
      clearAllCache();
      Alert.alert('Success', 'Cache cleared successfully!');
    }
  };

  const handleRestoreSubscription = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    setIsRestoring(true);
    try {
      const userId = await getUserIdFromStorage();
      if (!userId) {
        setIsRestoring(false);
        require('../utils/errorReporting').reportErrorAlert('Error', 'Please sign in to restore your subscription.');
        return;
      }
      const productIds = Object.values(iapService.IOS_PRODUCT_IDS);
      const purchases = await iapService.restorePurchases(productIds, {
        // validateAndGrant: async (purchase) => {
        //   await API.notifyBilling({
        //     platform_id: '4',
        //     payment_id: '10',
        //     identity: userId,
        //     plan_id: iapService.getIosPlanIdFromProductId(purchase?.productId),
        //     store_payment_id: purchase?.productId ?? '',
        //     product_id: purchase?.productId ?? '',
        //     transactionDate: purchase?.transactionDate ?? '',
        //     transactionId: purchase?.transactionId ?? '',
        //     purchase_token: purchase?.transactionId ?? purchase?.transactionReceipt ?? '',
        //     hardware_id: '',
        //     aff_code: '',
        //     country: '',
        //     debug: '',
        //   });
        // },
      });
      // await loadSubscriptionStatus();
      setIsRestoring(false);
      if (purchases && purchases.length > 0) {
        Alert.alert(
          'Restore Successful',
          'Your subscription has been restored. Your subscription details have been updated.'
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'No previous purchases were found for this Apple ID. If you have an active subscription, make sure you are signed in with the same Apple ID used to purchase.'
        );
      }
    } catch (e) {
      const message = e?.message || String(e);
      require('../utils/errorReporting').reportErrorAlert(
        'Restore Failed',
        message || 'Unable to restore purchases. Please try again.'
      );
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const renderSettingItem = ({ icon, title, subtitle, onPress, showArrow = true, showSwitch = false, switchValue = false, onSwitchChange = null }) => {
    // Only disable if showSwitch is true (for switch items)
    // For regular buttons, always allow onPress
    const isDisabled = showSwitch;
    
    return (
      <TouchableOpacity
        style={styles.settingItem}
        onPress={onPress}
        activeOpacity={0.7}
        disabled={isDisabled}
        pointerEvents={isDisabled ? 'none' : 'auto'}
      >
      <View style={styles.settingItemLeft}>
                  <View style={styles.settingIconContainer}>
            <Ionicons name={icon} size={24} color="#FFFFFF" />
          </View>
        <View style={styles.settingItemText}>
          <Text style={styles.settingItemTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingItemSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingItemRight}>
        {showSwitch && (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: '#E0E0E0', true: '#ff6b6b' }}
            thumbColor="#FFFFFF"
          />
        )}
        {showArrow && (
          <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
        )}
      </View>
    </TouchableOpacity>
    );
  };

  const renderSection = (title, items) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {items.map((item, index) => (
          <View key={index}>
            {renderSettingItem(item)}
            {index < items.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>
    </View>
  );

  const renderFooterLinks = () => {
    if (footerLinksLoading) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal & Support</Text>
          <View style={styles.sectionContent}>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={styles.settingIconContainer}>
                  <Ionicons name="hourglass" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.settingItemText}>
                  <Text style={styles.settingItemTitle}>Loading...</Text>
                  <Text style={styles.settingItemSubtitle}>Fetching footer links</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      );
    }

    // If no footer links loaded, show a fallback section
    if (!footerLinks || footerLinks.length === 0) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal & Support</Text>
          <View style={styles.sectionContent}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                navigation.navigate('LegalWebView', { 
                  title: 'Terms & Conditions',
                  url: 'https://fasttv.app/terms',
                });
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingItemLeft}>
                <View style={styles.settingIconContainer}>
                  <Ionicons name="document-text" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.settingItemText}>
                  <Text style={styles.settingItemTitle}>Terms & Conditions</Text>
                </View>
              </View>
              <View style={styles.settingItemRight}>
                <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
              </View>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                navigation.navigate('LegalWebView', { 
                  title: 'Privacy Policy',
                  url: 'https://fasttv.app/privacy',
                });
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingItemLeft}>
                <View style={styles.settingIconContainer}>
                  <Ionicons name="shield-checkmark" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.settingItemText}>
                  <Text style={styles.settingItemTitle}>Privacy Policy</Text>
                </View>
              </View>
              <View style={styles.settingItemRight}>
                <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
              </View>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => {
                navigation.navigate('FooterLinkDetail', { 
                  link: { title: 'About Us', path: 9 } 
                });
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingItemLeft}>
                <View style={styles.settingIconContainer}>
                  <Ionicons name="information-circle" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.settingItemText}>
                  <Text style={styles.settingItemTitle}>About Us</Text>
                </View>
              </View>
              <View style={styles.settingItemRight}>
                <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const footerItems = footerLinks.map((link, index) => ({
      icon: 'document-text',
      title: link.title || link.label || 'Footer Link',
      onPress: () => {
  
        if (link.path) {
          // Navigate to the FooterLinkDetailScreen with the link data
          navigation.navigate('FooterLinkDetail', { link });
        }
      },
    }));

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal & Support</Text>
        <View style={styles.sectionContent}>
          {footerItems.map((item, index) => (
            <View key={index}>
              {renderSettingItem(item)}
              {index < footerItems.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </View>
    );
  };



  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "android" ? insets.top + 20 : 20 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Global restore loader overlay */}
      {isRestoring && (
        <View style={styles.restoreOverlay} pointerEvents="auto">
          <View style={styles.restoreOverlayContent}>
            <LottieLoader size="large" />
            <Text style={styles.restoreOverlayText}>Restoring subscription…</Text>
          </View>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* New version available - when user had tapped Later on soft update (Blinkit-style) */}
        {isPendingSoftUpdate && storeUrl && (
          <View style={styles.updateBanner}>
            <View style={styles.updateBannerContent}>
              <Ionicons name="arrow-down-circle" size={22} color="#FFFFFF" style={styles.updateBannerIcon} />
              <View style={styles.updateBannerTextWrap}>
                <Text style={styles.updateBannerTitle}>New version available</Text>
                <Text style={styles.updateBannerSubtitle}>
                  Update to v{latestVersion} for the best experience.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.updateBannerButton}
                onPress={() => Linking.openURL(storeUrl)}
                activeOpacity={0.8}
              >
                <Text style={styles.updateBannerButtonText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* App Settings */}
        {renderSection('App Settings', [
          {
            icon: 'notifications',
            title: 'Push Notifications',
            subtitle: 'Get notified about new episodes',
            showSwitch: true,
            switchValue: notifications,
            onSwitchChange: handleNotificationToggle,
            showArrow: false,
          },
          {
            icon: 'play-circle',
            title: 'Auto-play Videos',
            subtitle: 'Automatically advance to next episode',
            showSwitch: true,
            switchValue: autoplayEnabled,
            onSwitchChange: updateAutoplaySetting,
            showArrow: false,
          },
          {
            icon: 'cellular',
            title: 'Data Saver',
            subtitle: `Reduce data usage - ${getDataUsageEstimate()}`,
            showSwitch: true,
            switchValue: isDataSaverEnabled,
            onSwitchChange: saveDataSaverSetting,
            showArrow: false,
          },
        ])}

        {/* Storage */}
        {/* {renderSection('Storage', [
          {
            icon: 'trash',
            title: 'Clear Cache',
            subtitle: 'Free up storage space',
            onPress: handleClearCache,
          },
        ])} */}

        {/* Footer Links - Legal & Support */}
        {renderFooterLinks()}

        {/* Account - Delete Account (only for non-guest users) */}
        {!isGuestUser && renderSection('Account', [
          {
            icon: 'trash',
            title: 'Delete Account',
            subtitle: 'This will delete your account permanently',
            onPress: handleDeleteAccountPress,
            showArrow: true,
          },
        ])}

        {Platform.OS === 'ios' && renderSection('Subscription', [
          {
            icon: 'card',
            title: 'Restore Subscription',
            subtitle: 'Subscribed? Restore your subscription',
            onPress: () => handleRestoreSubscription(),
            showArrow: false,
          },
        ])}

        {/* Account - Logout Button */}
        {/* <View style={styles.logoutSection}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <View style={styles.logoutButtonContent}>
              <View style={styles.logoutIconContainer}>
                <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.logoutTextContainer}>
                <Text style={styles.logoutButtonTitle}>
                  {isGuestUser ? 'Exit Guest Mode' : 'Logout'}
                </Text>
                <Text style={styles.logoutButtonSubtitle}>
                  {isGuestUser ? 'Sign in to access your account' : 'Sign out and clear all data'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View> */}
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelLogout}
        statusBarTranslucent={true}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleCancelLogout}
          />
          <Animated.View
            style={[
              styles.modalContainer,
              {
                opacity: showLogoutModal ? fadeAnim : 0,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={styles.modalContent}>
                {/* Icon */}
                <View style={styles.modalIconContainer}>
                  <Ionicons 
                    name={isGuestUser ? "person-outline" : "log-out-outline"} 
                    size={48} 
                    color="#FFFFFF" 
                  />
                </View>

                {/* Title */}
                <Text style={styles.modalTitle}>
                  {isGuestUser ? 'Exit Guest Mode' : 'Logout'}
                </Text>

                {/* Message */}
                <Text style={styles.modalMessage}>
                  {isGuestUser 
                    ? 'Are you sure you want to exit guest mode? You will need to sign in again to access your account.' 
                    : 'Are you sure you want to logout? This will clear all your local data.'}
                </Text>

                {/* Buttons */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={handleCancelLogout}
                    activeOpacity={0.7}
                    disabled={isLoggingOut}
                  >
                    <Text style={styles.modalButtonCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonConfirm]}
                    onPress={handleConfirmLogout}
                    activeOpacity={0.8}
                    disabled={isLoggingOut}
                  >
                    {isLoggingOut ? (
                      <View style={styles.loadingContainer}>
                        <Text style={styles.modalButtonConfirmText}>Logging out...</Text>
                      </View>
                    ) : (
                      <Text style={styles.modalButtonConfirmText}>
                        {isGuestUser ? 'Exit Guest Mode' : 'Logout'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </View>
        </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteAccountModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelDeleteAccount}
        statusBarTranslucent={true}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleCancelDeleteAccount}
          />
          <Animated.View
            style={[
              styles.deleteModalContainer,
              {
                opacity: showDeleteAccountModal ? deleteModalFadeAnim : 0,
                transform: [{ scale: deleteModalScaleAnim }],
              },
            ]}
          >
            <View style={styles.deleteModalContent}>
              <View style={styles.deleteModalIconContainer}>
                <Ionicons name="warning-outline" size={56} color="#E53935" />
              </View>
              <Text style={styles.deleteModalTitle}>Delete Account</Text>
              <Text style={styles.deleteModalMessage}>
                Are you sure you want to delete your FastTV account? This action can not be undone.
              </Text>
              <View style={styles.deleteModalConsequences}>
                <Text style={styles.deleteModalItemText}>All your saved videos will be deleted.</Text>
                <View style={styles.deleteModalDivider} />
                <Text style={styles.deleteModalItemText}>
                  Account history including "My List" and watch history will be deleted forever, can not be accessed in future.
                </Text>
                <View style={styles.deleteModalDivider} />
                <Text style={styles.deleteModalItemText}>
                  Any purchase associated with this account will no longer be available for use.
                </Text>
                <View style={styles.deleteModalDivider} />
              </View>
              <View style={styles.deleteModalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.deleteModalButtonConfirm]}
                  onPress={handleConfirmDeleteAccount}
                  activeOpacity={0.8}
                  disabled={isDeletingAccount}
                >
                  {isDeletingAccount ? (
                    <Text style={styles.deleteModalButtonConfirmText}>Deleting...</Text>
                  ) : (
                    <Text style={styles.deleteModalButtonConfirmText}>Delete Account</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={handleCancelDeleteAccount}
                  activeOpacity={0.7}
                  disabled={isDeletingAccount}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  restoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 20,
  },
  restoreOverlayContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    alignItems: 'center',
  },
  restoreOverlayText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  updateBanner: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  updateBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  updateBannerIcon: {
    marginRight: 12,
  },
  updateBannerTextWrap: {
    flex: 1,
  },
  updateBannerTitle: {
    fontFamily: 'Product Sans Bold',
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  updateBannerSubtitle: {
    fontFamily: 'Product Sans',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  updateBannerButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  updateBannerButtonText: {
    fontFamily: 'Product Sans Bold',
    fontSize: 14,
    color: '#000000',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#AAAAAA',
    marginLeft: 20,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingItemText: {
    flex: 1,
  },
  settingItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  settingItemSubtitle: {
    fontSize: 14,
    color: '#AAAAAA',
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#333333',
    marginLeft: 76, // Align with text content
  },
  logoutSection: {
    marginTop: 10,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  logoutButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#3A3A3C',
    overflow: 'hidden',
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  logoutIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  logoutTextContainer: {
    flex: 1,
  },
  logoutButtonTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  logoutButtonSubtitle: {
    fontSize: 13,
    color: '#AAAAAA',
    lineHeight: 18,
  },
  // Logout Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    position: 'relative',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    zIndex: 1000,
    alignSelf: 'center',
  },
  modalContent: {
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
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  modalMessage: {
    fontSize: 15,
    color: '#AAAAAA',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  modalButtonCancel: {
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  modalButtonConfirm: {
    backgroundColor: '#FFFFFF',
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modalButtonConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Delete Account Modal
  deleteModalContainer: {
    width: '100%',
    maxWidth: 400,
    minHeight: 535,
    maxHeight: '85%',
    zIndex: 1000,
    alignSelf: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    overflow: 'hidden',
  },
  deleteModalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  deleteModalIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  deleteModalMessage: {
    fontSize: 15,
    fontWeight: '400',
    color: '#FFFFFF',
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  deleteModalConsequences: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  deleteModalItemText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  deleteModalDivider: {
    height: 1,
    backgroundColor: '#444444',
    alignSelf: 'stretch',
  },
  deleteModalButtons: {
    width: '100%',
    flexDirection: 'column',
    gap: 12,
  },
  deleteModalButtonConfirm: {
    backgroundColor: '#FFFFFF',
  },
  deleteModalButtonConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: 0.3,
  },
});

export default SettingsScreen; 