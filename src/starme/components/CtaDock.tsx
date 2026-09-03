// src/starme/components/CtaDock.tsx
// Fixed footer above the tab bar: background bg at 98% opacity,
// padding 20 horizontal / 10 vertical, holding the primary StarButton — plus an
// optional secondary (GHOST) button to its LEFT, on the same row.
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
  hintWhenDisabled = false,
  secondary,
}: {
  label: string;
  enabled?: boolean;
  variant?: 'PRIMARY' | 'GHOST' | 'GOLD';
  onPress: () => void;
  // When the product tab bar sits directly below, it owns the safe-area inset.
  applyBottomInset?: boolean;
  hintWhenDisabled?: boolean;
  secondary?: { label: string; onPress: () => void };
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: 'rgba(0,0,0,0.96)',
        paddingHorizontal: spacing.dockH,
        paddingTop: spacing.dockV,
        paddingBottom: spacing.dockV + (applyBottomInset ? insets.bottom : 0),
      }}
    >
      {secondary ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StarButton
            label={secondary.label}
            variant="GHOST"
            dense
            style={{ flex: 1 }}
            onPress={secondary.onPress}
          />
          <StarButton
            label={label}
            enabled={enabled}
            variant={variant}
            dense
            style={{ flex: 1 }}
            onPress={onPress}
            hintWhenDisabled={hintWhenDisabled}
          />
        </View>
      ) : (
        <StarButton
          label={label}
          enabled={enabled}
          variant={variant}
          onPress={onPress}
          hintWhenDisabled={hintWhenDisabled}
        />
      )}
    </View>
  );
};
