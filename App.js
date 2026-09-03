import React, { useState, createContext, useContext, useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, Alert, Image, Platform, AppState, StyleSheet, Linking, Dimensions, BackHandler } from 'react-native';
import { useFonts } from 'expo-font';
// import { usePreventScreenCapture } from 'expo-screen-capture';
import AsyncStorage from '@react-native-async-storage/async-storage';
// expo-av loaded lazily in useConfigureAudioMode to avoid post-splash crash on some devices (e.g. Samsung A13)
// i18n not used in app; removed to avoid loading expo-localization at bundle load (NativeModule crash).
// import "./src/i18n";
import {
  HomeIcon,
  ForYouIconFocused,
  ForYouIconUnfocused,
  MyListIcon,
  SearchIcon,
  ProfileIcon,
} from './src/components/TabIcons';

// Conditionally load Stripe after mount to avoid touching native bridge at bundle load (see firebase fix).
let StripeProvider = require('./src/utils/stripeWebStub').StripeProvider;

// Defer native module imports until after app mount to avoid "NativeModule of undefined" crash (Hermes).
// Firebase config does not load native modules at top level; Stripe is loaded in useEffect.
import { registerFirebaseBackgroundHandler, initializeFirebase } from './src/config/firebase';

import { MyListProvider } from './src/context/MyListContext';
import { WatchHistoryProvider } from './src/context/WatchHistoryContext';
import { FavouritesProvider } from './src/context/FavouritesContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { PaymentFeedbackProvider } from './src/context/PaymentFeedbackContext';
import { AuthProvider } from './src/context/AuthContext';
import { NavigationProvider } from './src/context/NavigationContext';
import { TabBarProvider, useTabBar } from './src/context/TabBarContext';
import { DataCacheProvider } from './src/context/DataCacheContext';
import { DataSaverProvider } from './src/context/DataSaverContext';
import { AutoplayProvider } from './src/context/AutoplayContext';
import { StripeProvider as CustomStripeProvider } from './src/context/StripeContext';
import { InteractiveShowProvider } from './src/context/InteractiveShowContext';
import AuthGate from './src/components/AuthGate';
import NavigationGate from './src/components/NavigationGate';
import ErrorBoundary from './src/components/ErrorBoundary';
import DeepLinkHandler from './src/components/DeepLinkHandler';
import IapListenerSetup from './src/components/IapListenerSetup';
import { STRIPE_CONFIG } from './src/config/stripe';
import { AppUpdateProvider, useAppUpdate } from './src/context/AppUpdateContext';
import ForceUpdateScreen from './src/screens/ForceUpdateScreen';
import SoftUpdateDrawer from './src/components/SoftUpdateDrawer';
// StarME (Phase 1: fonts + dev-only theme gallery checkpoint)
import { StarFonts } from './src/starme/theme';
import StarMeGallery from './src/starme/screens/_Gallery';
// StarME (Phase 2: dev-only data + API harness checkpoint)
import StarMeDataHarness from './src/starme/screens/_DataHarness';
// StarME (Phase 3: navigation shell + store + event host)
import StarNavigator from './src/starme/nav/StarNavigator';

function AppUpdateGate({ children }) {
  const { updateType, storeUrl, dismissSoftUpdate, configLoaded } = useAppUpdate();
  const openStore = (url) => {
    if (url) Linking.openURL(url);
  };
  if (Platform.OS !== 'web' && !configLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }
  if (updateType === 'force') {
    return <ForceUpdateScreen onUpdate={openStore} storeUrl={storeUrl} />;
  }
  return (
    <>
      {children}
      {updateType === 'soft' && (
        <SoftUpdateDrawer
          visible
          onUpdate={openStore}
          onLater={dismissSoftUpdate}
          storeUrl={storeUrl}
        />
      )}
    </>
  );
}

import API from './src/services/api';
import { forHorizontalIOS } from '@react-navigation/stack';
// expo-splash-screen loaded in useEffect to avoid NativeModule access at bundle load

