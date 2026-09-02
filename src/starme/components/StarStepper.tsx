// src/starme/components/StarStepper.tsx
import React from 'react';
import { Text, View } from 'react-native';
import { StarPalette as C, type as T } from '../theme';

const STEP_NAMES = [
  'Welcome',
  'Membership',
  'Your Close-Up',
  'Consent',
  'Choose Your World',
  'Choose Your Package',
  'In Production',
  'Premiere',
];

export const StarStepper = ({
  current,
  total = 8,
}: {
  current: number | null;
  total?: number;
}) => (
  <View>
    {current !== null && (
      <Text
        style={{
          ...T.labelSmall,
          fontSize: 9,
          letterSpacing: 1.08,
          color: C.dim,
          paddingHorizontal: 18,
          paddingVertical: 4,
        }}
      >
        {`STEP ${current + 1} OF ${total}  ·  ${STEP_NAMES[current].toUpperCase()}`}
      </Text>
    )}
    <View
      style={{
        flexDirection: 'row',
        gap: 5,
        paddingHorizontal: 18,
        paddingTop: 2,
        paddingBottom: 12,
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: current !== null && i <= current ? C.orange : C.line,
          }}
        />
      ))}
    </View>
  </View>
);
