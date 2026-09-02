// src/starme/screens/PremiereScreen.tsx  ·  Step 8 of 8 · Premiere (guide section 11)
import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { Stage, Eyebrow, ScreenHeading, Lead, StarCard, StarButton } from '../components';
import { PosterView, POSTER_H, POSTER_W } from '../components/PosterView';
import { EpisodePlayer } from '../components/EpisodePlayer';
import { StarPalette as C, radius, type as T, Display } from '../theme';
import { useStarStore } from '../state/store';
import { pkg as pkgById, shell as shellById, hasContent, type EpisodeDef } from '../data/manifest';
import { emitStarEvent } from '../state/events';
import { starNavigate } from '../nav/navRef';
import { capturePosterBase64, writePosterFile } from '../services/poster';
import { savePosterToGallery, sharePoster } from '../services/media';
import { downloadRepo } from '../data/downloadRepo';
import type { EpisodeDto } from '../api/types';

function ProvenanceBadge({ label }: { label: string }) {
  return (
    <View style={{ borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ ...T.labelSmall, fontSize: 10, letterSpacing: 1.0, color: C.dim }}>{label}</Text>
    </View>
  );
}

function EpisodeRow({
  ep,
  unlocked,
  playable,
  downloaded,
  last,
  onWatch,
  onDownload,
}: {
  ep: EpisodeDef;
  unlocked: boolean;
  playable: boolean;
  downloaded: boolean;
  last: boolean;
  onWatch: () => void;
  onDownload: () => void;
}) {
  return (
    <View style={{ opacity: unlocked ? 1 : 0.4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
        <Text style={{ fontFamily: Display, fontSize: 16, color: C.gold, width: 30 }}>
          {String(ep.n).padStart(2, '0')}
        </Text>
        <Text style={{ ...T.bodyMedium, color: C.text, flex: 1 }}>{ep.title}</Text>
        {playable ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Pressable onPress={onDownload}>
              <Text style={{ ...T.labelSmall, color: downloaded ? C.good : C.dim }}>
                {downloaded ? 'Saved ✓' : 'Download'}
              </Text>
            </Pressable>
            <Pressable onPress={onWatch}>
              <Text style={{ ...T.labelSmall, color: C.orange }}>▶ Watch</Text>
            </Pressable>
          </View>
        ) : unlocked ? (
          <Text style={{ ...T.labelSmall, color: C.dim }}>Preview soon</Text>
        ) : (
          <Text style={{ ...T.labelSmall, color: C.dim }}>Locked</Text>
        )}
      </View>
      {!last ? <View style={{ height: 1, backgroundColor: C.line, opacity: 0.6 }} /> : null}
    </View>
  );
}

export default function PremiereScreen() {
  const store = useStarStore();
  const { name, shellId, packageId, consentRef, remoteEpisodes, photoPath, orderId } = store;
  const sh = shellById(shellId);
  const p = pkgById(packageId);

  const posterRef = useRef<View>(null);
  const [posterB64, setPosterB64] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<Record<number, boolean>>({});
  const [player, setPlayer] = useState<{ uri: string; local: boolean } | null>(null);

  const memoKey = `${photoPath}|${name}|${sh?.id}|${p?.id}|${consentRef}`;

  // Render the poster once and reuse it (on-screen + save + share). Recapture on deps.
  useEffect(() => {
    if (!sh || !p) return;
    let alive = true;
    const t = setTimeout(async () => {
      const b64 = await capturePosterBase64(posterRef);
      if (alive && b64) setPosterB64(b64);
    }, 450); // allow off-screen layout + Image.getSize
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoKey]);

  // Load offline-download state for unlocked episodes.
  useEffect(() => {
    if (!orderId || !sh || !p) return;
    let alive = true;
    (async () => {
      const map: Record<number, boolean> = {};
      for (const ep of sh.episodes ?? []) {
        if (ep.n <= p.episodes) map[ep.n] = await downloadRepo.isDownloaded(orderId, ep.n);
      }
      if (alive) setDownloaded(map);
    })();
    return () => {
      alive = false;
    };
  }, [orderId, sh, p]);

  if (!sh || !p) {
    return (
      <Stage>
        <Lead>Preparing your premiere…</Lead>
      </Stage>
    );
  }

  const episodes = sh.episodes ?? [];
  const remoteFor = (n: number): EpisodeDto | undefined =>
    remoteEpisodes.find((e) => e.episode_number === n);

  const onSave = async () => {
    if (!posterB64) {
      emitStarEvent({ type: 'Toast', message: 'Could not save poster' });
      return;
    }
    const safe = (name.trim() || 'You').replace(/\s+/g, '_');
    const fileUri = await writePosterFile(safe, posterB64);
    const ok = await savePosterToGallery(fileUri);
    emitStarEvent({ type: 'Toast', message: ok ? 'Poster saved' : 'Could not save poster' });
  };

  const onShare = async () => {
    if (!posterB64) return;
    const safe = (name.trim() || 'You').replace(/\s+/g, '_');
    const fileUri = await writePosterFile(safe, posterB64);
    await sharePoster(fileUri);
  };

  const onWatch = (ep: EpisodeDef) => {
    const remote = remoteFor(ep.n);
    if (remote?.stream_url) {
      setPlayer({ uri: remote.stream_url, local: false }); // real render: no overlays
    } else if (hasContent(ep)) {
      // Bundled placeholder shells (shell_love_ep01..03.mp4) are not in the repo yet.
      emitStarEvent({ type: 'Toast', message: 'Bundled episode file not added to assets yet' });
    }
  };

  const onDownload = async (ep: EpisodeDef) => {
    const remote = remoteFor(ep.n);
    if (remote?.download_url) {
      Linking.openURL(remote.download_url).catch(() => {});
      return;
    }
    if (hasContent(ep)) {
      emitStarEvent({ type: 'Toast', message: 'Bundled episode file not added to assets yet' });
    }
  };

  return (
    <>
      <Stage>
        <Eyebrow>Tonight's premiere</Eyebrow>
        <ScreenHeading>{`${name || 'You'}, in ${sh.title}`}</ScreenHeading>
        <Lead>
          Your poster, your billing, your season. Full episodes live inside Fast TV; the trailer is
          yours to share anywhere.
        </Lead>

        {/* Poster */}
        <View
          style={{
            width: '100%',
            aspectRatio: POSTER_W / POSTER_H,
            borderRadius: radius.tile,
            borderWidth: 1,
            borderColor: '#3A3050',
            overflow: 'hidden',
            backgroundColor: C.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {posterB64 ? (
            <Image
              source={{ uri: `data:image/png;base64,${posterB64}` }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ ...T.bodySmall, color: C.dim }}>Rendering poster…</Text>
          )}
        </View>

        <View style={{ height: 16 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StarButton label="Save Poster" variant="GOLD" style={{ flex: 1 }} onPress={onSave} />
          <StarButton label="Share Trailer" variant="GHOST" style={{ flex: 1 }} onPress={onShare} />
        </View>

        <View style={{ height: 16 }} />
        <StarCard>
          {episodes.map((ep, i) => {
            const unlocked = ep.n <= p.episodes;
            const playable = unlocked && (!!remoteFor(ep.n) || hasContent(ep));
            return (
              <EpisodeRow
                key={ep.n}
                ep={ep}
                unlocked={unlocked}
                playable={playable}
                downloaded={!!downloaded[ep.n]}
                last={i === episodes.length - 1}
                onWatch={() => onWatch(ep)}
                onDownload={() => onDownload(ep)}
              />
            );
          })}
        </StarCard>

        {/* Provenance strip */}
        <View style={{ height: 16 }} />
        <View style={{ height: 1, backgroundColor: C.line }} />
        <View style={{ height: 12 }} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <ProvenanceBadge label="AI PERSONALISED" />
          <ProvenanceBadge label="CONTENT CREDENTIALS" />
          <ProvenanceBadge label="WATERMARKED" />
        </View>
        <View style={{ height: 8 }} />
        <Text style={{ ...T.bodySmall, color: C.dim }}>
          {`This drama was created with your signed consent (Ref ${consentRef ?? 'pending'}) and carries provenance credentials.`}
        </Text>
        <View style={{ height: 6 }} />
        <Pressable onPress={() => starNavigate('settings')}>
          <Text style={{ ...T.bodySmall, fontWeight: '600', color: C.orange }}>
            Manage or revoke your likeness anytime in Settings →
          </Text>
        </Pressable>
      </Stage>

      {/* Off-screen poster composition, captured to the PNG above. */}
      <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none">
        <PosterView ref={posterRef} photoUri={photoPath} name={name} shell={sh} pkg={p} consentRef={consentRef} />
      </View>

      <EpisodePlayer
        visible={!!player}
        uri={player?.uri ?? null}
        local={player?.local ?? false}
        photoUri={photoPath}
        onClose={() => setPlayer(null)}
      />
    </>
  );
}
