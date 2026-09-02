// src/starme/nav/routes.ts
// From ui/nav/Routes.kt. The stepper is 8 segments and the index is the enum ordinal.
import {
  canContinueCapture,
  canContinueConcept,
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

export const STEP_COUNT = 8;

export const stepperIndex = (route?: string): number | null => {
  const i = STEP_ORDER.indexOf(route as (typeof STEP_ORDER)[number]);
  return i === -1 ? null : i;
};

/** Makes "Create" always land on the right step. Ported verbatim from Routes.kt. */
export function nextCreationRoute(s: StarUiState): string {
  if (!s.subscribed) return Step.SUBSCRIBE;
  if (!canContinueCapture(s)) return Step.CAPTURE;
  if (!canContinueConsent(s)) return Step.CONSENT;
  if (!canContinueConcept(s)) return Step.CONCEPT;
  if (s.packageId === null) return Step.PACKAGE;
  if (s.renderComplete) return Step.CONCEPT;
  if (s.remoteOrderId || s.orderId) return Step.PRODUCTION;
  return Step.PACKAGE;
}

export type StarRouteName =
  | (typeof STEP_ORDER)[number]
  | (typeof Routes)[keyof typeof Routes];