// Import Screens
import AuthScreen from './src/screens/AuthScreen';
import PhoneLoginScreen from './src/screens/PhoneLoginScreen';
import EmailLoginScreen from './src/screens/EmailLoginScreen';
import OTPVerificationScreen from './src/screens/OTPVerificationScreen';
import HomeScreen from './src/screens/HomeScreen';
import ForYouScreen from './src/screens/ForYouScreen';
import MyListScreen from './src/screens/MyListScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import WatchHistoryScreen from './src/screens/WatchHistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import VideoPlayerScreen from './src/screens/VideoPlayerScreen';
import ReelsScreen from './src/screens/ReelsScreen';
import InteractiveReelsScreen from './src/screens/InteractiveReelsScreen';
import PlayerSettingsScreen from './src/screens/PlayerSettingsScreen';
import EpisodesScreen from './src/screens/EpisodesScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import ManageSubscriptionScreen from './src/screens/ManageSubscriptionScreen';
import SubscriptionWebViewScreen from './src/screens/SubscriptionWebViewScreen';
import SearchScreen from './src/screens/SearchScreen';
import SeriesDetailScreen from './src/screens/SeriesDetailScreen';
import FooterLinkDetailScreen from './src/screens/FooterLinkDetailScreen';
import LegalWebViewScreen from './src/screens/LegalWebViewScreen';
import TileDetailsScreen from './src/screens/TileDetailsScreen';
import notificationService from './src/services/notificationService';
import analyticsService from './src/services/analytics';
import crashlyticsService from './src/services/crashlytics';
import deepLinkingService from './src/services/deepLinkingService';
import moengageNotificationHandler from './src/services/moengageNotificationHandler';
import RichLandingScreen from './src/screens/RichLandingScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const TabStack = createStackNavigator();

// Home tab: stack with HomeScreen + TileDetails (tab bar stays visible on TileDetails)
function HomeStackScreen() {
  return (
    <TabStack.Navigator screenOptions={{ headerShown: false }}>
      <TabStack.Screen name="HomeMain" component={HomeScreen} />
      <TabStack.Screen name="TileDetails" component={TileDetailsScreen} />
    </TabStack.Navigator>
  );
}

// Feeds tab: stack with ForYouScreen + TileDetails (tab bar stays visible on TileDetails)
function FeedsStackScreen() {
  return (
    <TabStack.Navigator screenOptions={{ headerShown: false }}>
      <TabStack.Screen name="ForYouMain" component={ForYouScreen} />
      <TabStack.Screen name="TileDetails" component={TileDetailsScreen} />
    </TabStack.Navigator>
  );
}

// My List tab: stack with MyListScreen + TileDetails (tile click opens TileDetails)
function MyListStackScreen() {
  return (
    <TabStack.Navigator screenOptions={{ headerShown: false }}>
      <TabStack.Screen name="MyListMain" component={MyListScreen} />
      <TabStack.Screen name="TileDetails" component={TileDetailsScreen} />
    </TabStack.Navigator>
  );
}

// Search tab: stack with SearchScreen + TileDetails (tile click opens TileDetails)
function SearchStackScreen() {
  return (
    <TabStack.Navigator screenOptions={{ headerShown: false }}>
      <TabStack.Screen name="SearchMain" component={SearchScreen} />
      <TabStack.Screen name="TileDetails" component={TileDetailsScreen} />
    </TabStack.Navigator>
  );
}

// Global error handler — reports to Crashlytics with file location, screen, breadcrumbs, and scenario.
const handleGlobalError = (error, isFatal) => {
  const msg = error?.message ?? String(error);
  const isVideoPlayerRejected = /VideoPlayer\.(pause|play)\s+has\s+been\s+rejected/i.test(msg) || /shared\s+object.*released/i.test(msg);
  if (isVideoPlayerRejected) {
    return; // expo-video rejection when player is released; already guarded at call sites
  }
  console.error('Global error caught:', error);
  crashlyticsService.recordError(error, isFatal ? 'fatal_js_error' : 'js_error', {
    handler: 'global',
    is_fatal: String(!!isFatal),
  });
  if (isFatal) {
    Alert.alert(
      'Unexpected Error',
      'An unexpected error occurred. The app will restart.',
      [
        {
          text: 'OK',
          onPress: () => {},
        }
      ]
    );
  }
};

// Helper function to extract icons from navigation data
const extractIcons = (navItems) => {
  const icons = {};
  navItems.forEach(item => {
    if (item.icon) {
      icons[item.title] = item.icon;
    }
  });
  return icons;
};

