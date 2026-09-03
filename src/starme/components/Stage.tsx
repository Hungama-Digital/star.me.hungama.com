// src/starme/components/Stage.tsx
// The scrollable content column on every StarME screen. The step CTA (primary +
// optional secondary) lives at the END of the scroll content so it scrolls with
// everything else. StarME renders inside the FastTV app's bottom-tab, so the content
// pads its bottom to clear that (absolute) tab bar plus the home indicator.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme';
import { useCta } from '../nav/useCta';
import { StarButton } from './StarButton';

// Height of the FastTV app tab bar above the safe-area inset (see App.js tabHeight).
const FASTTV_TAB_CLEARANCE = 70;

export const Stage = React.forwardRef<ScrollView, { children: React.ReactNode }>(
  ({ children }, ref) => {
    const routeName = useRoute().name;
    const cta = useCta(routeName);
    const insets = useSafeAreaInsets();
    const bottomPad = spacing.bottom + insets.bottom + FASTTV_TAB_CLEARANCE;

    return (
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.top,
          paddingBottom: bottomPad,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}

        {cta ? (
          <View style={{ marginTop: 22 }}>
            {cta.secondary ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StarButton
                  label={cta.secondary.label}
                  variant="GHOST"
                  dense
                  style={{ flex: 1 }}
                  onPress={cta.secondary.onPress}
                />
                <StarButton
                  label={cta.label}
                  enabled={cta.enabled}
                  variant={cta.variant}
                  dense
                  style={{ flex: 1 }}
                  onPress={cta.onPress}
                  hintWhenDisabled={cta.hintWhenDisabled}
                />
              </View>
            ) : (
              <StarButton
                label={cta.label}
                enabled={cta.enabled}
                variant={cta.variant}
                onPress={cta.onPress}
                hintWhenDisabled={cta.hintWhenDisabled}
              />
            )}
          </View>
        ) : null}
      </ScrollView>
    );
  },
);
Stage.displayName = 'Stage';
