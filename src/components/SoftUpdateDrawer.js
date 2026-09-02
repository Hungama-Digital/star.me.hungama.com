import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Rect } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Figma radial gradient colors for drawer background
const DRAWER_GRADIENT_CENTER = 'rgba(28, 54, 65, 1)';
const DRAWER_GRADIENT_EDGE = 'rgba(30, 30, 30, 1)';

export default function SoftUpdateDrawer({ visible, onUpdate, onLater, storeUrl }) {
  const [drawerHeight, setDrawerHeight] = useState(400);

  const handleUpdate = () => {
    if (storeUrl && onUpdate) {
      onUpdate(storeUrl);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onLater}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onLater}
      />
      <View
        style={styles.drawerContainer}
        onLayout={(e) => setDrawerHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.drawerGradientWrap} pointerEvents="none">
          <Svg width={SCREEN_WIDTH} height={drawerHeight} style={styles.drawerSvg}>
            <Defs>
              <SvgRadialGradient
                id="drawerBg"
                cx="0.5"
                cy="0.35"
                r="0.8"
                gradientUnits="objectBoundingBox"
              >
                <Stop offset="0" stopColor={DRAWER_GRADIENT_CENTER} stopOpacity="1" />
                <Stop offset="1" stopColor={DRAWER_GRADIENT_EDGE} stopOpacity="1" />
              </SvgRadialGradient>
            </Defs>
            <Rect x="0" y="0" width={SCREEN_WIDTH} height={drawerHeight} fill="url(#drawerBg)" />
          </Svg>
        </View>
        <View style={styles.handleBar} />
        <Image
          source={require('../../assets/icon.png')}
          style={styles.appIcon}
          resizeMode="contain"
        />
        <Text style={styles.title}>Better Stories, Better{'\n'}Experience</Text>
        <Text style={styles.description}>
          We've made FastTV smoother and even better for you.
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.laterButton}
            onPress={onLater}
            activeOpacity={0.8}
          >
            <Text style={styles.laterButtonText}>Later</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.updateButton}
            onPress={handleUpdate}
            activeOpacity={0.8}
          >
            <Text style={styles.updateButtonText}>Update Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  drawerContainer: {
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 64 : 54,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  drawerGradientWrap: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  drawerSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 30,
  },
  appIcon: {
    width: 72,
    height: 72,
    marginBottom: 16,
    borderRadius: 16,
  },
  title: {
    fontFamily: 'Product Sans Bold',
    fontSize: 22,
    lineHeight: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontFamily: 'Product Sans',
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  laterButton: {
    flex: 1,
    backgroundColor: '#3A3A3C',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButtonText: {
    fontFamily: 'Product Sans Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  updateButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButtonText: {
    fontFamily: 'Product Sans Bold',
    fontSize: 16,
    color: '#000000',
  },
});
