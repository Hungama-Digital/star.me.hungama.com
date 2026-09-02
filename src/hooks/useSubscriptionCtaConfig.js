import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { initializeFirebase, isFirebaseReady } from '../config/firebase';

const DEFAULT_SUBSCRIPTION_CTA_CONFIG = {
  home_trial_cta: '3-days trial ₹1',
  home_subscribe_cta: 'Subscribe Now',
  tile_details_trial_cta: '₹1 for 3days',
  tile_details_subscribe_cta: '₹399/month',
};

const waitForFirebase = (maxWaitMs = 2500, intervalMs = 300) => {
  return new Promise((resolve) => {
    initializeFirebase();
    if (isFirebaseReady()) {
      resolve(true);
      return;
    }
    let elapsed = 0;
    const id = setInterval(() => {
      initializeFirebase();
      elapsed += intervalMs;
      if (isFirebaseReady()) {
        clearInterval(id);
        resolve(true);
        return;
      }
      if (elapsed >= maxWaitMs) {
        clearInterval(id);
        resolve(false);
      }
    }, intervalMs);
  });
};

/**
 * Hook to load subscription CTA button text from Firebase Remote Config.
 * Returns config object with fallbacks when Firebase is unavailable or on web.
 * Firebase key: subscription_cta_config (JSON string)
 */
export const useSubscriptionCtaConfig = () => {
  const [config, setConfig] = useState(DEFAULT_SUBSCRIPTION_CTA_CONFIG);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  useEffect(() => {
    const loadRemoteConfig = async () => {
      if (Platform.OS === 'web') {
        setConfig(DEFAULT_SUBSCRIPTION_CTA_CONFIG);
        setIsConfigLoaded(true);
        return;
      }

      const firebaseReady = await waitForFirebase();
      if (!firebaseReady) {
        setConfig(DEFAULT_SUBSCRIPTION_CTA_CONFIG);
        setIsConfigLoaded(true);
        return;
      }

      let getApp;
      let getRemoteConfig;
      let setDefaults;
      let setConfigSettings;
      let fetchAndActivate;
      let getString;
      try {
        const appModule = require('@react-native-firebase/app');
        const remoteConfigModule = require('@react-native-firebase/remote-config');
        getApp = appModule.getApp;
        getRemoteConfig = remoteConfigModule.getRemoteConfig;
        setDefaults = remoteConfigModule.setDefaults;
        setConfigSettings = remoteConfigModule.setConfigSettings;
        fetchAndActivate = remoteConfigModule.fetchAndActivate;
        getString = remoteConfigModule.getString;
      } catch (e) {
        setConfig(DEFAULT_SUBSCRIPTION_CTA_CONFIG);
        setIsConfigLoaded(true);
        return;
      }

      try {
        const app = getApp();
        const remoteConfig = getRemoteConfig(app);

        const defaultConfig = {
          subscription_cta_config: JSON.stringify(DEFAULT_SUBSCRIPTION_CTA_CONFIG),
        };

        await setDefaults(remoteConfig, defaultConfig);
        await setConfigSettings(remoteConfig, {
          minimumFetchIntervalMillis: 60 * 1000,
        });
        await fetchAndActivate(remoteConfig);

        const jsonStr = getString(remoteConfig, 'subscription_cta_config') || '{}';
        let parsed = DEFAULT_SUBSCRIPTION_CTA_CONFIG;
        try {
          const obj = JSON.parse(jsonStr || '{}');
          parsed = {
            home_trial_cta: obj.home_trial_cta ?? DEFAULT_SUBSCRIPTION_CTA_CONFIG.home_trial_cta,
            home_subscribe_cta: obj.home_subscribe_cta ?? DEFAULT_SUBSCRIPTION_CTA_CONFIG.home_subscribe_cta,
            tile_details_trial_cta: obj.tile_details_trial_cta ?? DEFAULT_SUBSCRIPTION_CTA_CONFIG.tile_details_trial_cta,
            tile_details_subscribe_cta: obj.tile_details_subscribe_cta ?? DEFAULT_SUBSCRIPTION_CTA_CONFIG.tile_details_subscribe_cta,
          };
        } catch (e) {
          console.warn('Subscription CTA Remote Config: Failed to parse JSON, using defaults', e);
        }

        setConfig(parsed);
      } catch (err) {
        console.warn('Subscription CTA Remote Config: Error loading config, using defaults', err);
        setConfig(DEFAULT_SUBSCRIPTION_CTA_CONFIG);
      } finally {
        setIsConfigLoaded(true);
      }
    };

    loadRemoteConfig();
  }, []);

  return { subscriptionCta: config, isConfigLoaded };
};
