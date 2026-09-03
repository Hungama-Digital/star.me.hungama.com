// src/starme/components/SignaturePad.tsx  (guide section 14.3)
// SVG paths driven by PanResponder, rasterised to a transparent PNG via
// react-native-view-shot. Ink #F2CD82, stroke 5, round cap/join. A stroke counts
// as ink only when it has more than one point.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { StarPalette as C, radius, type as T } from '../theme';

export type SignaturePadHandle = {
  capturePng: () => Promise<string | null>;
  clear: () => void;
};

type Point = { x: number; y: number };

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { onInkChange: (hasInk: boolean) => void; enabled?: boolean }
>(({ onInkChange, enabled = true }, ref) => {
    const [strokes, setStrokes] = useState<Point[][]>([]);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const shotRef = useRef<View>(null);
    // Kept in a ref so the once-created PanResponder always sees the latest value.
    const enabledRef = useRef(enabled);
    useEffect(() => {
      enabledRef.current = enabled;
    }, [enabled]);

    const hasInk = strokes.some((s) => s.length > 1);
    useEffect(() => {
      onInkChange(hasInk);
    }, [hasInk, onInkChange]);

    const responder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabledRef.current,
        onMoveShouldSetPanResponder: () => enabledRef.current,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          setStrokes((s) => [...s, [{ x, y }]]);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          setStrokes((s) => {
            const n = [...s];
            n[n.length - 1] = [...n[n.length - 1], { x, y }];
            return n;
          });
        },
      }),
    ).current;

    const toPath = (pts: Point[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    useImperativeHandle(ref, () => ({
      clear: () => setStrokes([]),
      capturePng: async () => {
        if (!hasInk || size.width === 0 || size.height === 0) return null;
        try {
          return await captureRef(shotRef, { format: 'png', result: 'base64' });
        } catch {
          return null;
        }
      },
    }));

    return (
      <View
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        {...responder.panHandlers}
        style={{
          height: 140,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: radius.note,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.2)',
          overflow: 'hidden',
          opacity: enabled ? 1 : 0.5,
        }}
      >
        {/* Transparent capture layer (no bg) so the rasterised PNG has alpha. */}
        <View
          ref={shotRef}
          collapsable={false}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Svg width="100%" height="100%">
            {strokes.map((s, i) => (
              <Path
                key={i}
                d={toPath(s)}
                stroke={C.goldInk}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        </View>
        {!hasInk ? (
          <View style={{ ...({ position: 'absolute' } as const), top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...T.bodyMedium, color: 'rgba(255,255,255,0.4)' }}>
              {enabled ? 'Sign here' : 'Tick both boxes to sign'}
            </Text>
          </View>
        ) : null}
      </View>
    );
  },
);
SignaturePad.displayName = 'SignaturePad';
