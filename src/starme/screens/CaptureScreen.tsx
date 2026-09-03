// src/starme/screens/CaptureScreen.tsx  ·  Step 3 of 8 · Your Close-Up (guide section 11)
// Camera + picker note: "Upload Photo" uses expo-image-picker (gallery). "Take Selfie"
// uses the custom full-screen CameraCapture sheet (expo-camera).
// Layout follows the "hero face + dual CTA" mockup but is themed to FastTV (black bg,
// #009CDB accent, white primary CTA — no crimson/gradient): centered header, a large
// circular face-capture hero with a rotating accent "scanning" ring, an avatar
// social-proof row, a white primary CTA and a ghost secondary CTA.
// Two mockup states, FastTV-themed: a full-screen "casting you in" loader while face
// detection runs (store.verifying), and a "no face" retry modal on failure (verifyError).
// All prior functionality is retained (picker, camera-permission flow, name field with
// keyboard-lift + validation, verify rows, identity card, camera modal).
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stage, SmallDim, StarCard } from '../components';
import { CameraCapture } from '../components/CameraCapture';
import { StarPalette as C, radius, type as T, StarImages } from '../theme';
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
            backgroundColor: row.state === 'PASSED' ? 'rgba(52,199,89,0.12)' : 'transparent',
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

// Big circular face-capture hero: deep-magenta donut with a continuously rotating
// dashed "scanning" ring, and a warm disc that the chosen photo fills once selected.
const HERO = 190; // outer donut diameter
const RING = 168; // rotating dashed ring
const DISC = 142; // photo / face disc
function FaceHero({ photoPath }: { photoPath: string | null }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const rot = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }),
    );
    const pul = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    rot.start();
    pul.start();
    return () => {
      rot.stop();
      pul.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 2 }}>
      <View
        style={{
          width: HERO,
          height: HERO,
          borderRadius: HERO / 2,
          backgroundColor: '#0A1A22', // FastTV dark accent-tinted donut
          borderWidth: 1,
          borderColor: 'rgba(0,156,219,0.25)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Rotating dashed ring (own layer so only the dashes spin, not the photo) */}
        <Animated.View
          style={{
            position: 'absolute',
            top: (HERO - RING) / 2,
            left: (HERO - RING) / 2,
            width: RING,
            height: RING,
            borderRadius: RING / 2,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: 'rgba(0,156,219,0.85)', // accent/primary
            transform: [{ rotate }],
          }}
        />
        {/* Photo / face disc, gently pulsing */}
        <Animated.View
          style={{
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.surface,
            transform: [{ scale }],
          }}
        >
          {photoPath ? (
            <Image source={{ uri: photoPath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={['#12303D', '#0A1B24']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}
            >
              <MaterialCommunityIcons name="face-recognition" size={64} color="#33B5E6" />
            </LinearGradient>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// "People already cast" social-proof row: overlapping avatar discs + count + rating.
// NOTE: avatars are generated placeholders (no thumbnails in the repo); 726K / 4.9
// are demo placeholder values from the mockup.
const AVATARS = ['#C08457', '#8E6BB0', '#5A7FB0', '#B05F7A'];
function PeopleCast() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {AVATARS.map((bg, i) => (
          <View
            key={i}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: bg,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: C.bg,
              marginLeft: i === 0 ? 0 : -10,
            }}
          >
            <MaterialCommunityIcons name="account" size={18} color="rgba(255,255,255,0.9)" />
          </View>
        ))}
      </View>
      <Text style={{ ...T.bodySmall, color: C.dim }}>
        <Text style={{ color: C.text, fontWeight: '700' }}>726K</Text> people already cast
        {'  ·  '}
        <Text style={{ color: C.text, fontWeight: '700' }}>4.9</Text>
        <Text style={{ color: C.gold }}> ★</Text>
      </Text>
    </View>
  );
}

// Full-width pill CTAs, FastTV theme: white primary + translucent ghost.
type CtaIcon = React.ComponentProps<typeof MaterialIcons>['name'];
function PrimaryCta({ icon, label, onPress, style }: { icon: CtaIcon; label: string; onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 54,
        borderRadius: radius.cta,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 12,
        ...style,
      }}
    >
      <MaterialIcons name={icon} size={20} color="#111214" />
      <Text style={{ ...T.labelLarge, color: '#111214' }}>{label}</Text>
    </Pressable>
  );
}

