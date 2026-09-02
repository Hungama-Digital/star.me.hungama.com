// src/starme/components/Text.tsx  (Eyebrow, ScreenHeading, Lead, SmallDim, CheckLine)
import React from 'react';
import { Text, View } from 'react-native';
import { StarPalette as C, type as T } from '../theme';

export const Eyebrow = ({ children }: { children: string }) => (
  <Text style={{ ...T.labelSmall, color: C.orange, marginBottom: 12 }}>
    {children.toUpperCase()}
  </Text>
);

export const ScreenHeading = ({ children }: { children: string }) => (
  <Text style={{ ...T.headlineMedium, color: C.text, marginBottom: 6 }}>{children}</Text>
);

export const Lead = ({ children }: { children: string }) => (
  <Text style={{ ...T.bodyMedium, color: C.dim, marginBottom: 18 }}>{children}</Text>
);

export const SmallDim = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ ...T.bodySmall, color: C.dim }}>{children}</Text>
);

export const CheckLine = ({ children }: { children: string }) => (
  <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
    <Text style={{ color: C.good, fontWeight: '700' }}>{'✓'}</Text>
    <Text style={{ ...T.bodySmall, color: C.dim, flex: 1 }}>{children}</Text>
  </View>
);