// Local icons mapping
const LOCAL_ICONS = {
  'Home': require('./assets/footer/Home.png'),
  'Feeds': require('./assets/footer/ForYou.png'),
  'My List': require('./assets/footer/MyList.png'),
  'Search': require('./assets/footer/Search.png'),
  'Profile': require('./assets/footer/Profile.png'),
};

// Set up global error handling
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    // Log to a service in production
  };
}

// Configure global audio mode once for the app to avoid
// background/parallel audio conflicts with ExoPlayer.
// Lazy-load expo-av so we don't touch native bridge until after mount (reduces post-splash crash on e.g. Samsung A13).
const useConfigureAudioMode = () => {
  useEffect(() => {
    const configure = async () => {
      try {
        if (Platform.OS === 'web') return;
        // Brief delay so native bridge is ready after splash (helps avoid crash on e.g. Samsung A13)
        await new Promise((r) => setTimeout(r, 300));
        const Av = require('expo-av');
        await Av.Audio.setAudioModeAsync({
          interruptionModeAndroid: Av.InterruptionModeAndroid.DoNotMix,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: Av.InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: false,
        });
      } catch (e) {
        console.warn('Failed to set audio mode', e);
      }
    };
    configure();
  }, []);
};

// Custom Icon Component that handles local assets, API URLs, and Ionicons
const CustomTabIcon = ({ localIcon, iconUrl, iconName, focused, color, size }) => {
  if (localIcon) {
    // Use local asset
    return (
      <Image
        source={localIcon}
        style={{
          width: size,
          height: size,
          tintColor: color,
          opacity: focused ? 1 : 0.6,
        }}
        resizeMode="contain"
      />
    );
  } else if (iconUrl) {
    // Use image from API
    return (
      <Image
        source={{ uri: iconUrl }}
        style={{
          width: size,
          height: size,
          tintColor: color,
          opacity: focused ? 1 : 0.6,
        }}
        resizeMode="contain"
      />
    );
  } else {
    // Fallback to Ionicons
    return <Ionicons name={iconName} size={size} color={color} />;
  }
};

