import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
  Modal,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getHash } from 'react-native-otp-verify';

import Toast from '../components/Toast';

// Android-only: Phone Number Hint API (requires native module)
let showPhoneNumberHint;
let PhoneNumberHintErrorCodes;
if (Platform.OS === 'android') {
  try {
    const hintModule = require('@shayrn/react-native-android-phone-number-hint');
    showPhoneNumberHint = hintModule.showPhoneNumberHint;
    PhoneNumberHintErrorCodes = hintModule.PhoneNumberHintErrorCodes || {};
  } catch (e) {
    showPhoneNumberHint = null;
    PhoneNumberHintErrorCodes = {};
  }
}

import API, { getDeviceType } from '../services/api';

const PhoneLoginScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const [selectedCountry, setSelectedCountry] = useState({
    name: 'India',
    code: '+91',
    flag: '🇮🇳',
    placeholder: '1234567890',
    maxLength: 11,
    maxDigits: 10,
  });

  // Available countries
  const countries = [
    {
      name: 'United States',
      code: '+1',
      flag: '🇺🇸',
      placeholder: '(555) 123-4567',
      maxLength: 14,
      maxDigits: 10,
    },
    {
      name: 'United Kingdom',
      code: '+44',
      flag: '🇬🇧',
      placeholder: '07123 456789',
      maxLength: 12,
      maxDigits: 11,
    },
    {
      name: 'India',
      code: '+91',
      flag: '🇮🇳',
      placeholder: '98765 43210',
      maxLength: 11,
      maxDigits: 10,
    },
  ];

