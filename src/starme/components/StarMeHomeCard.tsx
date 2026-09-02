// src/starme/components/StarMeHomeCard.tsx
// The Home entry point into StarME (a rail card). Self-contained; navigates to the
// mounted "StarME" route. Kept under src/starme so the feature owns its own styling.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StarPalette as C, radius, type as T, Display } from '../theme';

export default function StarMeHomeCard() {
  const navigation = useNavigation<{ navigate: (name: string) => void }>();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
      <Pressable onPress={() => navigation.navigate('StarME')} accessibilityRole="button">
        <LinearGradient
          colors={['#6E0C21', C.orange, '#28101E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radius.hero,
            borderWidth: 1,
            borderColor: 'rgba(212,175,55,0.55)',
            padding: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontFamily: Display, fontSize: 22, letterSpacing: 0.88, color: '#fff' }}>
                STAR
              </Text>
              <Text
                style={{
                  ...T.labelSmall,
                  fontSize: 12,
                  letterSpacing: 2.16,
                  color: C.gold,
                  marginLeft: 5,
                  marginTop: 2,
                }}
              >
                ME
              </Text>
            </View>
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
