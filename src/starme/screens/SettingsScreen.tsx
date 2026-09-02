// src/starme/screens/SettingsScreen.tsx  ·  Off-flow · Profile tab (guide section 13.3)
import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Stage, Eyebrow, ScreenHeading, Lead, SmallDim, StarCard, StarButton } from '../components';
import { StarPalette as C, type as T } from '../theme';
import { useStarStore } from '../state/store';
import { starBack } from '../nav/navRef';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
      <Text style={{ ...T.bodyMedium, color: C.dim }}>{label}</Text>
      <Text style={{ ...T.bodyMedium, fontWeight: '600', color: C.text }}>{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const store = useStarStore();
  const { name, consentRef } = store;

  const confirmRevoke = () => {
    Alert.alert(
      'Revoke consent?',
      'This stops new renders and deletes your photo and face template. You can subscribe and re-consent anytime. This cannot be undone.',
      [
        { text: 'Keep consent', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => store.revokeConsent(() => starBack()) },
      ],
    );
  };

  return (
    <Stage>
      <Pressable onPress={starBack} style={{ paddingBottom: 10 }}>
        <Text style={{ ...T.bodyMedium, color: C.dim }}>← Back</Text>
      </Pressable>
      <Eyebrow>Settings</Eyebrow>
      <ScreenHeading>Your likeness & consent</ScreenHeading>
      <Lead>StarME casts you and only you. You are always in control of your face and your data.</Lead>

      {consentRef ? (
        <>
          <StarCard>
            <Row label="Star name" value={name || 'Not set'} />
            <View style={{ height: 10 }} />
            <Row label="Consent ref" value={consentRef} />
            <View style={{ height: 10 }} />
            <Row label="Status" value="Active" />
          </StarCard>

          <View style={{ height: 18 }} />
          <Text style={{ ...T.titleMedium, fontWeight: '600', color: C.text }}>Revoke consent</Text>
          <View style={{ height: 6 }} />
          <SmallDim>
            On revocation we stop any new renders immediately and delete your photo and face template
            within 30 days. Episodes you have already saved remain yours. Your consent record is kept
            for audit, without the biometric files.
          </SmallDim>
          <View style={{ height: 14 }} />
          <StarButton
            label="Revoke Consent & Delete My Biometrics"
            variant="GHOST"
            onPress={confirmRevoke}
          />
        </>
      ) : (
        <StarCard>
          <Text style={{ ...T.bodyMedium, color: C.text }}>No active consent on record.</Text>
          <View style={{ height: 6 }} />
          <SmallDim>Start a debut to add a signed consent and identity.</SmallDim>
        </StarCard>
      )}
    </Stage>
  );
}
