import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    // These come from the active EAS profile (development / production / etc.)
    moengageWorkspaceId: process.env.EXPO_PUBLIC_MOENGAGE_WORKSPACE_ID,
    moengageDataKey: process.env.EXPO_PUBLIC_MOENGAGE_DATA_KEY,
    mixpanelToken: process.env.EXPO_PUBLIC_MIXPANEL_TOKEN,
    mixpanelProjectId: process.env.EXPO_PUBLIC_MIXPANEL_ID,
    // StarME feature config (guide section 16). Staging default lives in src/starme/config.ts.
    starmeApiBaseUrl: process.env.EXPO_PUBLIC_STARME_API_BASE_URL,
    starmeRealIdentityEnabled: process.env.EXPO_PUBLIC_STARME_REAL_IDENTITY_ENABLED,
  },
});