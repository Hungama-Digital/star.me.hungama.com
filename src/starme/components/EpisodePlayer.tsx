// src/starme/components/EpisodePlayer.tsx  (guide section 11, Episode player)
// Full-screen modal, expo-video, repeat on, no native controls. The face overlay
// + caption chip are placed in VIDEO coordinates (the video letterboxes inside the
// container) and render ONLY for local placeholder assets, never over a remote stream.
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StarPalette as C, type as T } from '../theme';

const VIDEO_ASPECT = 1080 / 1920;
const ZONE_CENTER_Y = 0.298;
const ZONE_HEIGHT = 0.198;
const ZONE_LABEL_Y = 0.4;

function PlayerBody({ uri, local, photoUri }: { uri: string; local: boolean; photoUri: string | null }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  // Video coordinates within the letterboxed container.
  const videoScale = Math.min(box.w / VIDEO_ASPECT / 1920, box.h / 1920) || 0;
  const videoHeight = 1920 * videoScale;
  const videoWidth = videoHeight * VIDEO_ASPECT;
  const offsetY = (box.h - videoHeight) / 2;
  const offsetX = (box.w - videoWidth) / 2;
  const avatar = videoHeight * ZONE_HEIGHT * 0.9;
  const avatarTop = offsetY + videoHeight * ZONE_CENTER_Y - avatar / 2;
  const avatarLeft = offsetX + videoWidth / 2 - avatar / 2;
  const chipHeight = videoHeight * 0.04;
  const chipTop = offsetY + videoHeight * ZONE_LABEL_Y - chipHeight / 2;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />

      {local && box.w > 0 ? (
        <>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{
                position: 'absolute',
                top: avatarTop,
                left: avatarLeft,
                width: avatar,
                height: avatar,
                borderRadius: avatar / 2,
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.85)',
              }}
            />
          ) : null}
          <View
            style={{
              position: 'absolute',
              top: chipTop,
              left: offsetX,
              width: videoWidth,
              height: chipHeight,
              backgroundColor: '#23101B',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...T.labelMedium, color: '#FF8A50' }}>
              Swap role: Lead · Face integration zone
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

export function EpisodePlayer({
  visible,
  uri,
  local,
  photoUri,
  onClose,
}: {
  visible: boolean;
  uri: string | null;
  local: boolean;
  photoUri: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {visible && uri ? <PlayerBody uri={uri} local={local} photoUri={photoUri} /> : null}

        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 48,
            left: 14,
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <Text style={{ ...T.bodySmall, color: '#fff' }}>Close</Text>
        </Pressable>

        <Text
          style={{
            position: 'absolute',
            bottom: 28,
            alignSelf: 'center',
            color: 'rgba(255,255,255,0.7)',
            ...T.bodySmall,
          }}
        >
          Preview content · AI personalised · Watermarked
        </Text>
      </View>
    </Modal>
  );
}