function GhostCta({ icon, label, onPress, style }: { icon: CtaIcon; label: string; onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 54,
        borderRadius: radius.cta,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.06)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 12,
        ...style,
      }}
    >
      <MaterialIcons name={icon} size={20} color={C.text} />
      <Text style={{ ...T.labelLarge, color: C.text }}>{label}</Text>
    </Pressable>
  );
}

// Status lines cycled under the loader while face detection runs.
const CASTING_STEPS = [
  'Uploading to the cloud',
  'Scanning your close-up',
  'Checking for a clear face',
  'Locking in your look',
];

// FastTV "casting you in" loader (mockup similar-not-copy): full-screen black overlay,
// accent eyebrow, a big track ring with a rotating accent arc, STAR ME wordmark, and a
// status line that cycles through CASTING_STEPS.
function CastingLoader({ visible }: { visible: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const [stepIdx, setStepIdx] = React.useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    const a = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    a.start();
    return () => a.stop();
  }, [visible, spin]);
  // Advance the status line every 1.2s while visible; reset when it opens.
  useEffect(() => {
    if (!visible) {
      setStepIdx(0);
      return;
    }
    const id = setInterval(() => setStepIdx((i) => (i + 1) % CASTING_STEPS.length), 1200);
    return () => clearInterval(id);
  }, [visible]);
  // Small cross-fade each time the line changes.
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [stepIdx, fade]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const R = 220;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ ...T.labelSmall, color: C.orange, letterSpacing: 2.4, marginBottom: 28 }}>
          CASTING YOU IN
        </Text>
      <View style={{ width: R, height: R, alignItems: 'center', justifyContent: 'center' }}>
        {/* track */}
        <View
          style={{
            position: 'absolute',
            width: R,
            height: R,
            borderRadius: R / 2,
            borderWidth: 3,
            borderColor: 'rgba(0,156,219,0.18)',
          }}
        />
        {/* rotating accent arc */}
        <Animated.View
          style={{
            position: 'absolute',
            width: R,
            height: R,
            borderRadius: R / 2,
            borderWidth: 3,
            borderColor: 'transparent',
            borderTopColor: C.orange,
            borderRightColor: C.orange,
            transform: [{ rotate }],
          }}
        />
        <Image
          source={StarImages.logo}
          style={{ width: 150, height: 166 }}
          resizeMode="contain"
          accessibilityLabel="StarME"
        />
      </View>
        <Animated.Text style={{ ...T.titleLarge, color: C.text, marginTop: 28, opacity: fade }}>
          {CASTING_STEPS[stepIdx]}
        </Animated.Text>
      </View>
    </Modal>
  );
}