// Bottom Tab Navigator
function BottomTabNavigator({ navItems, tabIcons, navigation }) {
  const insets = useSafeAreaInsets();
  const { isForYouPlaying } = useTabBar();
  const { checkSubscriptionStatus } = require('./src/context/SubscriptionContext').useSubscription();
  const TAB_ICON_SIZE = 24;
  const [initialWindowHeight] = React.useState(() => Dimensions.get('screen').height);
  // Use fallback minimum bottom inset when insets are 0 on fresh launch (e.g. before safe area is ready),
  // so the tab bar doesn't sit under the system gesture bar / home indicator until insets update.
  const effectiveBottomInset = (insets.bottom != null && insets.bottom > 0)
    ? insets.bottom
    : (Platform.OS === 'ios' ? 34 : 45);
  const tabHeight = 60 + effectiveBottomInset + 10;
  const isIPad = Platform.OS === 'ios' && Platform.isPad;

  // Check subscription status when navigation changes
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', async (e) => {
      try {
        await checkSubscriptionStatus();
      } catch (error) {
        console.error('Error checking subscription status on navigation:', error);
      }
    });

    return unsubscribe;
  }, [navigation, checkSubscriptionStatus]);

  // Component mapping for navigation items (Home/Feeds use stack so TileDetails shows with tab bar)
  const componentMap = {
    'Home': HomeStackScreen,
    'Series': MyListStackScreen,
    'Movies': MyListStackScreen,
    'Sports': MyListStackScreen,
    'Feeds': FeedsStackScreen,
    'My List': MyListStackScreen,
    'Profile': ProfileScreen,
    'Search': SearchStackScreen,
    'StarME': StarNavigator,
  };

  // Default Ionicons mapping for fallback
  const defaultIcons = {
    'Home': { focused: 'home', unfocused: 'home-outline' },
    'Feeds': { focused: 'albums', unfocused: 'albums-outline' },
    'My List': { focused: 'bookmark', unfocused: 'bookmark-outline' },
    'Profile': { focused: 'person', unfocused: 'person-outline' },
    'Search': { focused: 'search', unfocused: 'search-outline' },
    'Series': { focused: 'tv', unfocused: 'tv-outline' },
    'Movies': { focused: 'film', unfocused: 'film-outline' },
    'Sports': { focused: 'football', unfocused: 'football-outline' },
    'Live': { focused: 'tv', unfocused: 'tv-outline' },
  };

  // Validate navItems
  if (!Array.isArray(navItems)) {
    console.error('BottomTabNavigator: navItems is not an array:', navItems);
    return (
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
      </Tab.Navigator>
    );
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // iPad only: label below icon and center-aligned
        ...(isIPad && {
          tabBarLabelPosition: 'below-icon',
          tabBarItemStyle: { alignItems: 'center', justifyContent: 'center' },
        }),
        tabBarLabel: ({ focused, color }) => {
          // StarME: render the StarME wordmark image at the label position.
          if (route.name === 'StarME') {
            return (
              <Image
                source={require('./src/starme/assets/images/starme_wordmark.png')}
                style={{ width: 52, height: 12, marginTop: isIPad ? 4 : 6, opacity: focused ? 1 : 0.9 }}
                resizeMode="contain"
              />
            );
          }
          return (
            <Text
              style={{
                fontFamily: 'Product Sans',
                fontWeight: focused ? '700' : '400',
                fontSize: 12,
                lineHeight: 12,
                letterSpacing: 0,
                textAlign: 'center',
                marginTop: isIPad ? 4 : 7,
                color: color,
              }}
            >
              {route.name}
            </Text>
          );
        },
        tabBarIcon: ({ focused, color, size }) => {
          const iconSize = TAB_ICON_SIZE;
          switch (route.name) {
            case 'Home':
              return <HomeIcon size={iconSize} focused={focused} />;

            case 'Feeds':
              return focused ? (
                <ForYouIconFocused size={iconSize} />
              ) : (
                <ForYouIconUnfocused size={iconSize} />
              );

            case 'My List':
              return <MyListIcon size={iconSize} focused={focused} />;

            case 'Search':
              return <SearchIcon size={iconSize} focused={focused} />;

            case 'Profile':
              return <ProfileIcon size={iconSize} focused={focused} />;

            case 'StarME':
              // StarME star icon (wordmark is rendered at the label position below).
              return (
                <Image
                  source={require('./src/starme/assets/images/starme_star.png')}
                  style={{ width: 30, height: 29, opacity: focused ? 1 : 0.9 }}
                  resizeMode="contain"
                />
              );

            default:
              // Fallback to default icons for other routes
              const localIcon = LOCAL_ICONS[route.name];
              const iconUrl = tabIcons[route.name];
              const defaultIcon = defaultIcons[route.name] || defaultIcons['Home'];
              const iconName = focused ? defaultIcon.focused : defaultIcon.unfocused;

              return (
                <CustomTabIcon
                  localIcon={localIcon}
                  iconUrl={iconUrl}
                  iconName={iconName}
                  focused={focused}
                  color={color}
                  size={iconSize}
                />
              );
          }
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#AAAAAA',
        tabBarStyle: {
          backgroundColor: '#1A1A1A',
          borderTopWidth: 0,
          height: tabHeight,
          paddingBottom: effectiveBottomInset + 10,
          paddingTop: 8,
          paddingHorizontal: isIPad ? 150 : 0,
          // Lock position to initial bottom of screen so it doesn't move with keyboard
          position: 'absolute',
          top: initialWindowHeight - tabHeight,
          left: 0,
          right: 0,
          // Hide tab bar when For You page is playing videos
          display: isForYouPlaying ? 'none' : 'flex',
        },
        headerShown: false,
      })}
    >
      {(() => {
        try {
          if (navItems.length > 0) {
            // Render dynamic navigation items from API
            return navItems.map((item) => {
              // Validate item structure
              if (!item || typeof item !== 'object') {
                console.error('BottomTabNavigator: Invalid item structure:', item);
                return null;
              }

              const title = item.title || item.name || 'Unknown';
              const Component = componentMap[title];
              
              if (!Component) {
                console.warn(`BottomTabNavigator: No component found for title "${title}", using ProfileScreen as fallback`);
                return (
                  <Tab.Screen
                    key={item.path || item.id || title}
                    name={title}
                    component={ProfileScreen}
                  />
                );
              }

              // When user leaves a tab with a nested stack (Home, Feeds, My List, Search, Profile), pop to root
              // so when they tap the tab again from footer they always land on the main screen, not TileDetails
              const isStackTab = title === 'Home' || title === 'Feeds' || title === 'My List' || title === 'Search' || title === 'Profile';
              const screenOptions = isStackTab ? { popToTopOnBlur: true } : undefined;

              // When user taps My List tab from footer, always set fromProfile: false so back goes to Home.
              // (When opened from Profile menu, ProfileScreen passes fromProfile: true explicitly.)
              // Use function form so we get the Tab navigator's navigation (parent's navigation is the Stack and doesn't know 'My List').
              const listeners = title === 'My List'
                ? ({ navigation: tabNav }) => ({
                    tabPress: (e) => {
                      e.preventDefault();
                      tabNav.navigate('My List', { screen: 'MyListMain', params: { fromProfile: false } });
                    },
                  })
                : undefined;

              return (
                <Tab.Screen
                  key={item.path || item.id || title}
                  name={title}
                  component={Component}
                  options={screenOptions}
                  listeners={listeners}
                />
              );
            }).filter(Boolean); // Remove null items
          } else {
            // Show only Home screen while loading, but hide tab bar
            return <Tab.Screen name="Home" component={HomeScreen} />;
          }
        } catch (error) {
          console.error('BottomTabNavigator: Error rendering tabs:', error);
          return <Tab.Screen name="Home" component={HomeScreen} />;
        }
      })()}
    </Tab.Navigator>
  );
}

