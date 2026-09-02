// src/starme/nav/StarNavigator.tsx
// The StarME shell: an independent navigation container (so it owns its own theme
// scope and cannot disturb the host app), the SINGLE event-to-navigation host
// (guide section 6), the derived CTA dock, the product bottom nav, and snackbars.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, NavigationIndependentTree, DefaultTheme } from '@react-navigation/native';
import {
  CardStyleInterpolators,
  createStackNavigator,
  type StackNavigationOptions,
} from '@react-navigation/stack';

import { AppBackdrop, StarPalette as C, type as T } from '../theme';
import { StarTopBar, StarStepper, CtaDock } from '../components';
import { StarBottomNav, showBottomNav } from './StarBottomNav';
import { useCta } from './useCta';
import { Routes, Step, STEP_ORDER, stepperIndex } from './routes';
import { starNavRef, starNavigate } from './navRef';
import { onStarEvent } from '../state/events';
import { useStarStore } from '../state/store';

import PromoScreen from '../screens/PromoScreen';
import SubscribeScreen from '../screens/SubscribeScreen';
import CaptureScreen from '../screens/CaptureScreen';
import ConsentScreen from '../screens/ConsentScreen';
import ConceptScreen from '../screens/ConceptScreen';
import PackageScreen from '../screens/PackageScreen';
import ProductionScreen from '../screens/ProductionScreen';
import PremiereScreen from '../screens/PremiereScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createStackNavigator();

// Compose used slide-in from +width/4 (320ms) and slide-out to -width/5 (220ms).
const screenOptions: StackNavigationOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: 'transparent' },
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
  transitionSpec: {
    open: { animation: 'timing', config: { duration: 320 } },
    close: { animation: 'timing', config: { duration: 220 } },
  },
};

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
    card: 'transparent',
    border: 'transparent',
    text: C.text,
    primary: C.orange,
  },
};

const isFlowStep = (route: string) => (STEP_ORDER as readonly string[]).includes(route);

export default function StarNavigator() {
  const [route, setRoute] = useState<string>(Step.PROMO);
  const [snack, setSnack] = useState<{ message: string; error: boolean } | null>(null);
  const started = useRef(false);

  const authenticated = useStarStore((s) => s.authenticated);
  const credits = useStarStore((s) => s.credits);
  const subscribed = useStarStore((s) => s.subscribed);

  // The single event host. Subscribe first, then hydrate so no early event is missed.
  useEffect(() => {
    const off = onStarEvent((e) => {
      switch (e.type) {
        case 'Toast':
          setSnack({ message: e.message, error: false });
          break;
        case 'Error':
          setSnack({ message: e.message, error: true });
          break;
        case 'SubscribeComplete':
          starNavigate(Step.CAPTURE);
          break;
        case 'OrderCreated':
          starNavigate(Step.PRODUCTION);
          break;
        case 'RenderComplete':
          starNavigate(Step.PREMIERE);
          break;
        case 'CreditsToppedUp':
          break; // stay on package
        // AccessGranted / SessionExpired: no-ops — the tester-code gate was removed.
        case 'AccessGranted':
        case 'SessionExpired':
          break;
        case 'ConsentRequired':
          starNavigate(Step.CONSENT);
          break;
        case 'RetakeRequested':
          starNavigate(Step.CAPTURE);
          break;
      }
    });
    if (!started.current) {
      started.current = true;
      void useStarStore.getState().hydrate();
    }
    return off;
  }, []);

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 3200);
    return () => clearTimeout(t);
  }, [snack]);

  const cta = useCta(route); // null on projects/settings
  const bottomNavVisible = showBottomNav(route, authenticated);
  const showTopbar = true; // tester-code gate removed; the brand bar shows on every StarME screen
  const showStepper = isFlowStep(route);

  const syncRoute = () => {
    const r = starNavRef.isReady() ? starNavRef.getCurrentRoute()?.name : undefined;
    if (r) setRoute(r);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient
        colors={AppBackdrop.colors}
        locations={AppBackdrop.locations}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {showTopbar && (
          <StarTopBar credits={credits} walletVisible={subscribed || credits > 0} />
        )}
        {showStepper && <StarStepper current={stepperIndex(route)} />}

        <View style={{ flex: 1 }}>
          <NavigationIndependentTree>
            <NavigationContainer
              ref={starNavRef}
              theme={navTheme}
              onReady={syncRoute}
              onStateChange={syncRoute}
            >
              <Stack.Navigator id={undefined} initialRouteName={Step.PROMO} screenOptions={screenOptions}>
              <Stack.Screen name={Step.PROMO} component={PromoScreen} />
              <Stack.Screen name={Step.SUBSCRIBE} component={SubscribeScreen} />
              <Stack.Screen name={Step.CAPTURE} component={CaptureScreen} />
              <Stack.Screen name={Step.CONSENT} component={ConsentScreen} />
              <Stack.Screen name={Step.CONCEPT} component={ConceptScreen} />
              <Stack.Screen name={Step.PACKAGE} component={PackageScreen} />
              <Stack.Screen name={Step.PRODUCTION} component={ProductionScreen} />
              <Stack.Screen name={Step.PREMIERE} component={PremiereScreen} />
              <Stack.Screen name={Routes.PROJECTS} component={ProjectsScreen} />
              <Stack.Screen name={Routes.SETTINGS} component={SettingsScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          </NavigationIndependentTree>
        </View>

        {cta && (
          <CtaDock
            label={cta.label}
            enabled={cta.enabled}
            variant={cta.variant}
            onPress={cta.onPress}
            applyBottomInset={!bottomNavVisible}
          />
        )}
        {bottomNavVisible && <StarBottomNav route={route} />}

        {snack && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}
          >
            <View
              style={{
                backgroundColor: snack.error ? C.danger : C.surface2,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.line,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text style={{ ...T.bodySmall, color: snack.error ? '#FFFFFF' : C.text }}>
                {snack.message}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
