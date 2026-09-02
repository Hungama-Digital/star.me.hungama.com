// src/starme/screens/ConceptScreen.tsx  ·  Step 5 of 8 · Choose Your World (guide section 11)
import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stage, Eyebrow, ScreenHeading, Lead } from '../components';
import { StarPalette as C, radius, type as T, Display, StarImages } from '../theme';
import { useStarStore } from '../state/store';
import { manifest, isLive, shell as shellById, type ShellDef } from '../data/manifest';

const POSTER_OVERLAY = ['transparent', '#09090CF2'] as const; // ARGB #F209090C -> RN

const artFor = (s: ShellDef, index: number) =>
  s.id === 'love'
    ? StarImages.loveKeyart
    : s.id === 'act'
      ? StarImages.actionKeyart
      : index % 2 === 0
        ? StarImages.loveKeyart
        : StarImages.actionKeyart;

function WorldPoster({
  shell,
  index,
  selected,
  onPress,
}: {
  shell: ShellDef;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const live = isLive(shell);
  return (
    <Pressable
      disabled={!live}
      onPress={onPress}
      style={{
        width: 250,
        height: 390,
        borderRadius: radius.world,
        overflow: 'hidden',
        opacity: live ? 1 : 0.48,
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? C.orange : C.line,
      }}
    >
      <Image source={artFor(shell, index)} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient colors={POSTER_OVERLAY} style={StyleSheet.absoluteFill} />
      {!live ? (
        <View
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            backgroundColor: 'rgba(0,0,0,0.65)',
            borderRadius: 30,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>COMING SOON</Text>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 0, bottom: 0, padding: 18 }}>
        <Text style={{ color: C.gold, fontSize: 10, fontWeight: '700' }}>
          {shell.kicker.toUpperCase()}
        </Text>
        <Text
          style={{ fontFamily: Display, fontSize: 25, lineHeight: 28, color: '#fff' }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {shell.title}
        </Text>
        {live ? (
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 4 }}>
            TAP TO VIEW ROLES
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ConceptScreen() {
  const store = useStarStore();
  const { shellId, roleId } = store;
  const [sheetOpen, setSheetOpen] = useState(false);
  const selectedShell = shellById(shellId);

  const openShell = (s: ShellDef) => {
    if (shellId !== s.id) store.selectShell(s.id);
    setSheetOpen(true);
  };

  return (
    <Stage>
      <Eyebrow>Step 4 · Your Story</Eyebrow>
      <ScreenHeading>Choose Your World</ScreenHeading>
      <Lead>Swipe through original worlds. Tap a poster to step into the cast.</Lead>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {manifest.shells.map((s, i) => (
            <WorldPoster
              key={s.id}
              shell={s}
              index={i}
              selected={shellId === s.id}
              onPress={() => openShell(s)}
            />
          ))}
        </View>
      </ScrollView>

      {selectedShell ? (
        <View style={{ marginTop: 22 }}>
          <Text style={{ ...T.labelMedium, color: C.orange }}>CURRENT CASTING</Text>
          <Text style={{ ...T.headlineSmall, color: C.text, marginTop: 4 }}>{selectedShell.title}</Text>
          {roleId ? (
            <Text style={{ ...T.bodyMedium, color: C.good, marginTop: 4 }}>
              Your role is selected · tap the poster to change it
            </Text>
          ) : (
            <Text style={{ ...T.bodyMedium, color: C.dim, marginTop: 4 }}>
              Choose a role to continue
            </Text>
          )}
        </View>
      ) : null}

      <RoleSheet
        open={sheetOpen}
        shell={selectedShell}
        selectedRoleId={roleId}
        onChoose={(rid) => {
          store.selectRole(rid);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </Stage>
  );
}

function RoleSheet({
  open,
  shell,
  selectedRoleId,
  onChoose,
  onClose,
}: {
  open: boolean;
  shell: ShellDef | null;
  selectedRoleId: string | null;
  onChoose: (roleId: string) => void;
  onClose: () => void;
}) {
  const roles = shell?.roles ?? [];
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 20,
          paddingVertical: 8,
          maxHeight: '85%',
        }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 22, paddingTop: 8 }}>
          <Text style={{ ...T.headlineSmall, color: C.text }}>Choose Your Role</Text>
          <Text style={{ ...T.bodyMedium, color: C.dim, marginTop: 2 }}>
            {`Who will you become in ${shell?.title ?? ''}?`}
          </Text>
          <View style={{ height: 18 }} />
          {roles.map((r, idx) => {
            const selected = selectedRoleId === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => onChoose(r.id)}
                style={{
                  marginTop: idx === 0 ? 0 : 12,
                  borderRadius: radius.tile,
                  backgroundColor: selected ? C.surface2 : C.surface,
                  borderWidth: 2,
                  borderColor: selected ? C.orange : C.line,
                  padding: 18,
                }}
              >
                <Text style={{ ...T.titleMedium, color: C.text }}>{r.name}</Text>
                <Text style={{ ...T.bodySmall, color: C.dim, marginTop: 4 }}>{r.desc}</Text>
                <View
                  style={{
                    marginTop: 18,
                    alignSelf: 'center',
                    width: 220,
                    borderRadius: 30,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    backgroundColor: selected ? C.good : C.orange,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    {selected ? 'SELECTED' : 'CHOOSE ROLE'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
