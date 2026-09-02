import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Modal,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
  Alert,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDataSaver } from '../context/DataSaverContext';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

const PlayerSettingsScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { 
    manualQuality, 
    saveManualQuality, 
    isDataSaverEnabled, 
    getDataUsageEstimate,
    currentVideoId,
    savePerVideoQuality,
    getPerVideoQuality
  } = useDataSaver();
  
  // Get video ID from route params or use current video ID
  const videoId = route?.params?.videoId || currentVideoId;
  const isPerVideoMode = !!videoId;
  
  // Video Quality Options
  const [videoQuality, setVideoQuality] = useState(manualQuality);
  const videoQualityOptions = ['Auto', 'Low', 'Medium', 'High', 'HD', '4K'];
  
  // Popup state for data saver warning
  const [showDataSaverPopup, setShowDataSaverPopup] = useState(false);
  const [pendingQuality, setPendingQuality] = useState(null);
  
  // Picture in Picture (moved up) - COMMENTED OUT
  // const [pipEnabled, setPipEnabled] = useState(true);
  
  // Subtitles (moved down) - COMMENTED OUT
  // const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  // const [subtitleLanguage, setSubtitleLanguage] = useState('English');
  // const subtitleLanguages = ['English', 'Hindi', 'Spanish'];
  
  // Animation and gesture handling
  const slideAnim = useRef(new Animated.Value(0)).current;
  // removed contentHeight state to avoid unnecessary re-renders

  // Initialize quality based on current mode - simplified to prevent useInsertionEffect issues
  useEffect(() => {
    if (isPerVideoMode) {
      // Check if there's a per-video quality setting
      const perVideoQuality = getPerVideoQuality(videoId);
      if (perVideoQuality) {
        setVideoQuality(perVideoQuality);
      } else {
        // Use default quality (manual quality or Low if data saver is on)
        setVideoQuality(isDataSaverEnabled ? 'Low' : manualQuality);
      }
    } else {
      // Global mode - use manual quality
      setVideoQuality(manualQuality);
    }
  }, [isPerVideoMode, videoId, isDataSaverEnabled, manualQuality]); // Removed getPerVideoQuality from dependencies

  useEffect(() => {
    // Smooth slide-in animation using timing + easing to prevent jank
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      navigation.goBack();
    });
  }, [slideAnim, navigation]);

  useEffect(() => {
    const backAction = () => {
      handleClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [handleClose]);

  const QualityOption = React.memo(({ option, selected, onPress }) => (
    <TouchableOpacity
      style={[styles.qualityOption, selected && styles.qualityOptionSelected]}
      onPress={() => onPress(option)}
      activeOpacity={0.8}
      // Remove disabled prop to allow selection even when data saver is on
    >
      <Text style={[styles.qualityText, selected && styles.qualityTextSelected, isDataSaverEnabled && option !== 'Low' && styles.disabledText]}>
        {option}
      </Text>
      {selected && (
        <View style={styles.selectedIndicator}>
          <Ionicons name="checkmark" size={12} color="#007AFF" />
        </View>
      )}
      {isDataSaverEnabled && option !== 'Low' && (
        <View style={styles.dataSaverOverlay}>
          <Text style={styles.dataSaverText}>Data Saver</Text>
        </View>
      )}
    </TouchableOpacity>
  ));

  const LanguageOption = React.memo(({ language, selected, onPress }) => (
    <TouchableOpacity
      style={[styles.languageOption, selected && styles.languageOptionSelected]}
      onPress={() => onPress(language)}
      activeOpacity={0.8}
    >
      <Text style={[styles.languageText, selected && styles.languageTextSelected]}>
        {language}
      </Text>
      {selected && (
        <View style={styles.selectedIndicator}>
          <Ionicons name="checkmark" size={12} color="#007AFF" />
        </View>
      )}
    </TouchableOpacity>
  ));

  const handleQualityChange = useCallback((quality) => {
    // Check if data saver is enabled and user is trying to select high quality
    if (isDataSaverEnabled && quality !== 'Low' && quality !== 'Auto') {
      setPendingQuality(quality);
      setShowDataSaverPopup(true);
    } else {
      // Direct selection for Low, Auto, or when data saver is off
      applyQualityChange(quality);
    }
  }, [isDataSaverEnabled, applyQualityChange]);

  const applyQualityChange = useCallback((quality) => {
    setVideoQuality(quality);
    
    if (isPerVideoMode) {
      // Save per-video quality setting
      savePerVideoQuality(videoId, quality);
    } else {
      // Save global manual quality setting
      saveManualQuality(quality);
    }
  }, [isPerVideoMode, videoId, savePerVideoQuality, saveManualQuality]);

  const handleConfirmHighQuality = useCallback(() => {
    if (pendingQuality) {
      applyQualityChange(pendingQuality);
      setPendingQuality(null);
    }
    setShowDataSaverPopup(false);
  }, [pendingQuality, applyQualityChange]);

  const handleCancelHighQuality = useCallback(() => {
    setPendingQuality(null);
    setShowDataSaverPopup(false);
  }, []);

  const SettingRow = ({ icon, title, subtitle, rightComponent, onPress }) => (
    <TouchableOpacity 
      style={styles.settingRow} 
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.settingLeft}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={20} color="#007AFF" />
        </View>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      {/* Removed StatusBar manipulation inside modal to avoid flash/flicker on show */}
      
      {/* Subtle backdrop - only dims background slightly */}
      <TouchableOpacity 
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      
      {/* Modern compact drawer */}
      <Animated.View 
        style={[
          styles.drawer,
          {
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [500, 0],
              })
            }]
          }
        ]}
        renderToHardwareTextureAndroid
        shouldRasterizeIOS
      >
        {/* Modern handle bar */}
        <View style={styles.handle} />
        
        {/* Compact header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isPerVideoMode ? 'Video Settings' : 'Player Settings'}
          </Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
        >
          
          {/* Video Quality Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Video Quality</Text>
              {isDataSaverEnabled && (
                <View style={styles.dataSaverBadge}>
                  <Text style={styles.dataSaverBadgeText}>Data Saver Active</Text>
                </View>
              )}
            </View>
            
            <Text style={styles.sectionSubtitle}>
              {isDataSaverEnabled 
                ? 'Data saver is enabled - videos will use Low quality (480p) to save data'
                : `Current usage: ${getDataUsageEstimate(videoId)}`
              }
            </Text>
            <View style={styles.qualityGrid}>
              {videoQualityOptions.map((option) => (
                <QualityOption
                  key={option}
                  option={option}
                  selected={videoQuality === option}
                  onPress={handleQualityChange}
                />
              ))}
            </View>
          </View>

          {/* Picture in Picture Section - moved up */}
          {/* 
          <View style={styles.section}>
            <SettingRow
              icon="copy-outline"
              title="Picture in Picture"
              subtitle="Continue watching in a small window"
              rightComponent={
                <Switch
                  value={pipEnabled}
                  onValueChange={setPipEnabled}
                  trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                  thumbColor={pipEnabled ? '#FFFFFF' : '#F4F3F4'}
                  ios_backgroundColor="#3A3A3C"
                />
              }
            />
          </View>
          */}

          {/* Subtitles Section - moved down */}
          {/* 
          <View style={styles.section}>
            <SettingRow
              icon="text-outline"
              title="Subtitles"
              subtitle="Display captions and subtitles"
              rightComponent={
                <Switch
                  value={subtitlesEnabled}
                  onValueChange={setSubtitlesEnabled}
                  trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                  thumbColor={subtitlesEnabled ? '#FFFFFF' : '#F4F3F4'}
                  ios_backgroundColor="#3A3A3C"
                />
              }
            />

            {subtitlesEnabled && (
              <View style={styles.expandedContent}>
                <Text style={styles.subSectionTitle}>Language</Text>
                <View style={styles.languageGrid}>
                  {subtitleLanguages.map((language) => (
                    <LanguageOption
                      key={language}
                      language={language}
                      selected={subtitleLanguage === language}
                      onPress={setSubtitleLanguage}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
          */}

          {/* Bottom safe area */}
          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </Animated.View>

      {/* Data Saver Warning Popup */}
      {showDataSaverPopup && (
        <Modal
          visible={showDataSaverPopup}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCancelHighQuality}
        >
          <View style={styles.popupBackdrop}>
            <View style={styles.popupContent}>
              <Text style={styles.popupTitle}>Warning</Text>
              <Text style={styles.popupMessage}>
                You have Data Saver enabled. Selecting {pendingQuality} quality will consume more data.
                {isPerVideoMode ? ' This setting will only apply to this video.' : ''}
                Do you want to proceed?
              </Text>
              <View style={styles.popupButtons}>
                <TouchableOpacity
                  style={[styles.popupButton, styles.popupButtonCancel]}
                  onPress={handleCancelHighQuality}
                >
                  <Text style={styles.popupButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.popupButton, styles.popupButtonConfirm]}
                  onPress={handleConfirmHighQuality}
                >
                  <Text style={styles.popupButtonText}>Proceed</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: screenHeight * 0.75,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2C2C2E',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  closeButton: {
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    padding: 8,
    marginLeft: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 12,
    lineHeight: 16,
  },
  dataSaverBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dataSaverBadgeText: {
    fontSize: 10,
    color: '#000000',
    fontWeight: '600',
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 16,
  },
  qualityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qualityOption: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: (screenWidth - 56) / 3,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  qualityOptionSelected: {
    backgroundColor: '#F2F2F7',
    borderColor: '#007AFF',
  },
  qualityText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  qualityTextSelected: {
    color: '#000000',
    fontWeight: '600',
  },
  disabledText: {
    color: '#8E8E93',
    opacity: 0.5,
  },
  dataSaverOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
  },
  dataSaverText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  selectedIndicator: {
    marginLeft: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
  },
  expandedContent: {
    marginTop: 12,
    paddingLeft: 44,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageOption: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    minWidth: 80,
  },
  languageOptionSelected: {
    backgroundColor: '#F2F2F7',
    borderColor: '#007AFF',
  },
  languageText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  languageTextSelected: {
    color: '#000000',
    fontWeight: '600',
  },
  popupBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  popupContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  popupMessage: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  popupButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  popupButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  popupButtonCancel: {
    backgroundColor: '#3A3A3C',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  popupButtonConfirm: {
    backgroundColor: '#007AFF',
  },
  popupButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default PlayerSettingsScreen; 