// src/starme/screens/_Gallery.tsx
// DEV-ONLY Phase 1 checkpoint. A visual gallery of every StarME design token
// and shared component so the theme can be eyeballed before the flow is built.
// Not part of the shipping flow; remove or hide once Phase 3 mounts StarNavigator.
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppBackdrop,
  StarImages,
  StarPalette as C,
  radius,
  type as T,
} from '../theme';
import {
  CheckLine,
  Coin,
  CtaDock,
  Eyebrow,
  Lead,
  ScreenHeading,
  SmallDim,
  StarButton,
  StarCard,
  StarStepper,
  StarTopBar,
} from '../components';
import { Image } from 'react-native';

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    style={{
      ...T.labelSmall,
      color: C.gold,
      marginTop: 26,
      marginBottom: 12,
    }}
  >
    {children.toUpperCase()}
  </Text>
);

const Swatch = ({ name, hex }: { name: string; hex: string }) => (
  <View style={{ width: '31%', marginBottom: 12 }}>
    <View
      style={{
        height: 54,
        borderRadius: radius.pill,
        backgroundColor: hex,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    />
    <Text style={{ ...T.bodySmall, color: C.text, marginTop: 4 }}>{name}</Text>
    <Text style={{ ...T.bodySmall, color: C.dim, fontSize: 10 }}>{hex}</Text>
  </View>
);

const TypeRow = ({ styleKey }: { styleKey: keyof typeof T }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={{ ...T.bodySmall, color: C.dim, fontSize: 10 }}>{styleKey}</Text>
    <Text style={{ ...(T[styleKey] as object), color: C.text }}>
      The five boxing wizards
    </Text>
  </View>
);

export default function StarMeGallery() {
  const colorKeys = Object.keys(C) as (keyof typeof C)[];
  const typeKeys = Object.keys(T) as (keyof typeof T)[];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient
        colors={AppBackdrop.colors}
        locations={AppBackdrop.locations}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Top bar (wallet hidden vs shown) */}
        <StarTopBar credits={200} walletVisible={false} />
        <StarTopBar credits={200} walletVisible={true} />

        {/* Stepper at a few indices */}
        <StarStepper current={null} />
        <StarStepper current={0} />
        <StarStepper current={3} />
        <StarStepper current={7} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          <SectionLabel>Text primitives</SectionLabel>
          <Eyebrow>Step 4 · Your Story</Eyebrow>
          <ScreenHeading>Choose Your World</ScreenHeading>
          <Lead>Swipe through original worlds. Tap a poster to step into the cast.</Lead>
          <SmallDim>UPI, cards and major wallets accepted · Cancel anytime</SmallDim>
          <View style={{ height: 10 }} />
          <CheckLine>Native camera capture and protected identity checks</CheckLine>
          <CheckLine>Approve your first look before the final premiere</CheckLine>
          <CheckLine>Download episodes and share through Android</CheckLine>

          <SectionLabel>StarButton variants</SectionLabel>
          <View style={{ gap: 12 }}>
            <StarButton label="Start Your Debut" variant="PRIMARY" onPress={() => {}} />
            <StarButton label="Save Poster" variant="GOLD" onPress={() => {}} />
            <StarButton label="Share Trailer" variant="GHOST" onPress={() => {}} />
            <StarButton
              label="Add Your Photo And Name"
              variant="PRIMARY"
              enabled={false}
              onPress={() => {}}
            />
          </View>

          <SectionLabel>StarCard</SectionLabel>
          <StarCard>
            <Text style={{ ...T.titleMedium, color: C.text }}>Casting identity ready</Text>
            <Text style={{ ...T.bodySmall, color: C.dim, marginTop: 4 }}>
              Your authorized face asset is active.
            </Text>
          </StarCard>

          <SectionLabel>Coin</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Coin size={14} />
            <Coin size={24} />
            <Coin size={40} />
          </View>

          <SectionLabel>Palette</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {colorKeys.map((k) => (
              <Swatch key={k} name={k} hex={C[k]} />
            ))}
          </View>

          <SectionLabel>Type scale (Anton + Inter)</SectionLabel>
          {typeKeys.map((k) => (
            <TypeRow key={k} styleKey={k} />
          ))}

          <SectionLabel>Bundled keyart</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Image
              source={StarImages.loveKeyart}
              style={{ width: 120, height: 170, borderRadius: radius.tile }}
              resizeMode="cover"
            />
            <Image
              source={StarImages.actionKeyart}
              style={{ width: 120, height: 170, borderRadius: radius.tile }}
              resizeMode="cover"
            />
          </View>
        </ScrollView>

        {/* CTA dock preview */}
        <CtaDock label="Continue To Consent" enabled onPress={() => {}} />
      </SafeAreaView>
    </View>
  );
}
