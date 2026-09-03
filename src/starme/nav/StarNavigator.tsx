// src/starme/nav/StarNavigator.tsx
// The StarME shell: an independent navigation container (so it owns its own theme
// scope and cannot disturb the host app), the SINGLE event-to-navigation host
// (guide section 6), the derived CTA dock, the product bottom nav, and snackbars.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, NavigationIndependentTree, DefaultTheme } from '@react-navigation/native';
import {
  CardStyleInterpolators,
  createStackNavigator,
  type StackNavigationOptions,
} from '@react-navigation/stack';

import { AppBackdrop, StarPalette as C, type as T, StarImages } from '../theme';
import { StarTopBar, StarStepper } from '../components';
import { Routes, Step, STEP_ORDER, stepperIndex } from './routes';
import { starNavRef, starNavigate, starBack } from './navRef';
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Full-screen boot splash shown while hydrate()/validation runs, so the navigator can
// mount directly on the resolved route (e.g. Production) without the Promo/home screen
// ever flashing first. Branded STAR ME wordmark inside a rotating accent ring.
function BootSplash() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    a.start();
    return () => a.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const R = 180;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient colors={AppBackdrop.colors} locations={AppBackdrop.locations} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...T.labelSmall, color: C.orange, letterSpacing: 2.4, marginBottom: 26 }}>
          A FAST TV ORIGINAL
        </Text>
        <View style={{ width: R, height: R, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: R,
              height: R,
              borderRadius: R / 2,
              borderWidth: 3,
              borderColor: 'rgba(0,156,219,0.18)',
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: R,
              height: R,
              borderRadius: R / 2,
              borderWidth: 3,
              borderColor: 'transparent',
              borderTopColor: C.orange,
              borderRightColor: C.orange,
              transform: [{ rotate }],
            }}
          />
          <Image
            source={StarImages.logo}
            style={{ width: 139, height: 154 }}
            resizeMode="contain"
            accessibilityLabel="StarME"
          />
        </View>
        <Text style={{ ...T.titleMedium, color: C.dim, marginTop: 26 }}>Preparing your studio…</Text>
      </View>
    </View>
  );
}

export default function StarNavigator() {
  const [route, setRoute] = useState<string>(Step.PROMO);
  const [snack, setSnack] = useState<{ message: string; error: boolean } | null>(null);
  const started = useRef(false);
  // Boot gate: the shell stays hidden behind BootSplash until hydrate()/validation
  // resolves, then the navigator mounts directly on `bootRoute` (no Promo flash).
  const [booted, setBooted] = useState(false);
  const [bootRoute, setBootRoute] = useState<string>(Step.PROMO);

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
      void (async () => {
        const t0 = Date.now();
        await useStarStore.getState().hydrate();
        // Resolve where to open: a saved order lands on My Premieres (the premieres
        // list — tap through to Production/Premiere); otherwise the Promo landing.
        // Computed AFTER validation, before the nav mounts.
        const s = useStarStore.getState();
        const start = s.remoteOrderId && s.orderId ? Routes.PROJECTS : Step.PROMO;
        // Keep the splash up for a minimum beat so the animation is actually seen.
        const elapsed = Date.now() - t0;
        if (elapsed < 900) await sleep(900 - elapsed);
        setBootRoute(start);
        setRoute(start);
        setBooted(true);
      })();
    }
    return off;
  }, []);

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(() => setSnack(null), 3200);
    return () => clearTimeout(t);
  }, [snack]);

  const showTopbar = true; // tester-code gate removed; the brand bar shows on every StarME screen
  // 7-step stepper: shown on Subscribe..Premiere; hidden on Promo (welcome) + off-flow.
  const showStepper = stepperIndex(route) !== null;
  // Back affordance on every flow step except the first (promo).
  const showBack = isFlowStep(route) && route !== Step.PROMO;

  const syncRoute = () => {
    const r = starNavRef.isReady() ? starNavRef.getCurrentRoute()?.name : undefined;
    if (r) setRoute(r);
  };

  // Until validation resolves, show only the boot animation (no Promo/home flash).
  if (!booted) return <BootSplash />;

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
        {showBack && (
          <Pressable
            onPress={starBack}
            hitSlop={8}
            style={{ paddingHorizontal: 18, paddingTop: 2, paddingBottom: 2, alignSelf: 'flex-start' }}
          >
            <Text style={{ ...T.bodyMedium, color: C.dim }}>‹ Back</Text>
          </Pressable>
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
              <Stack.Navigator id={undefined} initialRouteName={bootRoute} screenOptions={screenOptions}>
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

        {/* The step CTA scrolls with the content (rendered inside Stage). StarME shows
            no bottom nav of its own — the FastTV app tab bar is the only bottom menu. */}

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
