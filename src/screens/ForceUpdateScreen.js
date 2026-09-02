import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const defaultBgSource = require('../../assets/carousels/login_background.png');
const appIconSource = require('../../assets/icon.png');

// Top padding when SafeAreaProvider is not available (ForceUpdateScreen renders outside nav tree)
const TOP_PADDING = Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ?? 0);

export default function ForceUpdateScreen({ onUpdate, storeUrl }) {
  const handleUpdate = () => {
    if (storeUrl && onUpdate) {
      onUpdate(storeUrl);
    }
  };

  return (
    <ImageBackground
      source={defaultBgSource}
      style={[styles.container, { paddingTop: TOP_PADDING, paddingBottom: '80%' }]}
      resizeMode="stretch"
      imageStyle={styles.backgroundImageStyle}
    >
      <StatusBar barStyle="light-content" />
      {/* Gradient Overlay - Creates smooth transition from background to footer (same as AuthScreen) */}
      <LinearGradient
        colors={
          Platform.OS === 'android'
            ? ['transparent', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)']
            : ['transparent', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)']
        }
        locations={Platform.OS === 'android' ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.4, 0.7, 1]}
        style={styles.gradientOverlay}
      />

      {/* Content aligned to bottom (same structure as AuthScreen bottomContent) */}
      <View style={[styles.bottomContent, { bottom: Platform.OS === 'ios' ? 50 : 0 }]}>
        <View style={styles.textOverlay}>
          <View style={styles.appIconWrapper}>
            <Image source={appIconSource} style={styles.appIcon} resizeMode="contain" />
          </View>
          <Text style={styles.mainTitle}>A Quick Update Needed</Text>
          <Text style={styles.subtitle}>
            We've made important improvements to FastTV. Update now to keep your stories running
            smoothly.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.updateButton}
          onPress={handleUpdate}
          activeOpacity={0.8}
        >
          <Text style={styles.updateButtonText}>Update Now</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundImageStyle: {
    opacity: 1,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'android' ? '160%' : '120%',
    zIndex: 0,
  },
  bottomContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    zIndex: 1,
  },
  textOverlay: {
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
  },
  appIcon: {
    width: 80,
    height: 80,
  },
  mainTitle: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 23,
    lineHeight: 23,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontFamily: 'Product Sans',
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#CCCCCC',
    opacity: 0.6,
  },
  updateButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  updateButtonText: {
    fontFamily: 'Product Sans',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: 0,
    color: '#000000',
    textAlign: 'center',
  },
});
