// src/starme/screens/CaptureScreen.tsx  ·  Step 3 of 8 · Your Close-Up (guide section 11)
// Camera + picker note: "Upload Photo" uses expo-image-picker (gallery). "Take Selfie"
// uses the OS front camera via expo-image-picker as a Phase 4 interim; Phase 5 replaces
// it with the spec's custom full-screen CameraCapture sheet (oval guide, shutter geometry).
import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Stage, SmallDim, StarCard } from '../components';
import { CameraCapture } from '../components/CameraCapture';
import { StarPalette as C, radius, type as T } from '../theme';
import { useStarStore } from '../state/store';
import type { IdentityAssetState, VerifyRow, VerifyState } from '../state/types';

const STATUS_TEXT: Record<VerifyState, string> = {
  WAITING: 'Waiting',
  CHECKING: 'Checking',
  PASSED: 'Passed',
  FAILED: 'Retake',
};
const borderFor = (s: VerifyState) =>
  s === 'PASSED' ? C.good : s === 'FAILED' ? C.danger : s === 'CHECKING' ? C.orange : C.line;
const statusColorFor = (s: VerifyState) => (s === 'PASSED' ? C.good : s === 'FAILED' ? C.danger : C.dim);

const IDENTITY_CARD: Record<IdentityAssetState, { title: string; detail: string; color: string }> = {
  LOCAL_CHECKS_PENDING: { title: 'Checking photo', detail: 'Local checks are still running.', color: C.dim },
  STAGING_LOCAL_ONLY: {
    title: 'Local staging check complete',
    detail: 'Your photo stays on this device. No face asset is uploaded in this test build.',
    color: C.good,
  },
  AWAITING_LIVENESS: {
    title: 'Identity activation required',
    detail: 'Complete the secure provider verification before your photo can be prepared for casting.',
    color: C.gold,
  },
  UPLOADING: { title: 'Preparing securely', detail: 'Uploading your authorized portrait.', color: C.gold },
  PROCESSING: { title: 'Preparing securely', detail: 'Provider checks are processing.', color: C.gold },
  ACTIVE: { title: 'Casting identity ready', detail: 'Your authorized face asset is active.', color: C.good },
  FAILED: { title: 'Preparation needs attention', detail: 'Try identity preparation again.', color: C.danger },
};

function VerifyRowView({ row, last }: { row: VerifyRow; last: boolean }) {
  const border = borderFor(row.state);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: border,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: row.state === 'PASSED' ? 'rgba(42,157,143,0.12)' : 'transparent',
          }}
        >
          {row.state === 'PASSED' ? (
            <Text style={{ color: C.good, fontSize: 11, fontWeight: '700' }}>✓</Text>
          ) : null}
        </View>
        <Text style={{ ...T.bodyMedium, color: C.text, flex: 1, marginLeft: 12 }}>{row.label}</Text>
        <Text style={{ ...T.labelSmall, color: statusColorFor(row.state) }}>
          {STATUS_TEXT[row.state].toUpperCase()}
        </Text>
      </View>
      {!last ? <View style={{ height: 1, backgroundColor: C.line, opacity: 0.6 }} /> : null}
    </View>
  );
}

function CapturePill({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: radius.pill,
        backgroundColor: C.surface2,
        borderWidth: 1,
        borderColor: C.line,
        paddingVertical: 13,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <MaterialIcons name={icon} size={20} color={C.orange} />
      <Text style={{ ...T.bodySmall, fontWeight: '600', color: C.text }}>{label}</Text>
    </Pressable>
  );
}

