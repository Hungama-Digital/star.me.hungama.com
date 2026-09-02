// src/starme/nav/StarBottomNav.tsx
// Bottom product navigation. Visible only when authenticated and route is one of
// promo, production, premiere, projects, settings. Four destinations (guide section 6).
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StarPalette as C, type as T } from '../theme';
import { Step, Routes, nextCreationRoute } from './routes';
import { useStarStore } from '../state/store';
import { starNavigate } from './navRef';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const BOTTOM_NAV_ROUTES = [Step.PROMO, Step.PRODUCTION, Step.PREMIERE, Routes.PROJECTS, Routes.SETTINGS];

export const showBottomNav = (route: string | undefined, authenticated: boolean) =>
  authenticated && !!route && BOTTOM_NAV_ROUTES.includes(route as never);

export const StarBottomNav = ({ route }: { route: string }) => {
  const insets = useSafeAreaInsets();
  const state = useStarStore();

  const items: { key: string; label: string; icon: IconName; selected: boolean; target: string }[] = [
    { key: 'home', label: 'Home', icon: 'home', selected: route === Step.PROMO, target: Step.PROMO },
    {
      key: 'create',
      label: 'Create',
      icon: 'add-circle',
      selected: false, // never highlighted
      target: nextCreationRoute(state),
    },
    {
      key: 'premieres',
      label: 'Premieres',
      icon: 'movie',
      selected: route === Routes.PROJECTS || route === Step.PRODUCTION || route === Step.PREMIERE,
      target: Routes.PROJECTS,
    },
    {
      key: 'profile',
      label: 'Profile',
      icon: 'person',
      selected: route === Routes.SETTINGS,
      target: Routes.SETTINGS,
    },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: 'rgba(22,22,29,0.98)', // surface at 98%
        borderTopWidth: 1,
        borderTopColor: C.line,
        paddingTop: 8,
        paddingBottom: 8 + insets.bottom,
        elevation: 8,
      }}
    >
      {items.map((it) => {
        const color = it.selected ? C.orange : C.dim;
        return (
          <Pressable
            key={it.key}
            onPress={() => starNavigate(it.target)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}
            accessibilityRole="button"
            accessibilityState={{ selected: it.selected }}
          >
            <MaterialIcons name={it.icon} size={24} color={color} />
            <Text style={{ ...T.labelSmall, fontSize: 10, letterSpacing: 0.5, color }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
