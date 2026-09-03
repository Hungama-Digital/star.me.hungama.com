// src/starme/screens/ProjectsScreen.tsx  ·  Off-flow · Premieres tab (guide section 13.2)
// A vertical list of large hero cards (see PremiereCard): the user's active
// premiere on top (featured, unlocked), then the catalog of story worlds as
// locked cards that drop into the creation flow.
import React from 'react';
import { View } from 'react-native';
import { Stage, ScreenHeading, Lead, PremiereCard } from '../components';
import { StarImages } from '../theme';
import { useStarStore } from '../state/store';
import { manifest, shell as shellById, isLive, type ShellDef } from '../data/manifest';
import { nextCreationRoute } from '../nav/routes';
import { starNavigate } from '../nav/navRef';

// Bundled keyart, keyed by shell id. Worlds without art fall back to a gradient.
const KEYART: Record<string, ReturnType<typeof require>> = {
  love: StarImages.loveKeyart,
  act: StarImages.actionKeyart,
};

// Genre background gradients (content art, not chrome) for artless worlds.
const WORLD_GRADIENT: Record<string, readonly [string, string]> = {
  love: ['#3C0B2B', '#D51E62'],
  act: ['#071C2A', '#087F93'],
  family: ['#2A1414', '#6B3A2E'],
  revenge: ['#1A0A0A', '#4A1520'],
  campus: ['#3C0B2B', '#C0417A'],
  comedy: ['#3A2A08', '#7A5A18'],
};
const DEFAULT_GRADIENT = ['#272728', '#141414'] as const;

const episodeCount = (s?: ShellDef | null) => s?.episodes?.length ?? 5;

export default function ProjectsScreen() {
  const store = useStarStore();
  const { remoteOrderId, orderId, renderComplete, awaitingFirstLook, remoteEpisodes, shellId } = store;
  const hasOrder = !!(remoteOrderId || orderId);
  const active = shellById(shellId);

  // Begin (or resume) creating a drama in the tapped world.
  const startWorld = (id: string) => {
    store.selectShell(id);
    starNavigate(nextCreationRoute({ ...store, shellId: id, roleId: null }));
  };

  const activeSubtitle = renderComplete
    ? 'Premiere ready · now streaming'
    : awaitingFirstLook
      ? 'First look ready for your approval'
      : 'In production';

  return (
    <Stage>
      <ScreenHeading>My Premieres</ScreenHeading>
      <Lead>Your stories, first looks and finished episodes live here.</Lead>

      <View style={{ gap: 20 }}>
        {hasOrder && (
          <PremiereCard
            featured
            title={active?.title ?? 'Your drama'}
            subtitle={activeSubtitle}
            episodes={remoteEpisodes?.length || episodeCount(active)}
            image={active ? KEYART[active.id] : undefined}
            gradient={(active && WORLD_GRADIENT[active.id]) ?? DEFAULT_GRADIENT}
            ctaLabel={renderComplete ? 'Watch Premiere' : 'View Production'}
            onPress={() => starNavigate(renderComplete ? 'premiere' : 'production')}
          />
        )}

        {manifest.shells
          .filter((s) => !(hasOrder && s.id === active?.id))
          .map((s) => {
            const soon = !isLive(s);
            return (
              <PremiereCard
                key={s.id}
                title={s.title}
                subtitle={s.kicker}
                episodes={episodeCount(s)}
                image={KEYART[s.id]}
                gradient={WORLD_GRADIENT[s.id] ?? DEFAULT_GRADIENT}
                locked
                ctaLabel={soon ? 'Coming Soon' : 'Watch Episode 1'}
                onPress={() => (soon ? starNavigate(nextCreationRoute(store)) : startWorld(s.id))}
              />
            );
          })}
      </View>
    </Stage>
  );
}
