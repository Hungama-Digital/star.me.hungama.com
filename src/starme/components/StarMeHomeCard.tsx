// src/starme/components/StarMeHomeCard.tsx
// The Home entry point into StarME (a rail card). Self-contained; navigates to the
// mounted "StarME" route. Kept under src/starme so the feature owns its own styling.
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StarPalette as C, radius, type as T, StarImages } from '../theme';

export default function StarMeHomeCard() {
  const navigation = useNavigation<{ navigate: (name: string) => void }>();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
      <Pressable onPress={() => navigation.navigate('StarME')} accessibilityRole="button">
        <LinearGradient
          colors={['#0B2A36', '#114255', '#0B2A36']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radius.hero,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.4)',
            padding: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Image
              source={StarImages.logo}
              style={{ width: 70, height: 77 }}
              resizeMode="contain"
              accessibilityLabel="StarME"
            />
            <Text style={{ ...T.titleMedium, color: '#fff', marginTop: 4 }}>
              Put your face in a micro drama
            </Text>
            <Text style={{ ...T.bodySmall, color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>
              One photo. One role. Your own premiere.
            </Text>
          </View>
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: radius.round,
              paddingHorizontal: 16,
              paddingVertical: 9,
            }}
          >
            <Text style={{ ...T.labelLarge, color: C.orangeDeep }}>Start</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