// Helper to get the active route name from nested navigation state
const getActiveRouteName = (state) => {
  if (!state || !state.routes || state.routes.length === 0) return null;
  let route = state.routes[state.index ?? 0];
  while (route.state && route.state.routes && route.state.routes.length > 0) {
    route = route.state.routes[route.state.index ?? 0];
  }
  return route.name;
};

// Map route/screen names to page_category for analytics (avoids empty page_Category in Mixpanel)
const getPageCategoryFromRoute = (routeName) => {
  if (!routeName) return 'app';
  const categoryMap = {
    AuthCheck: 'auth',
    Auth: 'auth',
    PhoneLogin: 'auth',
    EmailLogin: 'auth',
    OTPVerification: 'auth',
    MainTabs: 'main',
    HomeMain: 'home',
    Home: 'home',
    ForYouMain: 'for_you',
    MyListMain: 'my_list',
    MyList: 'my_list',
    SearchMain: 'search',
    Search: 'search',
    TileDetails: 'content',
    VideoPlayer: 'player',
    Reels: 'player',
    PlayerSettings: 'player',
    Episodes: 'content',
    SeriesDetail: 'content',
    EditProfile: 'profile',
    WatchHistory: 'profile',
    Settings: 'settings',
    Subscription: 'subscription',
    ManageSubscription: 'subscription',
    SubscriptionWebView: 'subscription',
    FooterLinkDetail: 'content',
    LegalWebView: 'legal',
  };
  return categoryMap[routeName] || routeName.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase() || 'app';
};

const navigationRef = createNavigationContainerRef();

const linking = {
  prefixes: ['hmini://', 'https://fasttv.app'],
  config: {
    screens: {
      MainTabs: {
        path: '',
        screens: {
          Home: 'home',
          Feeds: 'feeds',
          'My List': 'watchlist',
          Search: 'search',
          Profile: 'profile',
        },
      },
      // play/episode and play/show are NOT listed here — DeepLinkHandler handles them
      // so we can route to Reels vs TileDetails based on subscription/guest
      Settings: 'profile/settings',
      WatchHistory: 'profile/history',
      ManageSubscription: 'profile/subscription/manage',
    },
  },
  // Prevent React Navigation from applying state from URL. We handle all deep links in
  // DeepLinkHandler (and post-login in AuthScreen/OTPVerificationScreen). Without this,
  // a duplicate/delayed 'url' event (e.g. on Android) would run getStateFromPath(path);
  // paths like "show/123" don't match config so RN would apply default state (Home) and
  // overwrite the screen we navigated to (TileDetails/Reels), causing "redirect to Home".
  getStateFromPath: () => undefined,
};

// Wrapper that prevents screenshots/screen recording on native (blank screen in recents, screen share, and screenshots)
function ScreenCaptureBlocker({ children }) {
  // usePreventScreenCapture();
  return children;
}

