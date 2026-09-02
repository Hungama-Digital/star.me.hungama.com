// src/starme/screens/SubscribeScreen.tsx  ·  Step 2 of 8 · Membership (guide sections 11 + 12)
import React from 'react';
import { Text, View } from 'react-native';
import { Stage, Eyebrow, ScreenHeading, Lead, SmallDim } from '../components';
import { MembershipPass } from '../components/MembershipPass';
import { StarPalette as C, radius, type as T } from '../theme';
import { welcomeCredits } from '../data/manifest';

function BenefitTile({ symbol, title, value }: { symbol: string; title: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.tile,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        paddingHorizontal: 9,
        paddingVertical: 14,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: 'rgba(217,30,54,0.16)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: C.gold, fontSize: 20, fontWeight: '700' }}>{symbol}</Text>
      </View>
      <View style={{ height: 10 }} />
      <Text style={{ color: C.text, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ color: C.dim, fontSize: 9, textAlign: 'center' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function SubscribeScreen() {
  return (
    <Stage>
      <Eyebrow>Step 1 · Membership</Eyebrow>
      <ScreenHeading>Your StarME Pass</ScreenHeading>
      <Lead>One pass. Every story. Your face in the spotlight.</Lead>

      <MembershipPass welcomeCredits={welcomeCredits} />

      <View style={{ height: 22 }} />
      <Text style={{ ...T.labelMedium, color: C.orange }}>YOUR PREMIERE KIT</Text>
      <View style={{ height: 12 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <BenefitTile symbol="▶" title="Every Drama" value="Full access" />
        <BenefitTile symbol="✦" title="Star Credits" value={`${welcomeCredits} ready`} />
        <BenefitTile symbol="↻" title="Free Retake" value="Once per story" />
      </View>

      <View style={{ height: 18 }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.row,
          backgroundColor: C.surface2,
          borderWidth: 1,
          borderColor: C.line,
          padding: 15,
        }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.good }} />
        <Text style={{ ...T.bodyMedium, color: C.text, marginLeft: 10, flex: 1 }}>
          Ready instantly after secure payment
        </Text>
      </View>

      <View style={{ height: 12 }} />
      <SmallDim>UPI, cards and major wallets accepted · Cancel anytime</SmallDim>
    </Stage>
  );
}
