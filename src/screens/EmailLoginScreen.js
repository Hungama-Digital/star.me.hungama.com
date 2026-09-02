import React, { useState, useEffect } from 'react';
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

import Toast from '../components/Toast';

import API, { getDeviceType } from '../services/api';

const EmailLoginScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

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

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = (email) => {
    return emailRegex.test(email);
  };

  const handleSendOTP = async () => {
    // Dismiss keyboard to avoid layout flicker when submitting with keyboard open
    if (Platform.OS !== 'web') {
      try {
        const { Keyboard } = require('react-native');
        Keyboard.dismiss();
      } catch (e) {
        // Fail silently if Keyboard module is unavailable
      }
    }

    // Validate email
    if (!email || !validateEmail(email)) {
      setToastMessage('Please enter a valid email address');
      setToastType('error');
      setToastVisible(true);
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Check if user exists using emailId
      console.log('Step 1: Checking user existence for email:', email);
      const checkResult = await API.checkUser({ emailId: email });
      const decodedCheckResult = API.decodeJwtToken(checkResult);
      console.log('Check user result:', decodedCheckResult);

      let userExists = false;
      if (decodedCheckResult && decodedCheckResult.success) {
        userExists = true;
        console.log('User exists, proceeding to send OTP');
      } else {
        console.log('User does not exist, will register after OTP verification');
      }

      // Step 2: Send OTP via API
      console.log('Step 2: Sending OTP to email:', email, 'User exists:', userExists);

      let sendResult;

      if (userExists) {
        // User exists, call sendOTP API with emailId
        console.log('User exists, calling sendOTP API');
        const sendOTPData = {
          emailId: email
        };

        sendResult = await API.sendOTP(sendOTPData);
        console.log('SendOTP API result:', sendResult);
      } else {
        // User doesn't exist, call register API
        console.log('User does not exist, calling register API');
        const registerData = {
          emailId: email,
          loginSource: 3, // Same as phone (OTP-based)
          deviceType: getDeviceType().toString(),
        };

        sendResult = await API.registerUser(registerData);
        console.log('Register API result:', sendResult);
      }

      if (!sendResult) {
        throw new Error('Failed to send OTP');
      }

      // Response may be plain JSON or JWT; normalize to decoded payload
      const decodedResult =
        sendResult && typeof sendResult === 'object' && !Array.isArray(sendResult) && 'success' in sendResult
          ? sendResult
          : API.decodeJwtToken(sendResult);
      console.log('Decoded sendOTP/register result:', decodedResult);

      if (decodedResult && decodedResult.success === false) {
        setToastMessage("Unable to send OTP. Try again or use another login method");
        setToastType('error');
        setToastVisible(true);
        return;
      }
      if (!decodedResult || decodedResult.error) {
        throw new Error(decodedResult?.error || 'Failed to send OTP');
      }

      // Extract sessionId from decoded response
      let sessionId = '';
      if (decodedResult.data && decodedResult.data[0] && decodedResult.data[0].sessionId) {
        sessionId = decodedResult.data[0].sessionId;
        console.log('SessionId from initial OTP:', sessionId);
      }

      setToastMessage('Verification code sent successfully!');
      setToastType('success');
      setToastVisible(true);

      // Navigate to OTP verification screen
      setTimeout(() => {
        navigation.navigate('OTPVerification', {
          emailId: email,
          displayEmail: email,
          userExists: userExists,
          cleanEmail: email,
          sessionId: sessionId,
          loginType: 'email' // Indicate this is email-based login
        });
      }, 1500);

    } catch (error) {
      console.error('Send OTP error:', error);

      setToastMessage(error.message || 'Failed to send verification code');
      setToastType('error');
      setToastVisible(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      <LinearGradient
        colors={['#1a1a1a', '#2d2d2d', '#1a1a1a']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Continue with Email</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Main Content with Keyboard Handling */}
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.welcomeSection}>
              <Ionicons name="mail" size={48} color="#FFFFFF" />
              <Text style={styles.welcomeTitle}>
                Enter Your Email Address
              </Text>
              <Text style={styles.welcomeSubtitle}>
                We will send a verification code to sign you in.
              </Text>
            </View>

            {/* Input Container */}
            <View style={styles.inputContainer}>
              <View style={styles.emailInputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#888888" style={styles.emailIcon} />
                <TextInput
                  style={styles.emailInput}
                  placeholder="example@email.com"
                  placeholderTextColor="#888888"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
            </View>

            {/* Send OTP Button */}
            <TouchableOpacity
              style={[
                styles.sendOTPButton,
                (!email || !validateEmail(email) || isLoading) && styles.disabledButton
              ]}
              onPress={handleSendOTP}
              disabled={!email || !validateEmail(email) || isLoading}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                {isLoading ? (
                  <Text style={styles.buttonText}>Sending...</Text>
                ) : (
                  <>
                    <Text style={styles.buttonText}>Send Verification Code</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Toast Component */}
        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onHide={() => setToastVisible(false)}
        />
      </LinearGradient>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: 0,
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
    justifyContent: 'top',
    marginTop: 40,
    paddingHorizontal: 30,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeTitle: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 23,
    lineHeight: 23,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#FFFFFF',
    marginTop: 20,
    marginBottom: 12,
  },
  welcomeSubtitle: {
    fontFamily: 'Product Sans',
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#CCCCCC',
    width: '70%'
  },
  inputContainer: {
    marginBottom: 40,
  },
  emailInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#444444',
  },
  emailIcon: {
    marginRight: 12,
  },
  emailInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  sendOTPButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    marginBottom: 30,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  disabledButton: {
    opacity: 0.6,
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
});

export default EmailLoginScreen;
