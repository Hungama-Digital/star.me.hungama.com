// src/starme/screens/SubscribeScreen.tsx  ·  Step 1 · Feature yourself in a show
// Redesigned entry screen: StarME logo, the single live show's artwork, the
// "Unlock Episode 1" cost + wallet balance, and the Premiere Kit (Share / 12 Hours /
// More). The dock "Continue" advances the flow. FastTV-themed (dark, blue accent,
// gold coins).
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Stage, Coin } from '../components';
import { StarPalette as C, radius, type as T, Display, StarImages } from '../theme';
import { pkg, liveShells } from '../data/manifest';
import { useStarStore } from '../state/store';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function KitBox({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.tile,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        paddingHorizontal: 8,
        paddingVertical: 14,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(0,156,219,0.14)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcons name={icon} size={22} color={C.orange} />
      </View>
      <View style={{ height: 10 }} />
      <Text style={{ color: C.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: C.dim, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 3 }}>
        {sub}
      </Text>
    </View>
  );
}

const walletBox = {
  flex: 1,
  borderRadius: radius.row,
  backgroundColor: C.surface2,
  borderWidth: 1,
  borderColor: C.line,
  paddingHorizontal: 14,
  paddingVertical: 12,
} as const;

export default function SubscribeScreen() {
  const credits = useStarStore((s) => s.credits);
  const show = liveShells()[0];
  const keyart = show?.id === 'act' ? StarImages.actionKeyart : StarImages.loveKeyart;
  const unlockCost = pkg('cameo')?.credits ?? 60;

  return (
    <Stage>
      {/* Feature yourself in a show */}
      <Text style={{ ...T.headlineMedium, color: C.text, textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
        Feature yourself in a show
      </Text>

      {/* Show artwork */}
      <View
        style={{
          width: '100%',
          aspectRatio: 1.5,
          borderRadius: radius.world,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: C.surface,
        }}
      >
        <Image source={keyart} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
          <Text numberOfLines={1} style={{ fontFamily: Display, fontWeight: '800', fontSize: 22, color: '#FFFFFF' }}>
            {show?.title ?? 'Your drama'}
          </Text>
          {show?.kicker ? (
            <Text numberOfLines={1} style={{ ...T.bodySmall, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
              {show.kicker}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Unlock Episode 1 */}
      <Text style={{ ...T.titleMedium, color: C.text, marginTop: 18, marginBottom: 10 }}>Unlock Episode 1</Text>

      {/* Coins cost + Your balance */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={walletBox}>
          <Text style={{ ...T.labelSmall, color: C.dim }}>COINS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Coin size={20} />
            <Text style={{ fontFamily: Display, fontWeight: '800', fontSize: 22, color: C.text }}>{unlockCost}</Text>
          </View>
          <Text style={{ ...T.bodySmall, color: C.dim, marginTop: 2 }}>To unlock this episode</Text>
        </View>
        <View style={walletBox}>
          <Text style={{ ...T.labelSmall, color: C.dim }}>YOUR BALANCE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Coin size={20} />
            <Text style={{ fontFamily: Display, fontWeight: '800', fontSize: 22, color: C.gold }}>{credits}</Text>
          </View>
          <Text style={{ ...T.bodySmall, color: C.dim, marginTop: 2 }}>Available to spend</Text>
        </View>
      </View>

      {/* Your Premiere Kit */}
      <Text style={{ ...T.labelMedium, color: C.orange, marginTop: 22, marginBottom: 12 }}>YOUR PREMIERE KIT</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <KitBox icon="ios-share" title="Share" sub="With friends to get started" />
        <KitBox icon="schedule" title="12 Hours" sub="Quality episode, generated" />
        <KitBox icon="playlist-add" title="More" sub="Keep adding episodes" />
      </View>
    </Stage>
  );
}