export default function CaptureScreen() {
  const store = useStarStore();
  const { photoPath, name, verified, verifyRows, verifyError, identityAssetState } = store;
  const nameRef = useRef<TextInput>(null);
  const [camHint, setCamHint] = React.useState(false);
  const [showCamera, setShowCamera] = React.useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  // After a photo arrives, focus the name field and raise the keyboard (both paths).
  useEffect(() => {
    if (photoPath) {
      const t = setTimeout(() => nameRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [photoPath]);

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) store.onPhotoSelected(res.assets[0].uri);
  };

  const takeSelfie = async () => {
    if (camPerm?.granted) {
      setCamHint(false);
      setShowCamera(true);
      return;
    }
    const res = await requestCamPerm();
    if (res.granted) {
      setCamHint(false);
      setShowCamera(true); // open the sheet automatically once the permission arrives
    } else {
      setCamHint(true);
    }
  };

  const nameError = !!photoPath && name.trim().length === 0;
  const idCard = IDENTITY_CARD[identityAssetState];

  return (
    <Stage>
      {/* eyebrow + heading + lead */}
      <Text style={{ ...T.labelSmall, color: C.orange, marginBottom: 12 }}>STEP 2 · YOUR CLOSE-UP</Text>
      <Text style={{ ...T.headlineMedium, color: C.text, marginBottom: 6 }}>Let's see the star</Text>
      <Text style={{ ...T.bodyMedium, color: C.dim, marginBottom: 18 }}>
        One clear, front-facing photo in even light. This is the face we cast, so make it a good one.
      </Text>

      {/* Capture frame */}
      <View
        style={{
          width: '100%',
          aspectRatio: 3 / 4,
          borderRadius: radius.card,
          backgroundColor: C.surface,
          borderWidth: 1,
          borderColor: '#4A3F60',
          overflow: 'hidden',
        }}
      >
        {photoPath ? (
          <Image source={{ uri: photoPath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: '72%',
              aspectRatio: 0.75,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: C.gold,
              opacity: photoPath ? 0.35 : 0.7,
            }}
          />
        </View>
        {!photoPath ? (
          <Text
            style={{
              ...T.bodySmall,
              color: C.dim,
              position: 'absolute',
              bottom: 12,
              alignSelf: 'center',
            }}
          >
            Face inside the ring · no sunglasses · no filters
          </Text>
        ) : null}
      </View>

      {/* Capture pills */}
      <View style={{ height: 14 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <CapturePill icon="photo-camera" label="Take Selfie" onPress={takeSelfie} />
        <CapturePill icon="add-a-photo" label="Upload Photo" onPress={pickFromLibrary} />
      </View>
      {camHint ? (
        <Text style={{ ...T.bodySmall, color: C.gold, marginTop: 8 }}>
          Allow camera access to take your private close-up. You can also upload a photo.
        </Text>
      ) : null}

      {/* Name field */}
      <Text
        style={{
          color: C.dim,
          fontWeight: '700',
          fontSize: 11,
          letterSpacing: 1.54,
          marginTop: 16,
          marginBottom: 6,
        }}
      >
        YOUR NAME, AS IT APPEARS IN THE CREDITS
      </Text>
      <TextInput
        ref={nameRef}
        value={name}
        onChangeText={store.onNameChanged}
        placeholder="Example - Aarav Mehta"
        placeholderTextColor={C.dim}
        autoCapitalize="words"
        returnKeyType="done"
        maxLength={28}
        cursorColor={C.orange}
        style={{
          borderWidth: 1,
          borderColor: nameError ? C.danger : C.line,
          borderRadius: radius.pill,
          backgroundColor: C.surface2,
          color: C.text,
          paddingHorizontal: 14,
          paddingVertical: 12,
          ...T.bodyLarge,
        }}
      />
      <Text style={{ ...T.bodySmall, color: nameError ? C.danger : C.dim, marginTop: 6 }}>
        Required for your on-screen credits
      </Text>

      {/* Verification card */}
      {photoPath ? (
        <View style={{ marginTop: 16 }}>
          <StarCard>
            {verifyRows.map((row, i) => (
              <VerifyRowView key={row.label} row={row} last={i === verifyRows.length - 1} />
            ))}
          </StarCard>
        </View>
      ) : null}

      {/* verify error */}
      {verifyError ? (
        <Text style={{ ...T.bodySmall, color: C.warn, marginTop: 10 }}>{verifyError}</Text>
      ) : null}

      {/* identity preparation card */}
      {verified ? (
        <View style={{ marginTop: 10 }}>
          <StarCard>
            <Text style={{ ...T.titleMedium, color: idCard.color }}>{idCard.title}</Text>
            <Text style={{ ...T.bodySmall, color: C.dim, marginTop: 4 }}>{idCard.detail}</Text>
          </StarCard>
        </View>
      ) : null}

      <View style={{ height: 12 }} />
      <SmallDim>
        StarME casts you and only you. A drama starring anyone else needs their own verified selfie
        and signed consent on their own device.
      </SmallDim>

      <CameraCapture
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCaptured={(uri) => store.onPhotoSelected(uri)}
      />
    </Stage>
  );
}
