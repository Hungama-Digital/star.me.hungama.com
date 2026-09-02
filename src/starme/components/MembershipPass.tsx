// src/starme/components/MembershipPass.tsx  (guide section 12.2)
// Full width, height 242, radius 26. Gradient #6E0C21 -> orange -> #28101E,
// 1px gold@55% border, decorative 112 ring top-right (18px white@6% border).
import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StarPalette as C, radius, type as T, Display } from '../theme';

export function MembershipPass({ welcomeCredits }: { welcomeCredits: number }) {
  return (
    <LinearGradient
      colors={['#6E0C21', C.orange, '#28101E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        height: 242,
        borderRadius: radius.pass,
        borderWidth: 1,
        borderColor: 'rgba(212,175,55,0.55)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 18,
          right: 20,
          width: 112,
          height: 112,
          borderRadius: 56,
          borderWidth: 18,
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      />
      <View style={{ flex: 1, padding: 22, justifyContent: 'space-between' }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <View>
            <Text style={{ fontFamily: Display, fontSize: 32, letterSpacing: 0.96, color: '#fff' }}>
              STAR ME
            </Text>
            <Text style={{ color: C.gold, fontSize: 10, fontWeight: '700' }}>FAST TV MEMBER</Text>
          </View>
          <Text
            style={{
              color: '#fff',
              fontSize: 10,
              fontWeight: '700',
              overflow: 'hidden',
              backgroundColor: 'rgba(0,0,0,0.25)',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            ANNUAL
          </Text>
        </View>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}
        >
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>WELCOME BALANCE</Text>
            <Text style={{ ...T.titleLarge, color: '#fff', fontWeight: '700' }}>
              {`${welcomeCredits} CREDITS`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: Display, fontSize: 36, color: '#fff' }}>₹499</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>PER YEAR</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}