// Main Stack Navigator
export default function App() {
  const navigationStateRef = useRef();
  // Defer loading Stripe native module until after mount to avoid startup crash (NativeModule of undefined)
  const [StripeProviderComponent, setStripeProviderComponent] = useState(() => StripeProvider);

  const [fontsLoaded] = useFonts({
    'Product Sans': require('./assets/fonts/ProductSansRegular.ttf'),
    'Product Sans Bold': require('./assets/fonts/ProductSansBold.ttf'),
    'Product Sans Italic': require('./assets/fonts/ProductSansItalic.ttf'),
    'Product Sans Medium': require('./assets/fonts/ProductSansMedium.ttf'),
    'Product Sans BoldItalic': require('./assets/fonts/ProductSansBoldItalic.ttf'),
    // StarME display + body families (see src/starme/theme).
    ...StarFonts,
  });

  // Track when navigation tree is ready (NavigationContainer.onReady)
  const [isNavReady, setIsNavReady] = useState(false);
  const [hasHiddenSplash, setHasHiddenSplash] = useState(false);

  // Configure global audio mode for video playback
  useConfigureAudioMode();

  // Defer Firebase background handler, Stripe, and splash screen until after mount (avoids NativeModule crash)
  React.useEffect(() => {
    if (Platform.OS !== 'web') {
      try {
        const Splash = require('expo-splash-screen');
        Splash.preventAutoHideAsync?.().catch(() => {});
      } catch (_) {}
    }
    registerFirebaseBackgroundHandler();
    if (Platform.OS !== 'web') {
      try {
        const RealStripe = require('@stripe/stripe-react-native').StripeProvider;
        setStripeProviderComponent(() => RealStripe);
      } catch (error) {
        console.warn('Stripe not available:', error);
      }
    }
  }, []);

  // Hide the native splash screen only after fonts and navigation are ready,
  // so the user never sees an empty RN root view.
  React.useEffect(() => {
    if (fontsLoaded && isNavReady && !hasHiddenSplash) {
      try {
        require('expo-splash-screen').hideAsync().finally(() => {
          setHasHiddenSplash(true);
        });
      } catch (_) {
        setHasHiddenSplash(true);
      }
    }
  }, [fontsLoaded, isNavReady, hasHiddenSplash]);

  // Set up global error handling
  React.useEffect(() => {
    const errorHandler = (error, isFatal) => {
      handleGlobalError(error, isFatal);
    };

    // Set up error handling
    if (global.ErrorUtils) {
      global.ErrorUtils.setGlobalHandler(errorHandler);
    }

    return () => {
      if (global.ErrorUtils) {
        global.ErrorUtils.setGlobalHandler(null);
      }
    };
  }, []);

  // Initialize notification service and analytics
  React.useEffect(() => {
    const initializeServices = async () => {
      try {
        await crashlyticsService.initialize();

        // Initialize Firebase first so FCM token is available when notificationService runs
        initializeFirebase();

        await notificationService.initialize();
        console.log('Notification service initialized successfully');

        await analyticsService.initialize();
        console.log('Analytics service initialized successfully');

        // Initialize MoEngage notification routing *after* MoEngage SDK is fully initialized
        try {
          moengageNotificationHandler.initialize(navigationRef);
          console.log('moengageNotificationHandler initialized');
        } catch (e) {
          console.warn('Error initializing notification handler:', e);
        }
      } catch (error) {
        console.error('Failed to initialize services:', error);
        crashlyticsService.recordError(error, 'init_services', { scenario: 'init_services' });
      }
    };

    // Initialize immediately - retry logic will handle delays
    initializeServices();

    // Cleanup on unmount
    return () => {
      notificationService.cleanup();
    };
  }, []);

  // Notify analytics when app goes to background/foreground so sessions can end and events flush
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        analyticsService.logAppBackground();
      } else if (nextState === 'active') {
        analyticsService.logAppForeground();
        // Retry FCM token and pass to MoEngage when app comes to foreground (helps if first attempt failed)
        notificationService.refreshToken().catch(() => { });
      }
    });
    return () => sub.remove();
  }, []);

  // Initialize deep linking service
  React.useEffect(() => {
    const subscription = deepLinkingService.initialize();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  // Android back: if there is history, go back; otherwise go to Home (never exit app from first screen)
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const nav = navigationRef.current;
      if (nav?.canGoBack?.()) {
        nav.goBack();
        return true;
      }
      nav?.navigate?.('MainTabs', { screen: 'Home' });
      return true;
    });
    return () => sub.remove();
  }, []);

  // Lock to portrait on iOS/Android so iPad (and phones) stay portrait even though we declare all orientations for App Store iPad multitasking.
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
  }, []);

  const rootStyle = { flex: 1, backgroundColor: '#000' };

  if (!fontsLoaded) {
    // Keep native splash visible while fonts load
    return null;
  }

  const appContent = (
    <AuthProvider>
      <InteractiveShowProvider>
      <SubscriptionProvider>
        <MyListProvider>
          <WatchHistoryProvider>
            <FavouritesProvider>
              <NavigationProvider>
                <DataCacheProvider>
                  <DataSaverProvider>
                    <AutoplayProvider>
                      <TabBarProvider>
                        <NavigationContainer
                          ref={navigationRef}
                          linking={linking}
                          onReady={() => {
                            setIsNavReady(true);
                            // Do NOT call processInitialURL here. Cold-start URLs are handled by
                            // AuthGate (pending URL or guest login) and by AuthScreen/OTPVerificationScreen
                            // after login. Calling processInitialURL here can run late or duplicate and
                            // cause a second navigate that throws and sends user to Home.
                            crashlyticsService.setScenario('AuthCheck');
                          }}
                          onStateChange={async (state) => {
                            try {
                              const previousState = navigationStateRef.current;
                              const currentRouteName = getActiveRouteName(state);
                              const previousRouteName = previousState
                                ? getActiveRouteName(previousState)
                                : null;

                              if (currentRouteName) {
                                crashlyticsService.setScenario(currentRouteName);
                                await analyticsService.logScreenView(
                                  currentRouteName,
                                  previousRouteName || '',
                                  getPageCategoryFromRoute(currentRouteName)
                                );
                              }

                              navigationStateRef.current = state;
                            } catch (error) {
                              console.error('Error logging screen view:', error);
                            }
                          }}
                        >
                          <IapListenerSetup navigationRef={navigationRef} />
                          <StatusBar style="light" {...(Platform.OS !== 'android' && { backgroundColor: '#000' })} />
                          <Stack.Navigator
                            initialRouteName="AuthCheck"
                            screenOptions={{
                              headerShown: false,
                              cardStyle: { backgroundColor: '#000' },
                            }}
                          >
                            <Stack.Screen
                              name="AuthCheck"
                              component={AuthGate}
                            />
                            {/* StarME Phase 1 checkpoint: dev-only theme/component gallery. */}
                            <Stack.Screen
                              name="StarMEGallery"
                              component={StarMeGallery}
                            />
                            {/* StarME Phase 2 checkpoint: dev-only data + API harness. */}
                            <Stack.Screen
                              name="StarMEDataHarness"
                              component={StarMeDataHarness}
                            />
                            {/* StarME feature shell (own theme scope + navigator). Entry (Home
                                rail card + deep link) is wired in Phase 4 with the real Promo. */}
                            <Stack.Screen
                              name="StarME"
                              component={StarNavigator}
                            />
                            <Stack.Screen
                              name="Auth"
                              component={AuthScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="PhoneLogin"
                              component={PhoneLoginScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="EmailLogin"
                              component={EmailLoginScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="OTPVerification"
                              component={OTPVerificationScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="MainTabs"
                            >
                              {(props) => (
                                <NavigationGate navigation={props.navigation}>
                                  {({ navigationData }) => {
                                    return (
                                      <ErrorBoundary>
                                        <BottomTabNavigator
                                          {...props}
                                          navItems={navigationData || []}
                                          tabIcons={navigationData ? extractIcons(navigationData) : {}}
                                          navigation={props.navigation}
                                        />
                                      </ErrorBoundary>
                                    )
                                  }}
                                </NavigationGate>
                              )}
                            </Stack.Screen>
                            <Stack.Screen
                              name="VideoPlayer"
                              component={VideoPlayerScreen}
                              options={{
                                presentation: 'modal', // Makes it slide up like a modal
                              }}
                            />
                            <Stack.Screen
                              name="Reels"
                              component={ReelsScreen}
                              options={{
                                presentation: 'fullScreenModal', // True full screen on iOS (no card gap at top)
                                gestureEnabled: false, // Disable gesture to prevent conflicts with video swiping
                                headerShown: false,
                                cardStyle: { backgroundColor: '#000' },
                                contentStyle: { backgroundColor: '#000', flex: 1 },
                              }}
                            />
                            <Stack.Screen
                              name="InteractiveReels"
                              component={InteractiveReelsScreen}
                              options={{
                                presentation: 'fullScreenModal',
                                gestureEnabled: false,
                                headerShown: false,
                                cardStyle: { backgroundColor: '#000' },
                                contentStyle: { backgroundColor: '#000', flex: 1 },
                              }}
                            />
                            <Stack.Screen
                              name="PlayerSettings"
                              component={PlayerSettingsScreen}
                              options={{
                                presentation: 'modal', // Modal presentation for settings
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="Episodes"
                              component={EpisodesScreen}
                              options={{
                                headerShown: false,
                                presentation: 'transparentModal',
                                cardStyle: { backgroundColor: 'transparent' },
                              }}
                            />
                            <Stack.Screen
                              name="EditProfile"
                              component={EditProfileScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="WatchHistory"
                              component={WatchHistoryScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="Settings"
                              component={SettingsScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="Subscription"
                              component={SubscriptionScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="ManageSubscription"
                              component={ManageSubscriptionScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="SubscriptionWebView"
                              component={SubscriptionWebViewScreen}
                              options={{
                                headerShown: false,
                                presentation: 'modal',
                              }}
                            />
                            <Stack.Screen
                              name="Search"
                              component={SearchScreen}
                              options={{
                                presentation: 'card', // Slide in from right
                                animationEnabled: true,
                                cardStyleInterpolator: forHorizontalIOS,
                                headerShown: false,
                                cardStyle: { backgroundColor: '#000' },
                              }}
                            />
                            <Stack.Screen
                              name="SeriesDetail"
                              component={SeriesDetailScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="TileDetails"
                              component={TileDetailsScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="FooterLinkDetail"
                              component={FooterLinkDetailScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="LegalWebView"
                              component={LegalWebViewScreen}
                              options={{
                                headerShown: false,
                              }}
                            />
                            <Stack.Screen
                              name="RichLanding"
                              component={RichLandingScreen}
                              options={{
                                headerShown: false,
                                presentation: 'modal',
                              }}
                            />
                          </Stack.Navigator>
                        </NavigationContainer>
                        <DeepLinkHandler navigationRef={navigationRef} />
                      </TabBarProvider>
                    </AutoplayProvider>
                  </DataSaverProvider>
                </DataCacheProvider>
              </NavigationProvider>
            </FavouritesProvider>
          </WatchHistoryProvider>
        </MyListProvider>
      </SubscriptionProvider>
      </InteractiveShowProvider>
    </AuthProvider>
  );

  // Root ErrorBoundary: catch uncaught JS errors so we show fallback instead of "app keeps stopping"
  const wrappedContent = (
    <ErrorBoundary>
      {appContent}
    </ErrorBoundary>
  );

  // Only wrap with StripeProvider on native platforms
  if (Platform.OS !== 'web') {
    return (
      <AppUpdateProvider>
        <AppUpdateGate>
          <PaymentFeedbackProvider>
            <View style={rootStyle}>
              <StripeProviderComponent
                publishableKey={STRIPE_CONFIG.publishableKey}
                merchantIdentifier={STRIPE_CONFIG.merchantIdentifier}
                urlScheme={STRIPE_CONFIG.urlScheme}
              >
                <CustomStripeProvider>
                  <ScreenCaptureBlocker>
                    {wrappedContent}
                  </ScreenCaptureBlocker>
                </CustomStripeProvider>
              </StripeProviderComponent>
            </View>
          </PaymentFeedbackProvider>
        </AppUpdateGate>
      </AppUpdateProvider>
    );
  }

  return (
    <AppUpdateProvider>
      <AppUpdateGate>
        <PaymentFeedbackProvider>
          <View style={rootStyle}>
            <CustomStripeProvider>
              {wrappedContent}
            </CustomStripeProvider>
          </View>
        </PaymentFeedbackProvider>
      </AppUpdateGate>
    </AppUpdateProvider>
  );
}
