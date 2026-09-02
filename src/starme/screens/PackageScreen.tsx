// src/starme/screens/PackageScreen.tsx  ·  Step 6 of 8 · Choose Your Package (guide section 11)
import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Stage, Eyebrow, ScreenHeading, Lead, SmallDim, Coin, StarButton } from '../components';
import { StarPalette as C, radius, type as T, Display } from '../theme';
import { useStarStore } from '../state/store';
import { manifest, pkg as pkgById, type PackageDef } from '../data/manifest';

function PackageRow({
  p,
  selected,
  onPress,
}: {
  p: PackageDef;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ marginBottom: 11 }}>
      {p.highlight ? (
        <Text
          style={{
            color: C.gold,
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 1.08,
            marginLeft: 4,
            marginBottom: 4,
          }}
        >
          MOST CHOSEN
        </Text>
      ) : null}
      <Pressable
        onPress={onPress}
        style={{
          borderRadius: radius.row,
          backgroundColor: selected ? C.surface2 : C.surface,
          borderWidth: 2,
          borderColor: selected ? C.orange : C.line,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <View style={{ width: 44, alignItems: 'center' }}>
          <Text style={{ fontFamily: Display, fontSize: 26, color: C.gold }}>{p.episodes}</Text>
          <Text style={{ color: C.dim, fontSize: 9, letterSpacing: 1.26 }}>
            {p.episodes === 1 ? 'EP' : 'EPS'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...T.titleMedium, color: C.text }}>{p.name}</Text>
          <Text style={{ ...T.bodySmall, color: C.dim }}>{p.desc}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Coin size={12} />
          <Text style={{ ...T.bodyMedium, fontWeight: '700', color: C.text }}>{p.credits}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export default function PackageScreen() {
  const store = useStarStore();
  const { packageId, credits } = store;
  const [preview, setPreview] = useState<PackageDef | null>(null);
  const selected = pkgById(packageId);

  return (
    <Stage>
      <Eyebrow>Step 5 · Your billing</Eyebrow>
      <ScreenHeading>How big is your debut?</ScreenHeading>
      <Lead>Every tier premieres with your poster and your name in the credits.</Lead>

      {manifest.packages.map((p) => (
        <PackageRow key={p.id} p={p} selected={packageId === p.id} onPress={() => setPreview(p)} />
      ))}

      {selected ? (
        <View style={{ marginTop: 4 }}>
          <SmallDim>
            {credits >= selected.credits
              ? `Covered by your credit balance of ${credits}.`
              : `You have ${credits} credits. Top up the balance to confirm.`}
          </SmallDim>
        </View>
      ) : null}

      <PreviewSheet
        p={preview}
        onChoose={(id) => {
          store.selectPackage(id);
          setPreview(null);
        }}
        onClose={() => setPreview(null)}
      />
    </Stage>
  );
}

function PreviewSheet({
  p,
  onChoose,
  onClose,
}: {
  p: PackageDef | null;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!p} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 22,
          paddingVertical: 8,
        }}
      >
        {p ? (
          <View style={{ paddingBottom: 26, paddingTop: 8 }}>
            <Text style={{ ...T.headlineSmall, color: C.text }}>{p.name}</Text>
            <Text style={{ ...T.bodyMedium, color: C.dim, marginTop: 4 }}>{p.desc}</Text>
            <View style={{ height: 20 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...T.bodyLarge, fontWeight: '700', color: C.text }}>
                {`${p.episodes} Episodes`}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Coin size={14} />
                <Text style={{ ...T.bodyLarge, fontWeight: '700', color: C.text }}>
                  {`  ${p.credits} Credits`}
                </Text>
              </View>
            </View>
            <View style={{ height: 22 }} />
            <StarButton label={`Choose ${p.name}`} onPress={() => onChoose(p.id)} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
