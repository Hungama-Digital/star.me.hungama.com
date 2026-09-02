// src/starme/components/CameraCapture.tsx  (guide section 11, Camera sheet)
// Full-screen front-camera sheet: oval guide, top chip, Cancel pill, and a shutter
// 96 above the bottom that clears gesture navigation. Front camera only.
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { StarPalette as C, type as T } from '../theme';

export function CameraCapture({
  visible,
  onClose,
  onCaptured,
}: {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
}) {
  const camRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const reset = () => {
    setReady(false);
    setCapturing(false);
    setError(null);
    setUnavailable(null);
  };

  const shoot = async () => {
    if (!ready || capturing) return;
    setCapturing(true);
    setError(null);
    try {
      const pic = await camRef.current?.takePictureAsync({ quality: 0.9 });
      if (pic?.uri) {
        onCaptured(pic.uri);
        reset();
        onClose();
      } else {
        setError("We couldn't take that photo. Please hold still and try again.");
      }
    } catch {
      setError("We couldn't take that photo. Please hold still and try again.");
    } finally {
      setCapturing(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {unavailable ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ ...T.headlineSmall, color: C.text, textAlign: 'center' }}>
              Camera unavailable
            </Text>
            <Text style={{ ...T.bodyMedium, color: C.dim, textAlign: 'center', marginTop: 8 }}>
              {unavailable}
            </Text>
            <Pressable
              onPress={close}
              style={{ marginTop: 20, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: C.surface2 }}
            >
              <Text style={{ ...T.labelLarge, color: C.text }}>Go back</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              ref={camRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              onCameraReady={() => setReady(true)}
              onMountError={() =>
                setUnavailable('This device has no usable front camera. You can upload a photo instead.')
              }
            />

            {/* Oval guide 270x360, 2px white@72%, radius 140 */}
            <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: 270,
                  height: 360,
                  borderRadius: 140,
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.72)',
                }}
              />
            </View>

            {/* Top chip */}
            <View
              style={{
                position: 'absolute',
                top: 60,
                alignSelf: 'center',
                backgroundColor: 'rgba(0,0,0,0.58)',
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ ...T.titleSmall, color: '#fff' }}>Your close-up</Text>
              <Text style={{ ...T.bodySmall, color: 'rgba(255,255,255,0.8)' }}>
                Face the light · remove glasses · hold still
              </Text>
            </View>

            {/* Cancel pill */}
            <Pressable
              onPress={close}
              style={{
                position: 'absolute',
                top: 56,
                left: 16,
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Text style={{ ...T.bodySmall, color: '#fff' }}>Cancel</Text>
            </Pressable>

            {error ? (
              <Text
                style={{
                  ...T.bodySmall,
                  color: '#fff',
                  position: 'absolute',
                  bottom: 190,
                  alignSelf: 'center',
                  textAlign: 'center',
                  paddingHorizontal: 24,
                }}
              >
                {error}
              </Text>
            ) : null}

            {/* Shutter: 80 white circle, 5px black@32% ring, 96 above bottom */}
            <Pressable
              onPress={shoot}
              disabled={!ready || capturing}
              style={{
                position: 'absolute',
                bottom: 96,
                alignSelf: 'center',
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: '#fff',
                borderWidth: 5,
                borderColor: 'rgba(0,0,0,0.32)',
                opacity: !ready || capturing ? 0.45 : 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!ready || capturing ? <ActivityIndicator color="#000" /> : null}
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}