// FastTV "no face" retry modal (mockup similar-not-copy): two accent icons
// (no-image -> face-scan), headline, guidance, Cancel (ghost) + Try Again (white).
function NoFaceModal({
  visible,
  message,
  onCancel,
  onTryAgain,
}: {
  visible: boolean;
  message: string;
  onCancel: () => void;
  onTryAgain: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View
          style={{
            backgroundColor: C.surface,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: C.line,
            padding: 24,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={iconCircle}>
                <MaterialIcons name="image-not-supported" size={30} color={C.orange} />
              </View>
              <Text style={{ ...T.labelSmall, color: C.orange }}>NO FACE FOUND</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={22} color={C.dim} />
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={[iconCircle, { backgroundColor: 'rgba(0,156,219,0.18)', borderColor: 'rgba(0,156,219,0.5)' }]}>
                <MaterialCommunityIcons name="face-recognition" size={30} color={C.orange} />
              </View>
              <Text style={{ ...T.labelSmall, color: C.orange }}>LIKE THIS</Text>
            </View>
          </View>
          <Text style={{ ...T.headlineMedium, color: C.text, textAlign: 'center', marginBottom: 8 }}>
            We couldn't see your face
          </Text>
          <Text style={{ ...T.bodyMedium, color: C.dim, textAlign: 'center', marginBottom: 22 }}>
            {message || 'Use a clear, well-lit photo with only your face — centered, looking forward, no sunglasses or hats.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={{
                flex: 1,
                minHeight: 54,
                borderRadius: radius.cta,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ ...T.labelLarge, color: C.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onTryAgain}
              accessibilityRole="button"
              style={{
                flex: 1,
                minHeight: 54,
                borderRadius: radius.cta,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ ...T.labelLarge, color: '#111214' }}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const iconCircle = {
  width: 68,
  height: 68,
  borderRadius: 34,
  borderWidth: 1,
  borderColor: 'rgba(0,156,219,0.35)',
  backgroundColor: 'rgba(0,156,219,0.1)',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export default function CaptureScreen() {
  const store = useStarStore();
  const { photoPath, name, verified, verifyRows, verifyError, verifying, identityAssetState } = store;
  const nameRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const nameY = useRef(0);
  const [camHint, setCamHint] = React.useState(false);
  // The "no face" retry modal opens whenever verification reports an error, and is
  // locally dismissable (verifyError itself stays for the inline row states).
  const [showNoFace, setShowNoFace] = React.useState(false);
  useEffect(() => {
    if (verifyError) setShowNoFace(true);
  }, [verifyError]);

  // Keyboard opens only on tap; when it does, lift the name field above the keyboard.
  const scrollNameIntoView = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, nameY.current - 24), animated: true }), 120);
  };
  const [showCamera, setShowCamera] = React.useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  // The keyboard opens only when the user taps the name field (no auto-focus).

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
    <Stage ref={scrollRef}>
      {/* eyebrow + heading + lead (centered, mockup layout; original copy kept) */}
      <Text style={{ ...T.labelSmall, color: C.orange, textAlign: 'center', marginBottom: 8 }}>
        STEP 2 · YOUR CLOSE-UP
      </Text>
      <Text style={{ ...T.headlineMedium, color: C.text, textAlign: 'center', marginBottom: 6 }}>
        Let's see the star
      </Text>
      <Text style={{ ...T.bodyMedium, color: C.dim, textAlign: 'center', marginBottom: 2, paddingHorizontal: 8 }}>
        One clear, front-facing photo in even light. This is the face we cast, so make it a good one.
      </Text>

      {/* Circular face-capture hero (photo fills it once chosen), with rotating ring */}
      <FaceHero photoPath={photoPath} />

      {/* People-already-cast social-proof row (avatar cluster + count + rating) */}
      <PeopleCast />

      {/* Primary (white) = pick from library · Secondary (ghost) = take selfie — one row */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
        <PrimaryCta icon="photo-library" label="Upload Photo" onPress={pickFromLibrary} style={{ flex: 1 }} />
        <GhostCta icon="photo-camera" label="Take Selfie" onPress={takeSelfie} style={{ flex: 1 }} />
      </View>

      {camHint ? (
        <Text style={{ ...T.bodySmall, color: C.gold, marginTop: 8, textAlign: 'center' }}>
          Allow camera access to take your private close-up. You can also upload a photo.
        </Text>
      ) : null}

      {/* Name field */}
      <View onLayout={(e) => (nameY.current = e.nativeEvent.layout.y)}>
        <Text
          style={{
            color: C.dim,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: 1.54,
            marginTop: 22,
            marginBottom: 6,
          }}
        >
          YOUR NAME, AS IT APPEARS IN THE CREDITS
        </Text>
        <TextInput
          ref={nameRef}
          value={name}
          onChangeText={store.onNameChanged}
          onFocus={scrollNameIntoView}
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
      </View>

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

      {/* A little scroll room so the name field can lift above the keyboard when focused. */}
      <View style={{ height: 40 }} />

      <CameraCapture
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCaptured={(uri) => store.onPhotoSelected(uri)}
      />

      {/* Full-screen loader while face detection runs */}
      <CastingLoader visible={verifying} />

      {/* "No face" retry modal on verification failure. Both actions clear the
          rejected photo from view and return to the capture screen (Try Again
          behaves like Cancel — the user re-picks with Upload Photo / Take Selfie). */}
      <NoFaceModal
        visible={showNoFace && !!verifyError && !verifying}
        message={verifyError ?? ''}
        onCancel={() => {
          setShowNoFace(false);
          store.resetPhoto();
        }}
        onTryAgain={() => {
          setShowNoFace(false);
          store.resetPhoto();
        }}
      />
    </Stage>
  );
}
