// src/starme/nav/navRef.ts
// Ref to StarME's own (independent) navigation container, so the single event
// host and the CTA dock can drive navigation imperatively from outside the tree.
import { createNavigationContainerRef } from '@react-navigation/native';

export const starNavRef = createNavigationContainerRef();

export function starNavigate(name: string) {
  if (starNavRef.isReady()) starNavRef.navigate(name as never);
}

/** Reset the whole stack to a single route (used by AccessGranted / SessionExpired). */
export function starReset(name: string) {
  if (starNavRef.isReady()) starNavRef.reset({ index: 0, routes: [{ name }] });
}

export function starCurrentRoute(): string | undefined {
  return starNavRef.isReady() ? starNavRef.getCurrentRoute()?.name : undefined;
}

export function starBack() {
  if (starNavRef.isReady() && starNavRef.canGoBack()) starNavRef.goBack();
  else starNavigate('promo');
}
