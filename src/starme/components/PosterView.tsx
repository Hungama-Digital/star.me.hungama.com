// src/starme/components/PosterView.tsx  (guide section 11, Poster renderer)
// 900x1350 composition captured to PNG via react-native-view-shot. Rendered
// off-screen at true pixel size so the layout matches PosterRenderer.kt exactly.
import React, { forwardRef, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Display, Body } from '../theme';
import type { PackageDef, ShellDef } from '../data/manifest';

export const POSTER_W = 900;
export const POSTER_H = 1350;

// ARGB -> RN #RRGGBBAA
const DARKEN = ['#0A070E00', '#0A070EB8', '#0A070EF7'] as const;
const TINT_LOVE = ['#B01A5533', '#43102B3D'] as const;
const TINT_OTHER = ['#1E5C8C33', '#0B1C2E42'] as const;

type Props = {
  photoUri: string | null;
  name: string;
  shell: ShellDef;
  pkg: PackageDef;
  consentRef: string | null;
};

// Centred text anchored to a bottom-measured baseline y (approx: top = y - fontSize).
const CenteredLine = ({
  y,
  fontFamily,
  fontSize,
  color,
  children,
}: {
  y: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  children: string;
}) => (
  <Text
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: y - fontSize,
      textAlign: 'center',
      fontFamily,
      fontSize,
      color,
    }}
    numberOfLines={1}
  >
    {children}
  </Text>
);

export const PosterView = forwardRef<View, Props>(({ photoUri, name, shell, pkg, consentRef }, ref) => {
  const isLove = shell.id === 'love';
  const [photo, setPhoto] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    if (!photoUri) {
      setPhoto(null);
      return;
    }
    let alive = true;
    Image.getSize(
      photoUri,
      (w, h) => {
        if (!alive) return;
        const scale = Math.max(POSTER_W / w, POSTER_H / h);
        const sw = w * scale;
        const sh = h * scale;
        setPhoto({
          left: (POSTER_W - sw) / 2,
          top: ((POSTER_H - sh) / 2) * 0.6, // sits high in the frame
          width: sw,
          height: sh,
        });
      },
      () => alive && setPhoto(null),
    );
    return () => {
      alive = false;
    };
  }, [photoUri]);

  const nameUpper = (name.trim() || 'YOU').toUpperCase();
  const titleUpper = shell.title.toUpperCase();
  const eps = `${pkg.episodes} EPISODE${pkg.episodes > 1 ? 'S' : ''}`;
  const meta = `${shell.kicker.toUpperCase()}  ·  ${eps}  ·  AI PERSONALISED`;

  return (
    <View ref={ref} collapsable={false} style={{ width: POSTER_W, height: POSTER_H, backgroundColor: '#0B0810' }}>
      {photoUri && photo ? (
        <Image
          source={{ uri: photoUri }}
          style={{ position: 'absolute', left: photo.left, top: photo.top, width: photo.width, height: photo.height }}
        />
      ) : null}

      {/* Darkening gradient from y = 1350*0.35 to bottom */}
      <LinearGradient
        colors={DARKEN}
        locations={[0, 0.55, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: POSTER_H * 0.35, height: POSTER_H * 0.65 }}
      />

      {/* Horizontal shell tint across the full frame */}
      <LinearGradient
        colors={isLove ? TINT_LOVE : TINT_OTHER}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      />

      {/* Type stack (baseline y measured up from the bottom) */}
      <CenteredLine y={POSTER_H - 395} fontFamily={Body} fontSize={26} color="#D8CFE2">
        F A S T   T V   P R E S E N T S   A   S T A R M E   O R I G I N A L
      </CenteredLine>
      <CenteredLine y={POSTER_H - 310} fontFamily={Display} fontSize={70} color="#F2CD82">
        {nameUpper}
      </CenteredLine>
      <CenteredLine y={POSTER_H - 262} fontFamily={Body} fontSize={24} color="#CFC7DC">
        I N
      </CenteredLine>
      <CenteredLine y={POSTER_H - 130} fontFamily={Display} fontSize={150} color="#FFFFFF">
        {titleUpper}
      </CenteredLine>
      <CenteredLine y={POSTER_H - 58} fontFamily={Body} fontSize={22} color="#9C93AB">
        {meta}
      </CenteredLine>

      <Text
        style={{
          position: 'absolute',
          left: 28,
          top: POSTER_H - 24 - 18,
          fontFamily: Body,
          fontSize: 18,
          color: '#FFFFFF80',
        }}
        numberOfLines={1}
      >
        {`◈ Content credentials · ${consentRef ?? 'pending'}`}
      </Text>
    </View>
  );
});
PosterView.displayName = 'PosterView';
