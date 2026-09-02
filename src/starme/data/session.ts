// src/starme/data/session.ts
// Session flags, replacing Android DataStore. The Kotlin call sites read these
// synchronously, so we keep an in-memory cache hydrated once at startup
// (loadSession, awaited in store.hydrate) and write through to AsyncStorage.
// Keys are 1:1 with SessionStore.kt.
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const K = {
  SUBSCRIBED: 'subscribed',
  CONSENT_REF: 'active_consent_ref',
  NAME: 'star_name',
  ACCESS_TOKEN: 'access_token',
  DEVICE_BINDING: 'device_binding_id',
  REMOTE_ORDER_ID: 'active_remote_order_id',
  LOCAL_ORDER_ID: 'active_local_order_id',
} as const;

// Namespace to avoid colliding with the host app's AsyncStorage keys.
const NS = 'starme_session:';
const nk = (key: string) => NS + key;

const cache: Record<string, string | undefined> = {};
let loaded = false;

/** Write-through: update the cache now, persist in the background. */
function put(key: string, value: string) {
  cache[key] = value;
  AsyncStorage.setItem(nk(key), value).catch(() => {});
}
function drop(key: string) {
  cache[key] = undefined;
  AsyncStorage.removeItem(nk(key)).catch(() => {});
}

/**
 * Hydrate the cache from AsyncStorage and guarantee a stable device binding id.
 * Must be awaited before any synchronous getter is used (store.hydrate does this).
 */
export async function loadSession(): Promise<void> {
  const keys = Object.values(K);
  const pairs = await AsyncStorage.multiGet(keys.map(nk));
  for (const [namespacedKey, value] of pairs) {
    const bare = namespacedKey.slice(NS.length);
    cache[bare] = value ?? undefined;
  }
  if (!cache[K.DEVICE_BINDING]) {
    const generated = uuidv4();
    cache[K.DEVICE_BINDING] = generated;
    await AsyncStorage.setItem(nk(K.DEVICE_BINDING), generated);
  }
  loaded = true;
}

export const session = {
  isLoaded: () => loaded,

  getAccessToken: () => cache[K.ACCESS_TOKEN] ?? null,
  setAccessToken: (t: string) => put(K.ACCESS_TOKEN, t),
  clearAccessToken: () => drop(K.ACCESS_TOKEN),

  /** Stable per install (UUID v4), created once. Guaranteed present after loadSession. */
  deviceBindingId: (): string => {
    const existing = cache[K.DEVICE_BINDING];
    if (existing) return existing;
    const generated = uuidv4();
    put(K.DEVICE_BINDING, generated);
    return generated;
  },

  getSubscribed: () => cache[K.SUBSCRIBED] === 'true',
  setSubscribed: (v: boolean) => put(K.SUBSCRIBED, v ? 'true' : 'false'),

  getName: () => cache[K.NAME] ?? '',

  getConsentRef: () => cache[K.CONSENT_REF] ?? null,
  setActiveConsent: (ref: string | null, name: string) => {
    if (ref === null) drop(K.CONSENT_REF);
    else put(K.CONSENT_REF, ref);
    put(K.NAME, name);
  },
  clearConsent: () => drop(K.CONSENT_REF),

  getRemoteOrderId: () => cache[K.REMOTE_ORDER_ID] ?? null,
  getLocalOrderId: (): number | null => {
    const v = cache[K.LOCAL_ORDER_ID];
    return v ? Number(v) : null;
  },
  setActiveOrder: (remote: string, local: number) => {
    put(K.REMOTE_ORDER_ID, remote);
    put(K.LOCAL_ORDER_ID, String(local));
  },
  clearActiveOrder: () => {
    drop(K.REMOTE_ORDER_ID);
    drop(K.LOCAL_ORDER_ID);
  },
};
