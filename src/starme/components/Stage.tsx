// src/starme/components/Stage.tsx
// Compose `Stage` = the scrollable content column on every screen.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { spacing } from '../theme';

export const Stage = React.forwardRef<ScrollView, { children: React.ReactNode }>(
  ({ children }, ref) => (
    <ScrollView
      ref={ref}
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.gutter,
        paddingTop: spacing.top,
        paddingBottom: spacing.bottom,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ),
);
Stage.displayName = 'Stage';
