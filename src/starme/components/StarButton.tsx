// src/starme/components/StarButton.tsx
// FastTV button variants (design spec §3), full width, min height 54, radius 12.
// PRIMARY  solid white #FFFFFF fill, dark #111214 label (btn/primary)
// GOLD     pale-gold fill (FastTV coin gold), dark #111214 label (premium CTA)
// GHOST    translucent white rgba(255,255,255,0.21) + 1px border, white label (btn/secondary)
// Disabled = opacity 0.35. Press = scale 0.965 (spring) + haptic.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StarPalette as C, radius, type as T } from '../theme';

type Variant = 'PRIMARY' | 'GHOST' | 'GOLD';

// A stack of arrows that continuously flow downward — the "keep going / scroll down"
// indicator shown inside a disabled CTA (e.g. Consent, until both boxes + sign).
function ScrollingHint({ color }: { color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    a.start();
    return () => a.stop();
  }, [t]);
  return (
    <View style={{ marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            marginTop: i === 0 ? 0 : -9,
            opacity: t.interpolate({
              inputRange: [0, 0.33, 0.66, 1],
              outputRange: i === 0 ? [1, 0.3, 0.3, 1] : i === 1 ? [0.3, 1, 0.3, 0.3] : [0.3, 0.3, 1, 0.3],
            }),
          }}
        >
          <MaterialIcons name="keyboard-arrow-down" size={16} color={color} />
        </Animated.View>
      ))}
    </View>
  );
}

export function StarButton({
  label,
  onPress,
  enabled = true,
  variant = 'PRIMARY',
  style,
  hintWhenDisabled = false,
  dense = false,
}: {
  label: string;
  onPress: () => void;
  enabled?: boolean;
  variant?: Variant;
  style?: ViewStyle;
  hintWhenDisabled?: boolean;
  // Tighter horizontal padding for side-by-side (row) use.
  dense?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      stiffness: 900,
      damping: 40,
      mass: 1,
      useNativeDriver: true,
    }).start();
  const showHint = hintWhenDisabled && !enabled;

  const gradient: [string, string] =
    variant === 'PRIMARY'
      ? ['#FFFFFF', '#FFFFFF']
      : variant === 'GOLD'
        ? [C.gold, C.goldInk]
        : ['rgba(255,255,255,0.21)', 'rgba(255,255,255,0.21)'];
  const labelColor =
    variant === 'PRIMARY' ? '#111214' : variant === 'GOLD' ? '#111214' : C.text;

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: enabled ? 1 : showHint ? 0.6 : 0.35 }, style]}>
      <Pressable
        disabled={!enabled}
        onPressIn={() => spring(0.965)}
        onPressOut={() => spring(1)}
        onPress={() => {
          // Android-only haptic, matching the Kotlin Vibration.vibrate(12).
          if (Platform.OS === 'android') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
      >
        <LinearGradient
          colors={gradient}
          style={{
            minHeight: 54,
            borderRadius: radius.cta,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: dense ? 14 : 40,
            paddingVertical: 16,
            borderWidth: variant === 'GHOST' ? 1 : 0,
            borderColor: 'rgba(255,255,255,0.2)',
          }}
        >
          {showHint ? <ScrollingHint color={labelColor} /> : null}
          <Text style={{ ...T.labelLarge, color: labelColor, textAlign: 'center' }}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
