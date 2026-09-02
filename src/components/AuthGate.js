import React, { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
// Lazy-load expo-linking to avoid NativeModule at bundle load
function getLinking() { return require('expo-linking'); }
import { useAuth } from '../context/AuthContext';
import { useSubscriptionRefresh } from '../hooks/useSubscriptionRefresh';
import deepLinkingService from '../services/deepLinkingService';

const AuthGate = ({ navigation }) => {
  const { loading, isAuthenticated, validateCurrentAuth, signInAsGuest } = useAuth();
  const { refreshSubscription } = useSubscriptionRefresh();
  const guestSignInInProgress = useRef(false);
  const [isSigningInGuest, setIsSigningInGuest] = useState(false);
  const [checkingLaunchContext, setCheckingLaunchContext] = useState(true);

  React.useEffect(() => {
    const checkAuthAndNavigate = async () => {
      if (!loading) {
        if (!isAuthenticated) {
          // User is not authenticated.
          // Only when URL has skipAuth=true: skip login and land directly on intended screen (via guest login).
          // Otherwise: show Login first; after login we will redirect to the intended route.
          if (guestSignInInProgress.current) return;
          setCheckingLaunchContext(true);
          let initialUrl = null;
          try {
            initialUrl = await getLinking().getInitialURL();
          } catch (_) {}
          setCheckingLaunchContext(false);
          const isOurDeepLink =
            initialUrl &&
            typeof initialUrl === 'string' &&
            initialUrl.trim() &&
            (initialUrl.startsWith('hmini://') ||
              initialUrl.startsWith('https://fasttv.app'));

          const skipAuth =
            initialUrl &&
            typeof initialUrl === 'string' &&
            (initialUrl.includes('skipAuth=true') || initialUrl.includes('skipAuth%3Dtrue'));

          if (!isOurDeepLink) {
            navigation.replace('Auth');
            return;
          }

          if (!skipAuth) {
            // Default: show Login first; store URL to process after login.
            deepLinkingService.setPendingInitialUrl(initialUrl);
            navigation.replace('Auth');
            return;
          }

          guestSignInInProgress.current = true;
          setIsSigningInGuest(true);
          try {
            const result = await signInAsGuest();
            if (result?.success) {
              // User appears to be authenticated, validate the token
              const validationResult = await validateCurrentAuth();
              if (!validationResult.success) {
                navigation.replace('Auth');
              } else {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'MainTabs' }],
                });
                if (initialUrl && typeof initialUrl === 'string' && initialUrl.trim()) {
                  setTimeout(() => deepLinkingService.processURL(initialUrl), 400);
                }
              }
            } else {
              navigation.replace('Auth');
            }
          } catch (err) {
            console.warn('AuthGate: Guest sign-in failed, redirecting to Auth:', err);
            navigation.replace('Auth');
          } finally {
            guestSignInInProgress.current = false;
            setIsSigningInGuest(false);
          }
          return;
        }
        // User appears to be authenticated, validate the token
        const validationResult = await validateCurrentAuth();
        if (!validationResult.success) {
          navigation.replace('Auth');
        } else {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
          let initialUrl = null;
          try {
            initialUrl = await getLinking().getInitialURL();
          } catch (_) {}
          if (
            initialUrl &&
            typeof initialUrl === 'string' &&
            initialUrl.trim() &&
            (initialUrl.startsWith('hmini://') || initialUrl.startsWith('https://fasttv.app'))
          ) {
            setTimeout(() => deepLinkingService.processURL(initialUrl), 400);
          }
        }
      }
      if (!loading) setCheckingLaunchContext(false);
    };

    checkAuthAndNavigate();
  }, [loading, isAuthenticated, navigation, refreshSubscription, validateCurrentAuth, signInAsGuest]);

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      const scriptTag = document.createElement('script');
      scriptTag.src = 'https://accounts.google.com/gsi/client';
      scriptTag.async = true;
      scriptTag.onload = () => {
        console.log('Google script loaded');
      };
      scriptTag.onerror = () => {
        console.error('Failed to load Google script');
      };

      document.body.appendChild(scriptTag);
    }
  }, []);

  // While auth / deep-link checks run, show a simple black screen.
  // The native splash stays up until App.js hides it; this view is only
  // visible very briefly (if at all) between navigation transitions.
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
};

export default AuthGate; 