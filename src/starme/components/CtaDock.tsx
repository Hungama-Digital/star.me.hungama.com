// src/starme/components/CtaDock.tsx
// Fixed footer above the tab bar: background bg at 98% opacity,
// padding 20 horizontal / 10 vertical, holding exactly one StarButton.
// Label + enabled + variant are derived per step by the caller (section 6).
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme';
import { StarButton } from './StarButton';

export const CtaDock = ({
  label,
  enabled = true,
  variant = 'PRIMARY',
  onPress,
  applyBottomInset = true,
}: {
  label: string;
  enabled?: boolean;
  variant?: 'PRIMARY' | 'GHOST' | 'GOLD';
  onPress: () => void;
  // When the product tab bar sits directly below, it owns the safe-area inset.
  applyBottomInset?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: 'rgba(9,9,12,0.98)',
        paddingHorizontal: spacing.dockH,
        paddingTop: spacing.dockV,
        paddingBottom: spacing.dockV + (applyBottomInset ? insets.bottom : 0),
      }}
    >
      <StarButton label={label} enabled={enabled} variant={variant} onPress={onPress} />
    </View>
  );
};
