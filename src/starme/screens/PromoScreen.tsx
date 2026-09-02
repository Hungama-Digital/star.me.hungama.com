// src/starme/screens/PromoScreen.tsx  ·  Step 1 of 8 · Welcome (guide section 11)
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Stage, CheckLine } from '../components';
import { StarPalette as C, radius, type as T, Display, StarImages } from '../theme';

// Compose ARGB -> RN #RRGGBBAA: #22000000 -> #00000022, #F209090C -> #09090CF2, #EE09090C -> #09090CEE
const OVERLAY_HERO = ['transparent', '#00000022', '#09090CF2'] as const;
const OVERLAY_POSTER = ['transparent', '#09090CEE'] as const;

function StoryPoster({
  art,
  genre,
  title,
}: {
  art: number;
  genre: string;
  title: string;
}) {
  return (
    <View
      style={{
        width: 190,
        height: 270,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: C.line,
        overflow: 'hidden',
      }}
    >
      <Image source={art} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient colors={OVERLAY_POSTER} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', left: 0, bottom: 0, padding: 14 }}>
        <Text style={{ color: C.gold, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
          {genre}
        </Text>
        <Text style={{ ...T.titleMedium, color: '#FFFFFF' }}>{title}</Text>
      </View>
    </View>
  );
}

export default function PromoScreen() {
  return (
    <Stage>
      <Text style={{ ...T.labelMedium, color: C.orange }}>FEATURED PREMIERE</Text>
      <View style={{ height: 10 }} />

      <View style={{ height: 470, borderRadius: radius.hero, overflow: 'hidden' }}>
        <Image source={StarImages.loveKeyart} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient
          colors={OVERLAY_HERO}
          locations={[0, 0.52, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ position: 'absolute', left: 0, bottom: 0, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons name="play-arrow" size={22} color="#000" />
            </View>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              {'  WATCH TRAILER'}
            </Text>
          </View>
          <View style={{ height: 14 }} />
          <Text style={{ fontFamily: Display, fontSize: 44, lineHeight: 44, color: '#fff' }}>
            {'BECOME THE\nLEAD'}
          </Text>
          <Text style={{ ...T.bodyMedium, color: 'rgba(255,255,255,0.82)', marginTop: 8 }}>
            One photo. One role. Your own Micro Drama premiere.
          </Text>
        </View>
      </View>

      <View style={{ height: 24 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ ...T.titleLarge, fontWeight: '700', color: C.text }}>Worlds Casting Now</Text>
        <MaterialIcons name="auto-awesome" size={22} color={C.gold} />
      </View>

      <View style={{ height: 12 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StoryPoster art={StarImages.loveKeyart} genre="ROMANCE · SCI-FI" title="Ek Love Story Aisi Bhi" />
          <StoryPoster art={StarImages.actionKeyart} genre="ACTION · CRIME" title="Hukum" />
        </View>
      </ScrollView>

      <View style={{ height: 22 }} />
      <CheckLine>Native camera capture and protected identity checks</CheckLine>
      <CheckLine>Approve your first look before the final premiere</CheckLine>
      <CheckLine>Download episodes and share through Android</CheckLine>
    </Stage>
  );
}
