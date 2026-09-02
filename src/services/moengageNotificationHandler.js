/**
 * MoEngageNotificationHandler
 *
 * Listens for push-notification clicks and in-app message CTA taps from MoEngage,
 * extracts the target URL, and routes:
 *   - fasttv.app/* URLs → existing deepLinkingService (all known routes handled there)
 *   - any other http(s) URL → RichLanding WebView screen
 *   - missing / invalid URL → fasttv.app/home fallback
 *
 * Usage (in App.js after navigation is ready):
 *   import moengageNotificationHandler from './src/services/moengageNotificationHandler';
 *   moengageNotificationHandler.initialize(navigationRef);
 */

import { Platform } from 'react-native';
import deepLinkingService from './deepLinkingService';

const FALLBACK_URL = 'https://fasttv.app/home';
const FASTTV_HOST_PATTERN = /^https?:\/\/[^/]*fasttv\.app(\/|$)/i;

/** Append playback_source for notification-driven links so DeepLinkHandler can use it. */
function withPlaybackSource(url, source = 'notification') {
    if (!url || typeof url !== 'string') return url;
    const u = url.trim();
    if (/[?&]playback_source=/.test(u)) return u;
    const param = `playback_source=${encodeURIComponent(source)}`;
    return u.includes('?') ? `${u}&${param}` : `${u}?${param}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively search the MoEngage payload object for a `url` field.
 * MoEngage wraps payloads differently across SDK versions; check several known locations.
 */
function extractUrl(payload) {
    if (!payload || typeof payload !== 'object') return null;

    // Direct url field (most common)
    if (typeof payload.url === 'string' && payload.url.trim()) return payload.url.trim();

    // MoEngage push notification payload structures
    if (typeof payload.gcm_url === 'string' && payload.gcm_url.trim()) return payload.gcm_url.trim();
    if (typeof payload.moe_cta_link === 'string' && payload.moe_cta_link.trim()) return payload.moe_cta_link.trim();
    if (typeof payload.gcm_webUrl === 'string' && payload.gcm_webUrl.trim()) return payload.gcm_webUrl.trim();

    // In-app "action" objects: { action: { url: '...' } }
    if (payload.action && typeof payload.action.url === 'string' && payload.action.url.trim()) {
        return payload.action.url.trim();
    }

    // customData / additionalData / payload / nested data sub-objects
    for (const key of ['customData', 'additionalData', 'data', 'extra', 'kvPairs', 'payload']) {
        if (payload[key] && typeof payload[key] === 'object') {
            const found = extractUrl(payload[key]);
            if (found) return found;
        }
    }

    return null;
}

/**
 * Decide what to do with a URL:
 *  - fasttv.app deep link → pipe through deepLinkingService
 *  - valid http(s) URL → open in RichLanding WebView
 *  - anything else → fallback to home
 */
function handleUrl(url, navigationRef) {
    const nav = navigationRef?.current;
    const target = (typeof url === 'string' && url.trim()) ? url.trim() : FALLBACK_URL;

    // Log for debugging
    console.log('SHORTIFY LOG [MoENotif] Routing URL:', target);

    if (FASTTV_HOST_PATTERN.test(target)) {
        // Route through the existing deep link parser; add playback_source so DeepLinkHandler can use it
        const urlWithSource = withPlaybackSource(target);
        console.log('SHORTIFY LOG [MoENotif] Match fasttv.app -> invoking deepLinkingService');
        deepLinkingService.handleDeepLink({ url: urlWithSource });
        return;
    }

    // External / rich-landing URL — open in WebView
    if (/^https?:\/\//i.test(target)) {
        if (nav) {
            try {
                console.log('SHORTIFY LOG [MoENotif] Match external HTTP -> navigating to RichLanding');
                nav.navigate('RichLanding', { url: target });
            } catch (err) {
                console.warn('SHORTIFY LOG [MoENotif] ❌ navigate RichLanding failed, falling back:', err);
                deepLinkingService.handleDeepLink({ url: FALLBACK_URL });
            }
        }
        return;
    }

    // Unrecognised URL format — navigate home
    console.log('SHORTIFY LOG [MoENotif] Unrecognised URL format -> falling back to home');
    deepLinkingService.handleDeepLink({ url: FALLBACK_URL });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

class MoEngageNotificationHandler {
    constructor() {
        this._navigationRef = null;
        this._subscriptions = [];
        this._initialized = false;
    }

    /**
     * Initialise listeners. Call this once after both:
     *   1. MoEngage SDK has been initialized (moengageAnalytics.initialize())
     *   2. NavigationContainer is ready (App.js onReady callback)
     *
     * @param {React.RefObject} navigationRef — the root createNavigationContainerRef()
     */
    initialize(navigationRef) {
        if (Platform.OS === 'web') return;
        if (this._initialized) return;

        this._navigationRef = navigationRef;
        this._initialized = true;

        try {
            const m = require('react-native-moengage');
            const ReactMoE = m.default ?? m;

            if (!ReactMoE) {
                console.warn('SHORTIFY LOG [MoENotif] ⚠️ MoEngage module not available - no listeners registered');
                return;
            }

            // ── Push notification click ──────────────────────────────────────────
            // SDK v8+: addEventListener | Older SDK: setClickNotificationDelegate | Some builds: setEventListener
            if (typeof ReactMoE.addEventListener === 'function') {
                const pushSub = ReactMoE.addEventListener('pushClicked', (notification) => {
                    console.log('SHORTIFY LOG [MoENotif] 🔔 pushClicked received:', JSON.stringify(notification));
                    const url = extractUrl(notification?.data ?? notification?.payload ?? notification ?? {});
                    console.log('SHORTIFY LOG [MoENotif] pushClicked url extracted:', url);
                    handleUrl(url, this._navigationRef);
                });
                if (pushSub) this._subscriptions.push(pushSub);
                console.log('SHORTIFY LOG [MoENotif] ✅ pushClicked listener registered (addEventListener)');
            } else if (typeof ReactMoE.setClickNotificationDelegate === 'function') {
                ReactMoE.setClickNotificationDelegate((notification) => {
                    console.log('SHORTIFY LOG [MoENotif] 🔔 setClickNotificationDelegate triggered:', JSON.stringify(notification));
                    const url = extractUrl(notification?.data ?? notification?.payload ?? notification ?? {});
                    console.log('SHORTIFY LOG [MoENotif] delegate url extracted:', url);
                    handleUrl(url, this._navigationRef);
                });
                console.log('SHORTIFY LOG [MoENotif] ✅ push listener registered (setClickNotificationDelegate)');
            } else if (typeof ReactMoE.setEventListener === 'function') {
                // Older RN MoEngage SDK uses setEventListener
                ReactMoE.setEventListener('pushClicked', (notification) => {
                    console.log('SHORTIFY LOG [MoENotif] 🔔 pushClicked (setEventListener) received:', JSON.stringify(notification));
                    const url = extractUrl(notification?.data ?? notification?.payload ?? notification ?? {});
                    console.log('SHORTIFY LOG [MoENotif] pushClicked url extracted:', url);
                    handleUrl(url, this._navigationRef);
                });
                console.log('SHORTIFY LOG [MoENotif] ✅ push listener registered (setEventListener)');
            } else {
                console.warn('SHORTIFY LOG [MoENotif] ⚠️ No push click API found on MoEngage module');
            }

            // ── In-app message CTA click ─────────────────────────────────────────
            if (typeof ReactMoE.addEventListener === 'function') {
                const inAppSub = ReactMoE.addEventListener('inAppClicked', (inApp) => {
                    console.log('SHORTIFY LOG [MoENotif] 👆 inAppClicked received:', JSON.stringify(inApp));
                    const url = extractUrl(inApp?.action ?? inApp?.data ?? inApp ?? {});
                    console.log('SHORTIFY LOG [MoENotif] inApp url extracted:', url);
                    handleUrl(url, this._navigationRef);
                });
                if (inAppSub) this._subscriptions.push(inAppSub);
                console.log('SHORTIFY LOG [MoENotif] ✅ inAppClicked listener registered (addEventListener)');
            } else if (typeof ReactMoE.setEventListener === 'function') {
                // Older SDK: use setEventListener for in-app campaign clicks too
                ReactMoE.setEventListener('inAppCampaignClicked', (inAppInfo) => {
                    console.log('SHORTIFY LOG [MoENotif] 👆 inAppCampaignClicked (setEventListener) received:', JSON.stringify(inAppInfo));
                    const url = extractUrl(inAppInfo?.action ?? inAppInfo?.data ?? inAppInfo ?? {});
                    console.log('SHORTIFY LOG [MoENotif] inApp url extracted:', url);
                    handleUrl(url, this._navigationRef);
                });
                console.log('SHORTIFY LOG [MoENotif] ✅ inApp listener registered (setEventListener)');
            }

            // ── In-app self-handled click (older SDK API) ───────────────────────
            if (typeof ReactMoE.setInAppMessageActionListener === 'function') {
                ReactMoE.setInAppMessageActionListener((action) => {
                    console.log('SHORTIFY LOG [MoENotif] 👆 setInAppMessageActionListener triggered:', JSON.stringify(action));
                    const url = extractUrl({ url: action?.navigationType === 'url' ? action?.navigateUrl : null, ...action });
                    handleUrl(url, this._navigationRef);
                });
            }

            console.log('SHORTIFY LOG [MoENotif] ✅ All notification listeners registered');
        } catch (e) {
            console.warn('SHORTIFY LOG [MoENotif] ❌ Failed to register notification listeners:', e);
        }
    }

    /** Clean up all listeners (call on App unmount if needed). */
    cleanup() {
        this._subscriptions.forEach((sub) => {
            try {
                if (typeof sub?.remove === 'function') sub.remove();
                else if (typeof sub === 'function') sub();
            } catch (_) { }
        });
        this._subscriptions = [];
        this._initialized = false;
    }
}

const moengageNotificationHandler = new MoEngageNotificationHandler();
export default moengageNotificationHandler;
