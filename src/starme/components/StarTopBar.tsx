// src/starme/components/StarTopBar.tsx  and  Coin
// Top bar: "STAR" in Anton 22 + "ME" in gold 12 with 0.18em tracking,
// subline "A FAST TV ORIGINAL" 8pt dim, and a wallet chip on the right
// that appears only when subscribed or credits > 0.
import React from 'react';
import { Text, View } from 'react-native';
import { StarPalette as C, radius, type as T, Display } from '../theme';

export const Coin = ({ size = 14 }: { size?: number }) => (
  // Radial gradient #FFE9B0 -> gold -> #8A6A24, approximated with a solid gold
  // disc and a lighter inner highlight offset toward the top-left.
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: C.gold,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <View
      style={{
        position: 'absolute',
        top: size * 0.12,
        left: size * 0.12,
        width: size * 0.5,
        height: size * 0.5,
        borderRadius: size * 0.25,
        backgroundColor: '#FFE9B0',
        opacity: 0.9,
      }}
    />
  </View>
);

export const StarTopBar = ({
  credits,
  walletVisible,
}: {
  credits: number;
  walletVisible: boolean;
}) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 10,
    }}
  >
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontFamily: Display, fontSize: 22, letterSpacing: 0.88, color: C.text }}>
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
      <Text style={{ ...T.labelSmall, fontSize: 8, letterSpacing: 1.44, color: C.dim }}>
        A FAST TV ORIGINAL
      </Text>
    </View>
    {walletVisible && (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: radius.round,
          backgroundColor: C.surface,
          borderWidth: 1,
          borderColor: C.line,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <Coin />
        <Text style={{ ...T.bodySmall, fontWeight: '600', color: C.text }}>{credits}</Text>
      </View>
    )}
  </View>
);
