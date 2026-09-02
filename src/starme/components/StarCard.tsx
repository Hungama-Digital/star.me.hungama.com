// src/starme/components/StarCard.tsx
// Vertical gradient surface2 -> surface, 1px line border, radius 20, padding 18, soft shadow.
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import type { ViewStyle } from 'react-native';
import { StarPalette as C, radius, spacing } from '../theme';

export const StarCard = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) => (
  <LinearGradient
    colors={[C.surface2, C.surface]}
    style={{
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: C.line,
      padding: spacing.cardPadding,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      ...style,
    }}
  >
    {children}
  </LinearGradient>
);
