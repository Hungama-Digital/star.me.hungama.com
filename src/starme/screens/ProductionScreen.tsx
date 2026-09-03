// src/starme/screens/ProductionScreen.tsx  ·  Step 7 of 8 · In Production (guide section 11)
// Note: the premiere notification (effect 1) is scheduled in Phase 5 (notifee/expo-notifications).
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stage, Eyebrow, ScreenHeading, Lead, CheckLine, StarCard, StarButton } from '../components';
import { StarPalette as C, radius, type as T, Display } from '../theme';
import { useStarStore } from '../state/store';
import { pkg as pkgById, shell as shellById } from '../data/manifest';
import { schedulePremiereNotification } from '../services/notifications';

const START_SECONDS = 12 * 3600 - 1; // 11:59:59

const two = (n: number) => String(n).padStart(2, '0');
const hms = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${two(h)}:${two(m)}:${two(s)}`;
};

export default function ProductionScreen() {
  const store = useStarStore();
  const {
    orderId,
    remoteOrderId,
    awaitingFirstLook,
    rendering,
    renderComplete,
    renderProgress,
    renderStageLabel,
    consentRef,
    name,
    shellId,
    packageId,
  } = store;

  const [countdown, setCountdown] = useState(START_SECONDS);

  // Effect 1: schedule the premiere notification once, keyed on the order.
  useEffect(() => {
    if (!orderId) return;
    schedulePremiereNotification(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Effect 2: auto-advance poll every 2500ms while an order exists and we are
  // neither awaiting a first look nor complete.
  useEffect(() => {
    if (!remoteOrderId || awaitingFirstLook || renderComplete) return;
    const id = setInterval(() => {
      store.pollProductionStatus();
    }, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteOrderId, awaitingFirstLook, renderComplete]);

  // Effect 3: countdown ticks every second while not rendering.
  useEffect(() => {
    if (rendering) return;
    const id = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [rendering]);

  const p = pkgById(packageId);
  const sh = shellById(shellId);
  const showCountdown = !awaitingFirstLook && !rendering && !renderComplete;
  const showProgress = rendering || renderComplete;

  return (
    <Stage>
      <Eyebrow>In production</Eyebrow>
      <ScreenHeading>{rendering ? 'Rolling.' : 'Lights. Camera. You.'}</ScreenHeading>
      <Lead>
        {rendering
          ? 'Fast-forwarding twelve hours for the demo. This is the pipeline your subscribers never see.'
          : 'Our studio is directing your drama now. We will notify you the moment it premieres.'}
      </Lead>

      <StarCard>
        {awaitingFirstLook ? (
          <View>
            <Text style={{ ...T.bodyMedium, color: C.text, textAlign: 'center' }}>
              Your protected first look is ready. Approve it to release the three-episode render, or
              retake your identity capture.
            </Text>
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StarButton
                label="Retake"
                variant="GHOST"
                style={{ flex: 1 }}
                onPress={() => store.requestRetake()}
              />
              <StarButton
                label="Approve"
                variant="PRIMARY"
                style={{ flex: 1 }}
                onPress={() => store.approveFirstLook()}
              />
            </View>
          </View>
        ) : showCountdown ? (
          <View style={{ alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{
                fontFamily: Display,
                fontSize: 46,
                fontWeight: '900',
                letterSpacing: 1.5,
                color: C.text,
                textAlign: 'center',
              }}
            >
              {hms(countdown)}
            </Text>
            <Text
              style={{
                color: C.dim,
                fontSize: 11,
                letterSpacing: 3.3,
                textAlign: 'center',
                paddingTop: 6,
              }}
            >
              UNTIL YOUR PREMIERE
            </Text>
          </View>
        ) : showProgress ? (
          <View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
              <LinearGradient
                colors={[C.orange, C.gold]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: 6, width: `${Math.round(renderProgress * 100)}%`, borderRadius: 3 }}
              />
            </View>
            <View style={{ height: 10 }} />
            <Text style={{ ...T.bodyMedium, color: C.dim, textAlign: 'center' }}>
              {renderStageLabel ?? 'Preparing your shoot…'}
            </Text>
          </View>
        ) : null}
      </StarCard>

      <View style={{ height: 14 }} />
      <CheckLine>
        {`${p?.name ?? 'Your package'} · ${p?.episodes ?? 0} ${p?.episodes === 1 ? 'episode' : 'episodes'} of ${sh?.title ?? 'your story'} starring ${name || 'you'}`}
      </CheckLine>
      <CheckLine>{`Consent ref ${consentRef ?? 'pending'} attached to this render`}</CheckLine>
      <CheckLine>Human quality check before delivery · one free re-render if we miss</CheckLine>
    </Stage>
  );
}
