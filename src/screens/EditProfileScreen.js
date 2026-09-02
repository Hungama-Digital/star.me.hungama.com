import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  BackHandler,
  Platform,
} from 'react-native';
import LazyImage from '../components/LazyImage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import { LinearGradient } from 'expo-linear-gradient';
import { DatePicker } from '../components/Icons';

const EditProfileScreen = ({ navigation, route }) => {
  const { user, updateUserProfile } = useAuth();

  const {
    initialName = '',
    initialEmail = '',
    initialPhone = '',
    initialGender = '',
    initialDob = '',
    initialProfileImage = '',
  } = route?.params || {};

  // Accept any date format that JS Date (and the DateTimePicker) can parse,
  // but always normalize to YYYY-MM-DD for storage/rendering.
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

  // Normalize sex/gender so "male" -> "Male", "female" -> "Female" for correct display when re-opening edit
  const normalizeGender = (value) => {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [gender, setGender] = useState(() => normalizeGender(initialGender));
  const [dob, setDob] = useState(normalizeDobFromAny(initialDob));
  const [isSaving, setIsSaving] = useState(false);
  const [profileImage, setProfileImage] = useState(initialProfileImage);

  // Sync state from route.params when screen is focused (e.g. reopening Edit Profile after save)
  useFocusEffect(
    React.useCallback(() => {
      const params = route?.params || {};
      setName(params.initialName ?? '');
      setEmail(params.initialEmail ?? '');
      setPhone(params.initialPhone ?? '');
      setGender(normalizeGender(params.initialGender ?? ''));
      const nextDob = params.initialDob ?? '';
      setDob(normalizeDobFromAny(nextDob));
      setProfileImage(params.initialProfileImage ?? '');
    }, [route?.params])
  );

  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);

  // Simple gender selector modal
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  const handleGenderSelect = (value) => {
    setGender(value);
    setShowGenderPicker(false);
  };

  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (selectedDate) {
      // Format to YYYY-MM-DD
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      setDob(`${year}-${month}-${day}`);
    }

    if (Platform.OS === 'ios' && event.type === 'dismissed') {
      setShowDatePicker(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      require('../utils/errorReporting').reportErrorAlert('Error', 'Full Name is required');
      return;
    }
    if (!gender || !gender.trim()) {
      require('../utils/errorReporting').reportErrorAlert('Error', 'Please select Gender');
      return;
    }
    if (!dob || !dob.trim() || dob === '0000-00-00') {
      Alert.alert('Error', 'Please select Date of Birth');
      return;
    }

    try {
      setIsSaving(true);

      // Get user ID from auth token
      const authToken = await AsyncStorage.getItem('authToken');
      let userId = null;

      if (authToken) {
        try {
          const decodedToken = API.decodeJwtToken(authToken);
          userId =
            decodedToken?.data?.userId ||
            decodedToken?.userId ||
            decodedToken?.id ||
            user?.userId ||
            user?.uid ||
            57;
        } catch (error) {
          console.error('Error decoding auth token:', error);
          userId = user?.userId || user?.uid || 57;
        }
        API.setAuthToken(authToken);
      } else {
        userId = user?.userId || user?.uid || 57;
      }

      const fallbackEmail =
        user?.email || email || route?.params?.userEmail || '';

      const requestBody = {
        id: userId.toString(),
        firstName: name.trim(),
        emailId: fallbackEmail,
        dateOfBirth: dob || '0000-00-00',
        sex: gender || '',
        fileName: '',
        fileType: '',
        filePath: '',
      };

      await API.updateProfile(requestBody);

      // Update auth context display name
      if (user) {
        await updateUserProfile({
          displayName: name.trim(),
          name: name.trim(),
        });
      }

      // Redirect back to Profile immediately; Profile refetches on focus and shows updated data
      navigation.goBack();
    } catch (error) {
      console.error('Error updating profile:', error);
      require('../utils/errorReporting').reportErrorAlert(
        'Error',
        error?.message || 'Failed to update profile. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid =
    !!name.trim() &&
    !!(gender && gender.trim()) &&
    !!(dob && dob.trim() && dob !== '0000-00-00');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={isSaving}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar (show current image if available) */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle}>
            {profileImage ? (
              <LazyImage source={{ uri: profileImage }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={40} color="#FFFFFF" />
            )}
          </View>
        </View>

        {/* Form fields */}
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Full Name"
          placeholderTextColor="#888888"
          maxLength={30}
        />

        {/* Email (read-only) - hide when user has no email */}
        {email != null && String(email).trim() !== '' && (
          <TextInput
            style={[styles.input, styles.disabledInput]}
            value={email}
            placeholder="Email"
            placeholderTextColor="#888888"
            editable={false}
          />
        )}

        {/* Phone (read-only) - hide when user has no phone */}
        {phone != null && String(phone).trim() !== '' && (
          <TextInput
            style={[styles.input, styles.disabledInput]}
            value={phone}
            placeholder="Phone Number"
            placeholderTextColor="#888888"
            editable={false}
            keyboardType="phone-pad"
          />
        )}

        {/* Gender select box */}
        {Platform.OS === 'android' ? (
          <View style={styles.selectInputWrapper}>
            <TouchableOpacity
              style={[styles.selectInput, styles.selectInputFill]}
              onPress={() => setShowGenderPicker(true)}
              activeOpacity={0.8}
            >
              <Text style={gender ? styles.selectText : styles.selectPlaceholder}>
                {gender || 'Select Gender'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowGenderPicker(true)}
            activeOpacity={0.8}
          >
            <Text style={gender ? styles.selectText : styles.selectPlaceholder}>
              {gender || 'Select Gender'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* Date of Birth Picker */}
        {Platform.OS === 'android' ? (
          <View style={styles.selectInputWrapper}>
            <TouchableOpacity
              style={[styles.selectInput, styles.selectInputFill]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Text style={dob ? styles.selectText : styles.selectPlaceholder}>
                {dob ? dob.split('-').reverse().join('/') : 'Date of Birth (DD/MM/YYYY)'}
              </Text>
              <View>
                <DatePicker />
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.8}
          >
            <Text style={dob ? styles.selectText : styles.selectPlaceholder}>
              {dob ? dob.split('-').reverse().join('/') : 'Date of Birth (DD/MM/YYYY)'}
            </Text>
            <View>
              <DatePicker />
            </View>
          </TouchableOpacity>
        )}

        {showDatePicker && (
          <DateTimePicker
            testID="dateTimePicker"
            value={dob ? new Date(dob) : new Date()}
            mode="date"
            is24Hour={true}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            maximumDate={new Date()} // Prevent future dates
            themeVariant="dark"
          />
        )}
      </ScrollView>

      {/* Fixed bottom Save button, similar to design */}
      <View style={styles.footerSaveContainer}>
        <TouchableOpacity
          style={[styles.saveButton, (isSaving || !isFormValid) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#FFFFFF', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveButtonGradient}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Gender Picker Modal */}
      <Modal
        visible={showGenderPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGenderPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.genderModalContent}>
            <Text style={styles.modalTitle}>Select Gender</Text>
            <TouchableOpacity
              style={styles.genderOption}
              onPress={() => handleGenderSelect('Male')}
            >
              <Text style={styles.genderOptionText}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.genderOption}
              onPress={() => handleGenderSelect('Female')}
            >
              <Text style={styles.genderOptionText}>Female</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.genderOption}
              onPress={() => handleGenderSelect('Other')}
            >
              <Text style={styles.genderOptionText}>Other</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderOption, styles.genderCancel]}
              onPress={() => setShowGenderPicker(false)}
            >
              <Text style={styles.genderCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* No extra DOB modal anymore – picker is inline above */}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    fontFamily: 'Product Sans',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 60 : 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  avatarContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 48,
  },
  input: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333333',
    ...(Platform.OS === 'android' && { minHeight: 56 }),
  },
  disabledInput: {
    opacity: 0.8,
    backgroundColor: '#252525',
  },
  selectInput: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputWrapper: {
    height: 56,
    marginBottom: 10,
  },
  selectInputFill: {
    flex: 1,
    marginBottom: 0,
  },
  selectLabel: {
    fontSize: 15,
    color: '#AAAAAA',
    marginBottom: 2,
  },
  selectText: {
    fontFamily: 'Product Sans',
    fontSize: 15,
    color: '#FFFFFF',
  },
  selectPlaceholder: {
    fontSize: 14,
    color: '#888888',
  },
  saveButtonContainer: {
    marginTop: 16,
    marginBottom: 12,
  },
  footerSaveContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  saveButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
  },
  saveButtonGradient: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  genderModalContent: {
    width: '80%',
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
  },
  genderOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  genderOptionText: {
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  genderCancel: {
    borderBottomWidth: 0,
    marginTop: 4,
  },
  genderCancelText: {
    fontSize: 14,
    color: '#FF5555',
    textAlign: 'center',
  },
});

export default EditProfileScreen;