useEffect(() => {
    const analyticsService = require('../services/analytics').default;
      var properties = {
        entry_point : "splash",
         }
         analyticsService.logLoginMethodSelected('phone', properties);
  }, []);

  React.useEffect(() => {
    const backAction = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);

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

    // Validate phone number (require full digit count for selected country)
    const digitCount = (phoneNumber || '').replace(/\D/g, '').length;
    const requiredDigits = selectedCountry.maxDigits ?? 10;
    if (!phoneNumber || digitCount < requiredDigits) {
      setToastMessage('Please enter a valid phone number');
      setToastType('error');
      setToastVisible(true);
      return;
    }

    setIsLoading(true);

    try {
      // Prepare phone number with country code
      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      const fullPhoneNumber = selectedCountry.code + cleanPhoneNumber;

      // Validate phone number format for Firebase
      if (cleanPhoneNumber.length < requiredDigits) {
        throw new Error('Please enter a valid phone number');
      }

      // Step 1: Check if user exists
      console.log('Step 1: Checking user existence for:', cleanPhoneNumber);
      const checkResult = await API.checkUser({ mobile: cleanPhoneNumber });
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
      console.log('Step 2: Sending OTP to:', fullPhoneNumber, 'User exists:', userExists);

      let sendResult;
      const mobileNumber = cleanPhoneNumber;

      const hashValue = await getHash();
      console.log('INFO --> hashValue : ', hashValue);

      if (userExists) {
        // User exists, call sendOTP API
        console.log('User exists, calling sendOTP API');
        const sendOTPData = {
          mobile: mobileNumber,
          hash: hashValue,
          code: selectedCountry.code,
        };

        sendResult = await API.sendOTP(sendOTPData);
        console.log('SendOTP API result:', sendResult);
      } else {
        // User doesn't exist, call register API
        console.log('User does not exist, calling register API');
        const registerData = {
          mobile: mobileNumber,
          loginSource: 3,
          deviceType: getDeviceType().toString(),
          hash: hashValue,
          code: selectedCountry.code,
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
          phoneNumber: fullPhoneNumber,
          displayPhoneNumber: selectedCountry.code + ' ' + phoneNumber,
          userExists: userExists,
          cleanMobile: cleanPhoneNumber,
          sessionId: sessionId
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



  const formatPhoneNumber = (text, country = selectedCountry) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, '');

    // Format based on country
    if (country.code === '+1') {
      // US format: (XXX) XXX-XXXX
      if (cleaned.length <= 3) {
        return cleaned;
      } else if (cleaned.length <= 6) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
      } else {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
      }
    } else if (country.code === '+44') {
      // UK format: 07123 456789
      if (cleaned.length <= 5) {
        return cleaned;
      } else {
        return `${cleaned.slice(0, 5)} ${cleaned.slice(5, 11)}`;
      }
    } else if (country.code === '+91') {
      // India format: 98765 43210
      if (cleaned.length <= 5) {
        return cleaned;
      } else {
        return `${cleaned.slice(0, 5)} ${cleaned.slice(5, 10)}`;
      }
    }

    return cleaned;
  };

  const handlePhoneNumberChange = (text) => {
    const maxDigits = selectedCountry.maxDigits ?? 10;
    const cleaned = text.replace(/\D/g, '').slice(0, maxDigits);
    const formatted = formatPhoneNumber(cleaned);
    setPhoneNumber(formatted);
  };

  const handleCountrySelect = (country) => {
    setSelectedCountry(country);
    setPhoneNumber(''); // Clear phone number when country changes
    setShowCountryPicker(false);
  };

  /**
   * Parse E.164 phone number (e.g. +919876543210) and match to country + national number.
   * Returns { country, nationalNumber } or null if no match.
   */
  const parseE164ToCountryAndNational = (e164) => {
    if (!e164 || typeof e164 !== 'string') return null;
    const cleaned = e164.replace(/\D/g, '');
    if (!cleaned) return null;
    const withPlus = e164.trim().startsWith('+') ? e164 : '+' + cleaned;
    // Match by longest country code first (+91, +44 before +1)
    const sorted = [...countries].sort((a, b) => (b.code.length - a.code.length));
    for (const c of sorted) {
      const codeDigits = c.code.replace(/\D/g, '');
      if (withPlus.replace(/\D/g, '').startsWith(codeDigits)) {
        const national = withPlus.slice(c.code.length).replace(/\D/g, '');
        if (national.length >= (c.maxDigits ?? 10)) {
          return { country: c, nationalNumber: national };
        }
      }
    }
    return null;
  };

  const handleUseMyNumber = async () => {
    if (Platform.OS !== 'android' || !showPhoneNumberHint) return;
    try {
      const e164 = await showPhoneNumberHint({ showGuidanceDialog: true });
      const parsed = parseE164ToCountryAndNational(e164);
      if (parsed) {
        setSelectedCountry(parsed.country);
        const formatted = formatPhoneNumber(parsed.nationalNumber, parsed.country);
        setPhoneNumber(formatted);
      } else {
        setToastMessage('Could not recognize phone number format. Please enter manually.');
        setToastType('error');
        setToastVisible(true);
      }
    } catch (err) {
      if (err?.code === 'USER_CANCELLED') {
        return; // User dismissed - no message needed
      }
      if (err?.code === 'RESOLUTION_REQUIRED' || err?.code === 'API_NOT_CONNECTED') {
        setToastMessage('Phone number sharing is disabled. Enable it in Settings → Google → Autofill.');
        setToastType('error');
        setToastVisible(true);
        return;
      }
      setToastMessage(err?.message || 'Could not get phone number. Please enter manually.');
      setToastType('error');
      setToastVisible(true);
    }
  };

  // Auto-trigger phone number hint when user lands on this screen (Android only)
  useEffect(() => {
    if (Platform.OS !== 'android' || !showPhoneNumberHint) return;
    const timer = setTimeout(() => handleUseMyNumber(), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + 20 : 20 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Continue with phone</Text>
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
              <Ionicons name="call" size={48} color="#FFFFFF" />
              <Text style={styles.welcomeTitle}>
                Enter your phone number
              </Text>
              <Text style={styles.welcomeSubtitle}>
                We will send a verification code to sign you in.
              </Text>
            </View>

            {/* Input Container */}
            <View style={styles.inputContainer}>
              <View style={styles.phoneInputWrapper}>
                <TouchableOpacity
                  style={styles.countrySelector}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={styles.countryCode}>{selectedCountry.code}</Text>
                  <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
                </TouchableOpacity>
                <TextInput
                  style={styles.phoneInput}
                  placeholder={selectedCountry.placeholder}
                  placeholderTextColor="#888888"
                  value={phoneNumber}
                  onChangeText={handlePhoneNumberChange}
                  keyboardType="phone-pad"
                  maxLength={selectedCountry.maxLength}
                  autoFocus
                />
              </View>
            </View>

            {/* Send OTP Button */}
            <TouchableOpacity
              style={[
                styles.sendOTPButton,
                (!phoneNumber || (phoneNumber.replace(/\D/g, '').length < (selectedCountry.maxDigits ?? 10)) || isLoading) && styles.disabledButton
              ]}
              onPress={handleSendOTP}
              disabled={!phoneNumber || (phoneNumber.replace(/\D/g, '').length < (selectedCountry.maxDigits ?? 10)) || isLoading}
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

        {/* Country Picker Modal */}
        <Modal
          visible={showCountryPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowCountryPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Country</Text>
                <TouchableOpacity
                  onPress={() => setShowCountryPicker(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={countries}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.countryItem}
                    onPress={() => handleCountrySelect(item)}
                  >
                    <Text style={styles.countryItemFlag}>{item.flag}</Text>
                    <Text style={styles.countryItemName}>{item.name}</Text>
                    <Text style={styles.countryItemCode}>{item.code}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* Toast Component */}
        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onHide={() => setToastVisible(false)}
        />

        {/* reCAPTCHA container for web */}
        {Platform.OS === 'web' && (
          <div
            id="recaptcha-container"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              opacity: 0,
              pointerEvents: 'none'
            }}
          ></div>
        )}
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
    marginBottom: 30,
  },

  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#444444',
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#444444',
  },
  countryFlag: {
    fontSize: 20,
    marginRight: 8,
  },
  countryCode: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 4,
  },
  phoneInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 12,
  },

  sendOTPButton: {
    height: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 0,
    paddingHorizontal: 24,
    marginBottom: 30,
    justifyContent: 'center',
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
  termsContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  termsText: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  countryItemFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  countryItemName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  countryItemCode: {
    color: '#888888',
    fontSize: 14,
  },
});

export default PhoneLoginScreen; 