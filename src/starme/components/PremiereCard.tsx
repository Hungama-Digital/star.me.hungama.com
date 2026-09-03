// src/starme/components/PremiereCard.tsx
// Large hero list card for the "My Premieres" screen (guide 13.2).
// Full-bleed keyart (or a genre gradient) behind a bottom scrim, an "N Episodes"
// pill top-right, a title lockup, a filled CTA pill bottom-left and a gold lock
// (or a play glyph) bottom-right. Layout follows the FastTV design system:
// blue accent (C.orange), gold premium lock (C.gold), radius.hero corners.
import React, { useRef } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StarPalette as C, radius, type as T, Display } from '../theme';

export interface PremiereCardProps {
  title: string;
  subtitle?: string;
  episodes: number;
  image?: ImageSourcePropType | null;
  gradient?: readonly [string, string];
  locked?: boolean;
  featured?: boolean;
  ctaLabel: string;
  onPress: () => void;
}

const SCRIM = ['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.88)'] as const;

export function PremiereCard({
  title,
  subtitle,
  episodes,
  image,
  gradient,
  locked = false,
  featured = false,
  ctaLabel,
  onPress,
}: PremiereCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, stiffness: 900, damping: 40, mass: 1, useNativeDriver: true }).start();

  const bg = gradient ?? (['#272728', '#141414'] as const);

  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        borderRadius: radius.hero,
        ...(featured
          ? { shadowColor: C.orange, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 9 }
          : { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 }),
      }}
    >
      <Pressable
        onPressIn={() => spring(0.98)}
        onPressOut={() => spring(1)}
        onPress={() => {
          if (Platform.OS === 'android') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${episodes} episodes. ${ctaLabel}`}
      >
        <View
          style={{
            width: '100%',
            aspectRatio: 1.42,
            borderRadius: radius.hero,
            overflow: 'hidden',
            borderWidth: featured ? 2 : 1,
            borderColor: featured ? C.orange : C.line,
            backgroundColor: C.surface,
          }}
        >
          {/* Base tint (also the full background for artless worlds). */}
          <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

          {image ? (
            <Image source={image} resizeMode="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <View style={{ width: 10, height: 10, backgroundColor: 'rgba(255,255,255,0.55)', transform: [{ rotate: '45deg' }] }} />
            </View>
          )}

          {/* Bottom scrim for legibility. */}
          <LinearGradient colors={SCRIM} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

          {/* Episodes pill, top-right. */}
          <View
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: radius.round,
              paddingHorizontal: 14,
              paddingVertical: 7,
            }}
          >
            <Text style={{ ...T.labelMedium, color: C.text }}>
              {episodes} Episode{episodes === 1 ? '' : 's'}
            </Text>
          </View>

          {/* Title lockup + CTA row, bottom. */}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: Display, fontWeight: '800', fontSize: 24, lineHeight: 28, color: '#FFFFFF', letterSpacing: 0.2 }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={{ ...T.bodySmall, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}>
                {subtitle}
              </Text>
            ) : null}

            <View style={{ height: 14 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: C.orange, borderRadius: radius.round, paddingHorizontal: 20, paddingVertical: 12 }}>
                <Text style={{ ...T.labelLarge, color: '#FFFFFF' }}>{ctaLabel}</Text>
              </View>
              {locked ? (
                <MaterialIcons
                  name="lock"
                  size={30}
                  color={C.gold}
                  style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}
                />
              ) : (
                <MaterialIcons name="play-circle-filled" size={34} color="rgba(255,255,255,0.92)" />
              )}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
