import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import LottieLoader from './LottieLoader';

const AppleSignInButton = ({ onSuccess, onError, style, textStyle, showText = true }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const { signInWithApple } = useAuth();

  useEffect(() => {
    // Check if Apple Sign-In is available (iOS only)
    const checkAvailability = async () => {
      if (Platform.OS === 'ios') {
        try {
          const available = await AppleAuthentication.isAvailableAsync();
          setIsAvailable(available);
        } catch (error) {
          console.error('Error checking Apple Auth availability:', error);
          setIsAvailable(false);
        }
      } else {
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    
    try {
      const result = await signInWithApple();
      
      if (result.success) {
        if (onSuccess) {
          onSuccess(result.user);
        }
      } else {
        if (onError) {
          onError(result.error);
        }
      }
    } catch (error) {
      if (onError) {
        onError(error.message || 'Apple sign-in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render on non-iOS platforms or if not available
  if (Platform.OS !== 'ios' || !isAvailable) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[
        !showText && {
          paddingVertical: 0,
          paddingHorizontal: 0,
          marginVertical: 0,
        },
        styles.customButton,
        isLoading && styles.loadingButton,
        style
      ]}
      onPress={handleAppleSignIn}
      disabled={isLoading}
      activeOpacity={0.6}
    >
      <View style={styles.buttonContent}>
        {isLoading ? (
          <LottieLoader size="small" />
        ) : (
          <>
            <Text style={styles.appleIcon}>🍎</Text>
            {showText && (
              <Text style={[
                styles.customButtonText,
                isLoading && styles.loadingText,
                textStyle
              ]}>
                {isLoading ? 'Signing in...' : 'Continue with Apple'}
              </Text>
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

// Alternative implementation using custom button (if native button doesn't work)
export const AppleSignInButtonCustom = ({ onSuccess, onError, style, textStyle, showText = true }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const { signInWithApple } = useAuth();

  useEffect(() => {
    const checkAvailability = async () => {
      if (Platform.OS === 'ios') {
        try {
          const available = await AppleAuthentication.isAvailableAsync();
          setIsAvailable(available);
        } catch (error) {
          console.error('Error checking Apple Auth availability:', error);
          setIsAvailable(false);
        }
      } else {
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    
    try {
      const result = await signInWithApple();
      
      if (result.success) {
        if (onSuccess) {
          onSuccess(result.user);
        }
      } else {
        if (onError) {
          onError(result.error);
        }
      }
    } catch (error) {
      if (onError) {
        onError(error.message || 'Apple sign-in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (Platform.OS !== 'ios' || !isAvailable) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[
        styles.customButton,
        isLoading && styles.loadingButton,
        style
      ]}
      onPress={handleAppleSignIn}
      disabled={isLoading}
      activeOpacity={0.6}
    >
      <View style={styles.buttonContent}>
        {isLoading ? (
          <LottieLoader size="small" />
        ) : (
          <>
            <Text style={styles.appleIcon}>🍎</Text>
            {showText && (
              <Text style={[
                styles.customButtonText,
                isLoading && styles.loadingText,
                textStyle
              ]}>
                {isLoading ? 'Signing in...' : 'Continue with Apple'}
              </Text>
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginVertical: 10,
    minHeight: 60,
    minWidth: 60,
    overflow: 'hidden',
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
  appleIconContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  appleButton: {
    width: '100%',
    height: '100%',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    zIndex: 1,
  },
  loadingText: {
    color: '#cccccc',
  },
  // Custom button styles (fallback)
  customButton: {
    backgroundColor: '#000000',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 60,
    minWidth: 60,
  },
  customButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  appleIcon: {
    fontSize: 20,
  },
});

export default AppleSignInButton;
