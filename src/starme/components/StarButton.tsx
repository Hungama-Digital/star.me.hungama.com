// src/starme/components/StarButton.tsx
// Compose `.btn`: full width, min height 58, radius 18, three styles.
// PRIMARY  vertical gradient orange -> orangeDeep, white label
// GOLD     vertical gradient goldInk -> #C99B3F, label #241A05
// GHOST    transparent with a 1px line border, text-coloured label
// Disabled = opacity 0.35. Press = scale 0.965 (spring) + haptic.
import React, { useRef } from 'react';
import { Animated, Platform, Pressable, Text } from 'react-native';
import type { ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { StarPalette as C, radius, type as T } from '../theme';

type Variant = 'PRIMARY' | 'GHOST' | 'GOLD';

export function StarButton({
  label,
  onPress,
  enabled = true,
  variant = 'PRIMARY',
  style,
}: {
  label: string;
  onPress: () => void;
  enabled?: boolean;
  variant?: Variant;
  style?: ViewStyle;
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

  const gradient: [string, string] =
    variant === 'PRIMARY'
      ? [C.orange, C.orangeDeep]
      : variant === 'GOLD'
        ? [C.goldInk, '#C99B3F']
        : ['transparent', 'transparent'];
  const labelColor =
    variant === 'PRIMARY' ? '#FFFFFF' : variant === 'GOLD' ? '#241A05' : C.text;

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: enabled ? 1 : 0.35 }, style]}>
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
            minHeight: 58,
            borderRadius: radius.cta,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 16,
            borderWidth: variant === 'GHOST' ? 1 : 0,
            borderColor: C.line,
          }}
        >
          <Text style={{ ...T.labelLarge, color: labelColor, textAlign: 'center' }}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
