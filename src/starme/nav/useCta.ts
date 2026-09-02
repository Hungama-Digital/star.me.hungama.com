// src/starme/nav/useCta.ts
// The exact CtaButton logic from MainActivity.kt (guide section 6). Renders only
// on the 8 flow steps. Reads the store reactively so label + enabled stay live.
import {
  canContinueCapture,
  canContinueConcept,
  canContinueConsent,
} from '../state/types';
import { useStarStore } from '../state/store';
import { pkg, welcomeCredits } from '../data/manifest';
import { Step } from './routes';
import { starNavigate } from './navRef';

export type CtaDescriptor = {
  label: string;
  enabled: boolean;
  variant: 'PRIMARY' | 'GHOST' | 'GOLD';
  onPress: () => void;
};

export function useCta(route: string): CtaDescriptor | null {
  const s = useStarStore();

  switch (route) {
    case Step.PROMO:
      return { label: 'Start Your Debut', enabled: true, variant: 'PRIMARY', onPress: () => starNavigate(Step.SUBSCRIBE) };

    case Step.SUBSCRIBE:
      return {
        label: s.subscribing ? 'Subscribing…' : `Subscribe · ₹499 And Claim ${welcomeCredits} Credits`,
        enabled: !s.subscribing,
        variant: 'PRIMARY',
        onPress: () => s.onSubscribe(),
      };

    case Step.CAPTURE:
      return {
        label: canContinueCapture(s) ? 'Continue To Consent' : 'Add Your Photo And Name',
        enabled: canContinueCapture(s),
        variant: 'PRIMARY',
        onPress: () => starNavigate(Step.CONSENT),
      };

    case Step.CONSENT:
      return {
        label: canContinueConsent(s) ? 'Continue · Consent Recorded' : 'Tick Both Boxes And Sign',
        enabled: canContinueConsent(s),
        variant: 'PRIMARY',
        onPress: () => starNavigate(Step.CONCEPT),
      };

    case Step.CONCEPT:
      return {
        label: canContinueConcept(s) ? 'Continue' : 'Choose A Story And Role',
        enabled: canContinueConcept(s),
        variant: 'PRIMARY',
        onPress: () => starNavigate(Step.PACKAGE),
      };

    case Step.PACKAGE: {
      const p = pkg(s.packageId);
      if (!p) return { label: 'Choose Your Billing', enabled: false, variant: 'PRIMARY', onPress: () => {} };
      if (p.credits > s.credits)
        return {
          label: `Add ${p.credits - s.credits} Credits · Demo Top-Up`,
          enabled: true,
          variant: 'PRIMARY',
          onPress: () => s.onConfirmPackage(),
        };
      return {
        label: `Confirm · ${s.credits} Credits`,
        enabled: true,
        variant: 'PRIMARY',
        onPress: () => s.onConfirmPackage(),
      };
    }

    case Step.PRODUCTION:
      return {
        label: s.awaitingFirstLook ? 'Approve First Look' : 'Refresh Production Status',
        enabled: !s.rendering && !s.renderComplete,
        variant: 'PRIMARY',
        onPress: () => (s.awaitingFirstLook ? s.approveFirstLook() : s.onStartRender()),
      };

    case Step.PREMIERE:
      return {
        label: 'Make Another Drama',
        enabled: true,
        variant: 'PRIMARY',
        onPress: () => {
          s.onMakeAnother();
          starNavigate(Step.CONCEPT);
        },
      };

    default:
      return null; // access, projects, settings have no dock
  }
}
