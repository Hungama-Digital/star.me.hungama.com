// src/starme/screens/ProjectsScreen.tsx  ·  Off-flow · Premieres tab (guide section 13.2)
import React from 'react';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Stage, ScreenHeading, Lead, SmallDim, StarButton } from '../components';
import { StarPalette as C, radius, type as T, StarImages } from '../theme';
import { useStarStore } from '../state/store';
import { shell as shellById } from '../data/manifest';
import { nextCreationRoute } from '../nav/routes';
import { starNavigate } from '../nav/navRef';

export default function ProjectsScreen() {
  const store = useStarStore();
  const { remoteOrderId, orderId, renderComplete, awaitingFirstLook, rendering, renderStageLabel, shellId } = store;
  const hasOrder = !!(remoteOrderId || orderId);
  const sh = shellById(shellId);

  const status = renderComplete
    ? { text: 'Premiere Ready', color: C.good }
    : awaitingFirstLook
      ? { text: 'First Look Ready', color: C.orange }
      : rendering
        ? { text: renderStageLabel ?? 'In Production', color: C.orange }
        : { text: 'Project Created', color: C.orange };

  return (
    <Stage>
      <ScreenHeading>My Premieres</ScreenHeading>
      <Lead>Your stories, first looks and finished episodes live here.</Lead>

      {hasOrder ? (
        <LinearGradient colors={[C.surface2, C.surface]} style={{ borderRadius: radius.hero, padding: 20 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Image
              source={sh?.id === 'act' ? StarImages.actionKeyart : StarImages.loveKeyart}
              style={{ width: 92, height: 126, borderRadius: radius.note }}
              resizeMode="cover"
            />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={{ ...T.titleLarge, color: C.text }}>{sh?.title ?? 'Your drama'}</Text>
              <Text style={{ ...T.labelLarge, color: status.color, marginTop: 4 }}>{status.text}</Text>
            </View>
          </View>
          <View style={{ height: 18 }} />
          <StarButton
            label={renderComplete ? 'Watch Premiere' : 'View Production'}
            onPress={() => starNavigate(renderComplete ? 'premiere' : 'production')}
          />
        </LinearGradient>
      ) : (
        <View
          style={{
            borderRadius: radius.hero,
            backgroundColor: C.surface,
            paddingHorizontal: 24,
            paddingVertical: 36,
            alignItems: 'center',
          }}
        >
          <MaterialIcons name="auto-awesome" size={28} color={C.gold} />
          <View style={{ height: 12 }} />
          <Text style={{ ...T.titleLarge, fontWeight: '700', color: C.text }}>
            Your First Premiere Starts Here
          </Text>
          <Text style={{ ...T.bodyMedium, color: C.dim, textAlign: 'center', paddingVertical: 12 }}>
            Choose a world, step into a role and create your personalised drama.
          </Text>
          <StarButton
            label="Create A Drama"
            variant="GHOST"
            onPress={() => starNavigate(nextCreationRoute(store))}
          />
        </View>
      )}
    </Stage>
  );
}
