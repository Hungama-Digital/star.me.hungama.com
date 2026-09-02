// src/starme/config.ts
// Two build-time values, mirroring the Android Gradle buildConfigField entries.
// Sourced from app.config.js `extra` (populated from EXPO_PUBLIC_* env), with a
// process.env fallback and the Android staging defaults.
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

const rawBaseUrl =
  (extra.starmeApiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_STARME_API_BASE_URL ??
  'https://starme.hungama.com'; // Android staging default

const rawRealIdentity =
  (extra.starmeRealIdentityEnabled as string | boolean | undefined) ??
  process.env.EXPO_PUBLIC_STARME_REAL_IDENTITY_ENABLED ??
  false;

/** Base URL with any trailing slashes stripped, matching the Kotlin client. */
export const STARME_API_BASE_URL = String(rawBaseUrl).replace(/\/+$/, '');

/**
 * The local build flag. Effective identity gate is this AND capabilities.identity_capture
 * (see store.refreshCapabilities). When false the photo never leaves the device.
 */
export const BUILD_REAL_IDENTITY_ENABLED =
  rawRealIdentity === true || rawRealIdentity === 'true';
