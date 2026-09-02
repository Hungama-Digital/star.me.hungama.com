import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compareVersions } from '../utils/versionUtils';
import { initializeFirebase, isFirebaseReady } from '../config/firebase';

const DISMISSED_SOFT_UPDATE_VERSION_KEY = 'dismissed_soft_update_version';

const defaultAppConfig = {
  latest_app_version: '1.2.5',
  app_store_url_ios: 'https://apps.apple.com/app/id123456789',
  play_store_url_android: 'https://play.google.com/store/apps/details?id=com.app.hmini',
};

const AppUpdateContext = createContext({
  updateType: 'none',
  storeUrl: null,
  latestVersion: null,
  configLoaded: false,
  dismissSoftUpdate: () => {},
  isPendingSoftUpdate: false,
});

const waitForFirebase = (maxWaitMs = 3000, intervalMs = 200) => {
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

export function AppUpdateProvider({ children }) {
  const [updateType, setUpdateType] = useState('none');
  const [storeUrl, setStoreUrl] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState(null);

  const currentVersion = Constants?.expoConfig?.version || Constants?.manifest?.version || '1.2.5';

  const dismissSoftUpdate = useCallback(async () => {
    if (latestVersion) {
      await AsyncStorage.setItem(DISMISSED_SOFT_UPDATE_VERSION_KEY, latestVersion);
      setDismissedVersion(latestVersion);
      setUpdateType('none');
    }
  }, [latestVersion]);

  const loadAppConfig = useCallback(async () => {
    if (Platform.OS === 'web') {
      setConfigLoaded(true);
      return;
    }

    const firebaseReady = await waitForFirebase();
    if (!firebaseReady) {
      setConfigLoaded(true);
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
      setConfigLoaded(true);
      return;
    }

    try {
      const app = getApp();
      const remoteConfig = getRemoteConfig(app);
      await setDefaults(remoteConfig, {
        fasttv_app_config: JSON.stringify(defaultAppConfig),
      });
      await setConfigSettings(remoteConfig, {
        minimumFetchIntervalMillis: 60 * 1000,
      });
      await fetchAndActivate(remoteConfig);

      const configStr = getString(remoteConfig, 'fasttv_app_config') || '{}';
      let config = defaultAppConfig;
      try {
        config = JSON.parse(configStr);
      } catch (e) {
        console.warn('AppUpdate: Failed to parse fasttv_app_config', e);
      }

      const remote = (config.latest_app_version || '').trim() || currentVersion;
      const url =
        Platform.OS === 'ios'
          ? (config.app_store_url_ios || defaultAppConfig.app_store_url_ios)
          : config.play_store_url_android || defaultAppConfig.play_store_url_android;

      setLatestVersion(remote);
      setStoreUrl(url || null);

      // Update popup disabled for now — always treat as up to date
      setUpdateType('none');
    } catch (err) {
      console.warn('AppUpdate: Error loading config', err);
    } finally {
      setConfigLoaded(true);
    }
  }, [currentVersion]);

  useEffect(() => {
    loadAppConfig();
  }, [loadAppConfig]);

  const isPendingSoftUpdate =
    configLoaded &&
    updateType === 'none' &&
    latestVersion &&
    dismissedVersion === latestVersion &&
    compareVersions(currentVersion, latestVersion) === 'soft';

  const value = {
    updateType,
    storeUrl,
    latestVersion,
    configLoaded,
    currentVersion,
    dismissSoftUpdate,
    isPendingSoftUpdate,
  };

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdate() {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) throw new Error('useAppUpdate must be used within AppUpdateProvider');
  return ctx;
}
