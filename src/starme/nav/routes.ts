// src/starme/nav/routes.ts
// From ui/nav/Routes.kt. The stepper is 8 segments and the index is the enum ordinal.
import {
  canContinueCapture,
  canContinueConsent,
  type StarUiState,
} from '../state/types';

export const Step = {
  PROMO: 'promo', // index 0  Welcome
  SUBSCRIBE: 'subscribe', // index 1  Membership
  CAPTURE: 'capture', // index 2  Your Close-Up
  CONSENT: 'consent', // index 3  Consent
  CONCEPT: 'concept', // index 4  Choose Your World
  PACKAGE: 'package', // index 5  Choose Your Package
  PRODUCTION: 'production', // index 6  In Production
  PREMIERE: 'premiere', // index 7  Premiere
} as const;

export const STEP_ORDER = [
  Step.PROMO,
  Step.SUBSCRIBE,
  Step.CAPTURE,
  Step.CONSENT,
  Step.CONCEPT,
  Step.PACKAGE,
  Step.PRODUCTION,
  Step.PREMIERE,
] as const;

export const Routes = { ACCESS: 'access', SETTINGS: 'settings', PROJECTS: 'projects' } as const;

// The stepper counts the flow steps (Subscribe -> Premiere). Promo is the welcome
// landing and is NOT counted. "Choose Your World" (Concept) was removed from the flow
// (the single live world is auto-cast), so it no longer appears in the stepper.
export const STEPPER_STEPS = [
  Step.SUBSCRIBE,
  Step.CAPTURE,
  Step.CONSENT,
  Step.PACKAGE,
  Step.PRODUCTION,
  Step.PREMIERE,
] as const;

export const STEP_COUNT = STEPPER_STEPS.length; // 7

export const stepperIndex = (route?: string): number | null => {
  const i = STEPPER_STEPS.indexOf(route as (typeof STEPPER_STEPS)[number]);
  return i === -1 ? null : i;
};

/** Makes "Create" always land on the right step. Ported verbatim from Routes.kt. */
export function nextCreationRoute(s: StarUiState): string {
  if (!s.subscribed) return Step.SUBSCRIBE;
  if (!canContinueCapture(s)) return Step.CAPTURE;
  if (!canContinueConsent(s)) return Step.CONSENT;
  // Concept is gone; the world is auto-cast, so we jump straight to Package.
  if (s.packageId === null) return Step.PACKAGE;
  if (s.renderComplete) return Step.PACKAGE;
  if (s.remoteOrderId || s.orderId) return Step.PRODUCTION;
  return Step.PACKAGE;
}

export type StarRouteName =
  | (typeof STEP_ORDER)[number]
  | (typeof Routes)[keyof typeof Routes];
