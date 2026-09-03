// src/starme/screens/ConsentScreen.tsx  ·  Step 4 of 8 · Consent (guide section 11)
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Stage, Eyebrow, ScreenHeading, SmallDim, StarButton } from '../components';
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad';
import { StarPalette as C, radius, type as T } from '../theme';
import { useStarStore } from '../state/store';

const SECTIONS: { h: string; b: string }[] = [
  {
    h: 'WHAT YOU ARE AGREEING TO',
    b: 'You grant Hungama Digital Media Entertainment a licence to use the photo you provided and a face template derived from it, solely to create the personalised Micro Drama episodes you order on StarME, including your poster and trailer.',
  },
  {
    h: 'WHAT WE WILL NEVER DO',
    b: "We will not use your likeness in advertising, in other people's dramas or to train models, and we will never place any other person's face in your drama or your face in anyone else's without a separate verified consent from that person.",
  },
  {
    h: 'GENERATION PARTNER',
    b: "Rendering uses licensed third party generation technology. Your signed consent is recorded against every render, as required by our generation partner's norms for real-person likenesses.",
  },
  {
    h: 'YOUR CONTROLS',
    b: 'You can revoke this consent at any time in Settings. On revocation we stop new renders immediately and delete your photo and face template within 30 days. Delivered episodes you choose to keep remain yours.',
  },
  {
    h: 'PROVENANCE',
    b: 'Every episode carries content credentials and a watermark identifying it as AI personalised content, so your drama is always clearly yours and clearly crafted.',
  },
  {
    h: 'ELIGIBILITY',
    b: 'StarME is for adults. Our checks refuse any face assessed as under 18, with no manual override.',
  },
];

const CHECK_A = 'I confirm the photo is of me, I am 18 or older and I agree to the likeness licence above.';
const CHECK_B = 'I understand I can revoke consent anytime and my biometric data will be deleted within 30 days.';

function Checkbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? C.orange : C.line,
          backgroundColor: checked ? C.orange : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 12,
        }}
      >
        {checked ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>✓</Text> : null}
      </View>
      <Text style={{ ...T.bodyMedium, color: C.text, flex: 1, marginLeft: 12, paddingTop: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ConsentScreen() {
  const store = useStarStore();
  const { consentVersion, consentSubmitFailed, signed, consentRef, photoPath } = store;

  const [checkedA, setCheckedA] = useState(false);
  const [checkedB, setCheckedB] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const yB = useRef<number | null>(null);
  const ySig = useRef<number | null>(null);

  // Auto-scroll assistance (120ms delay).
  useEffect(() => {
    const t = setTimeout(() => {
      if (checkedA && !checkedB && yB.current != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, yB.current - 40), animated: true });
      } else if (checkedA && checkedB && !hasInk && ySig.current != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, ySig.current - 40), animated: true });
      }
    }, 120);
    return () => clearTimeout(t);
  }, [checkedA, checkedB, hasInk]);

  // Auto-submit: the moment both boxes are ticked and ink exists, rasterise + submit.
  useEffect(() => {
    if (checkedA && checkedB && hasInk) {
      sigRef.current?.capturePng().then((png) => {
        if (png) store.onConsentSigned(png, checkedA, checkedB);
      });
    } else {
      store.onSignatureCleared();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedA, checkedB, hasInk]);

  const retry = () => {
    sigRef.current?.capturePng().then((png) => {
      if (png) store.onConsentSigned(png, checkedA, checkedB);
    });
  };

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Stage ref={scrollRef}>
      <Eyebrow>Step 3 · Your consent, on record</Eyebrow>
      <ScreenHeading>Read, tick and sign</ScreenHeading>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Text style={{ ...T.bodyMedium, color: C.dim, flex: 1 }}>
          Plain language, no fine print. A signed copy stays in your consent ledger and travels with
          every render.
        </Text>
        {photoPath ? (
          <Image
            source={{ uri: photoPath }}
            style={{ width: 54, height: 66, borderRadius: radius.pill, borderWidth: 1, borderColor: C.line }}
            resizeMode="cover"
          />
        ) : null}
      </View>

      {consentVersion === null ? (
        <View
          style={{
            backgroundColor: 'rgba(229,72,77,0.10)',
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(229,72,77,0.5)',
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ ...T.bodySmall, color: C.text }}>
            Consent recording is paused until this server publishes an approved consent version.
          </Text>
        </View>
      ) : null}

      {/* Consent note */}
      <ScrollView
        nestedScrollEnabled
        style={{
          maxHeight: 230,
          backgroundColor: C.surface2,
          borderRadius: radius.note,
          borderWidth: 1,
          borderColor: C.line,
        }}
        contentContainerStyle={{ padding: 16 }}
      >
        {SECTIONS.map((s, i) => (
          <View key={s.h}>
            <Text
              style={{
                color: C.gold,
                fontWeight: '700',
                fontSize: 12,
                letterSpacing: 1.92,
                marginTop: i === 0 ? 0 : 12,
                marginBottom: 6,
              }}
            >
              {s.h}
            </Text>
            <Text style={{ ...T.bodySmall, color: C.consentInk, lineHeight: 20 }}>{s.b}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Checkboxes */}
      <View style={{ marginTop: 8 }}>
        <Checkbox checked={checkedA} onToggle={() => setCheckedA((v) => !v)} label={CHECK_A} />
        <View onLayout={(e) => (yB.current = e.nativeEvent.layout.y)}>
          <Checkbox checked={checkedB} onToggle={() => setCheckedB((v) => !v)} label={CHECK_B} />
        </View>
      </View>

      {/* Signature pad */}
      <View style={{ marginTop: 12 }} onLayout={(e) => (ySig.current = e.nativeEvent.layout.y)}>
        <Text style={{ color: C.dim, fontWeight: '700', fontSize: 11, letterSpacing: 1.54, marginBottom: 6 }}>
          SIGN WITH YOUR FINGER
        </Text>
        <SignaturePad ref={sigRef} onInkChange={setHasInk} enabled={checkedA && checkedB} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <SmallDim>{`Signed on ${today}`}</SmallDim>
          <Pressable onPress={() => sigRef.current?.clear()}>
            <Text style={{ ...T.bodySmall, fontWeight: '600', color: C.orange }}>Clear signature</Text>
          </Pressable>
        </View>
      </View>

      {/* Retry panel */}
      {consentSubmitFailed && !signed ? (
        <View
          style={{
            marginTop: 12,
            backgroundColor: 'rgba(229,72,77,0.10)',
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(229,72,77,0.5)',
            padding: 14,
          }}
        >
          <Text style={{ ...T.bodySmall, color: C.text }}>
            We couldn't reach StarME to record your consent. Your photo and signature are safe on this
            device.
          </Text>
          <View style={{ height: 10 }} />
          <StarButton label="Try Again" onPress={retry} />
        </View>
      ) : null}

      {/* Success ledger chip */}
      {signed && consentRef ? (
        <View
          style={{
            marginTop: 12,
            backgroundColor: 'rgba(42,157,143,0.08)',
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(42,157,143,0.35)',
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <Text style={{ ...T.bodySmall, color: '#BFE9CF' }}>
            {'✓ Signed copy saved to your consent ledger · Ref '}
            <Text style={{ fontWeight: '700', color: C.good }}>{consentRef}</Text>
          </Text>
        </View>
      ) : null}
    </Stage>
  );
}
