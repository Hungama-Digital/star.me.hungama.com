// src/starme/state/errors.ts
// Port of UserFacingErrors.kt. The 503 consent case is an intentional Legal gate
// and must never read like a defect.
import { ApiError } from '../api/client';

export const userFacingErrors = {
  consent(e: unknown): string {
    if (e instanceof ApiError && e.statusCode === 503)
      return (
        'Consent setup is awaiting Legal approval, so this step is paused for everyone. ' +
        'Your photo and details stay safely on this device. No retake is needed once it opens.'
      );
    if (e instanceof ApiError && e.statusCode === 401)
      return 'Tester session expired. Enter a new access code to continue.';
    if (e instanceof ApiError)
      return 'Consent could not be recorded right now. Please try again in a moment.';
    return "We couldn't reach StarME. Check your connection and try again.";
  },

  order(e: unknown): string {
    if (e instanceof ApiError && e.statusCode === 401)
      return 'Tester session expired. Enter a new access code to continue.';
    if (e instanceof ApiError && e.statusCode === 409)
      return 'This consent is no longer active. Please complete consent again before ordering.';
    if (e instanceof ApiError)
      return 'Your order could not be created right now. Please try again in a moment.';
    return "We couldn't reach StarME. Check your connection and try again.";
  },
};
