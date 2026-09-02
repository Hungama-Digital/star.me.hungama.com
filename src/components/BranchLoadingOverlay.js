import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LazyImage from './LazyImage';

const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_W = Math.round(SCREEN_W * 0.62);
const THUMB_H = Math.round(THUMB_W * 1.45);
const BAR_HORIZONTAL_PADDING = 32;
const BAR_WIDTH = SCREEN_W - BAR_HORIZONTAL_PADDING * 2;
const BAR_HEIGHT = 36;

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function BranchLoadingOverlay({
  visible,
  branch,
  durationMs = 3500,
  onComplete,
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [percentText, setPercentText] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      setPercentText(0);
      completedRef.current = false;
      return undefined;
    }

    completedRef.current = false;
    progress.setValue(0);
    setPercentText(0);

    const listenerId = progress.addListener(({ value }) => {
      const next = Math.min(100, Math.max(0, Math.round(value * 100)));
      setPercentText((prev) => (prev === next ? prev : next));
    });

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    anim.start(({ finished }) => {
      if (finished && !completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    });

    return () => {
      progress.removeListener(listenerId);
      anim.stop();
    };
  }, [visible, durationMs, onComplete, progress]);

  if (!visible || !branch) return null;

  const thumbUri = branch.thumbnail_url;
  const thumbSource = thumbUri ? { uri: thumbUri } : null;

  const barFillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BAR_WIDTH],
  });

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.backdrop}>
        <View style={styles.content}>
          <View style={styles.thumbCard}>
            {thumbSource ? (
              <LazyImage
                source={thumbSource}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                priority
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.thumbPlaceholder]} />
            )}
          </View>

          <View style={styles.barTrack}>
            <AnimatedLinearGradient
              colors={['#FF6A41', '#A24BFF', '#C044FD']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.barFill, { width: barFillWidth }]}
            />
            <View style={styles.barLabelRow} pointerEvents="none">
              <Ionicons name="play" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.barLabelText}>{`${percentText}%`}</Text>
            </View>
          </View>

          <Text style={styles.title} numberOfLines={1}>Writing your ending...</Text>
          <Text style={styles.subtitle} numberOfLines={2}>{branch.display_label}</Text>
        </View>

        <Text style={styles.footer}>Don't close the app</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,10,0.96)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 120,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: BAR_HORIZONTAL_PADDING,
    width: '100%',
  },
  thumbCard: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A1A1F',
  },
  thumbPlaceholder: {
    backgroundColor: '#1A1A1F',
  },
  barTrack: {
    marginTop: 28,
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: BAR_HEIGHT / 4,
  },
  barLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  barLabelText: {
    color: '#FFFFFF',
    fontFamily: 'Arial',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    marginTop: 24,
    color: '#FFFFFF',
    fontFamily: 'Arial',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    color: '#FFFFFF',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.85,
  },
  footer: {
    color: '#7A7A7A',
    fontFamily: 'Arial',
    fontSize: 13,
    textAlign: 'center',
  },
});
