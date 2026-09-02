import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Platform,
} from 'react-native';
import LottieLoader from './LottieLoader';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';

const GoogleSignInButton = ({ onSuccess, onError, style, textStyle, showText = true }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithGoogle } = useAuth();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    
    try {
       const analyticsService = require('../services/analytics').default;
      var properties = {
        entry_point : "splash",
         }
         analyticsService.logLoginMethodSelected('google', properties);
      const result = await signInWithGoogle();
      
      if (result.success && result.user) {
        if (onSuccess) {
          onSuccess(result.user);
        }
      } else {
        if (onError) {
          onError(result?.error || 'Google sign-in failed');
        }
      }
    } catch (error) {
      if (onError) {
        onError(error.message || 'Google sign-in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Check if we're in Expo Go and show appropriate message
  const isExpoGo = !global.Expo || global.Expo.Constants.appOwnership === 'expo';

  return (
    <TouchableOpacity
      style={[
        !showText && {
          paddingVertical: 0,
          paddingHorizontal: 0,
          marginVertical: 0,
        },
        styles.button,
        isLoading && styles.loadingButton,
        style
      ]}
      onPress={handleGoogleSignIn}
      disabled={isLoading}
      activeOpacity={0.6}
    >
      <View style={styles.buttonContent}>
        {isLoading ? (
          <LottieLoader size="small" />
        ) : (
          <View style={styles.googleIconContainer}>
            <Svg width="24" height="24" viewBox="0 0 24 24">
              <Path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <Path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <Path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <Path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </Svg>
          </View>
        )}
        {showText && (
          <Text style={[
            styles.buttonText,
            isLoading && styles.loadingText,
            textStyle
          ]}>
            {isLoading ? 'Signing in...' : 'Continue with Google'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 60,
    minWidth: 60,
  },
  loadingButton: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    flex: 1,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingText: {
    color: '#666666',
  },
  expoGoMessage: {
    color: '#ff6b35',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default GoogleSignInButton; 