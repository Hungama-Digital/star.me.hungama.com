import { Alert, Platform } from 'react-native';
// Lazy-load expo-linking to avoid NativeModule at bundle load
function getLinking() { return require('expo-linking'); }

/**
 * Path-based route definitions matching the deep link spec.
 * Each pattern can have path params (e.g. {id}, {term}, {plan_id}) and will receive query params separately.
 */
const ROUTE_PATTERNS = [
  // Tab roots
  { pattern: /^home\/?$/, route: 'home', pathParams: [] },
  { pattern: /^home\/banner\/([^/]+)\/?$/, route: 'home/banner', pathParams: ['bannerId'] },
  { pattern: /^home\/rail\/([^/]+)\/?$/, route: 'home/rail', pathParams: ['railId'] },
  { pattern: /^feeds\/?$/, route: 'feeds', pathParams: [] },
  { pattern: /^feeds\/reel\/([^/]+)\/?$/, route: 'feeds/reel', pathParams: ['reelId'] },
  { pattern: /^feeds\/promo\/([^/]+)\/?$/, route: 'feeds/promo', pathParams: ['promoId'] },
  { pattern: /^feeds\/trailer\/([^/]+)\/?$/, route: 'feeds/trailer', pathParams: ['trailerId'] },
  { pattern: /^watchlist\/?$/, route: 'watchlist', pathParams: [] },
  { pattern: /^watchlist\/show\/([^/]+)\/?$/, route: 'watchlist/show', pathParams: ['showId'] },
  { pattern: /^search\/?$/, route: 'search', pathParams: [] },
  { pattern: /^search\/category\/([^/]+)\/?$/, route: 'search/category', pathParams: ['categoryId'] },
  { pattern: /^search\/query\/([^/]+)\/?$/, route: 'search/query', pathParams: ['term'] },
  { pattern: /^play\/episode\/([^/]+)\/?$/, route: 'play/episode', pathParams: ['episodeId'] },
  { pattern: /^play\/show\/([^/]+)\/?$/, route: 'play/show', pathParams: ['showId'] },
  { pattern: /^play\/reel\/([^/]+)\/?$/, route: 'play/reel', pathParams: ['reelId'] },
  { pattern: /^play\/promo\/([^/]+)\/?$/, route: 'play/promo', pathParams: ['promoId'] },
  { pattern: /^play\/trailer\/([^/]+)\/?$/, route: 'play/trailer', pathParams: ['trailerId'] },
  { pattern: /^continue\/?$/, route: 'continue', pathParams: [] },
  // MoEngage notification spec routes
  { pattern: /^show\/([^/]+)\/?$/, route: 'show', pathParams: ['showId'] },
  { pattern: /^show\/?$/, route: 'show', pathParams: [] },
  { pattern: /^episode\/([^/]+)\/?$/, route: 'episode', pathParams: ['episodeId'] },
  { pattern: /^category\/([^/]+)\/?$/, route: 'category', pathParams: ['categoryId'] },
  { pattern: /^continue\/([^/]+)\/?$/, route: 'continue/show', pathParams: ['showId'] },
  { pattern: /^starme\/?$/, route: 'starme', pathParams: [] },
  { pattern: /^subscribe\/?$/, route: 'subscribe', pathParams: [] },
  { pattern: /^subscribe\/trial\/([^/]+)\/?$/, route: 'subscribe/trial', pathParams: ['plan_id'] },
  { pattern: /^profile\/?$/, route: 'profile', pathParams: [] },
  { pattern: /^profile\/subscription\/?$/, route: 'profile/subscription', pathParams: [] },
  { pattern: /^profile\/subscription\/manage\/?$/, route: 'profile/subscription/manage', pathParams: [] },
  { pattern: /^profile\/history\/?$/, route: 'profile/history', pathParams: [] },
  { pattern: /^profile\/rewards\/?$/, route: 'profile/rewards', pathParams: [] },
  { pattern: /^profile\/settings\/?$/, route: 'profile/settings', pathParams: [] },
  { pattern: /^rewards\/?$/, route: 'rewards', pathParams: [] },
  { pattern: /^rewards\/unlock\/([^/]+)\/?$/, route: 'rewards/unlock', pathParams: ['rewardId'] },
];

/** Query param names we care about (nav + attribution). All others are still included in params. */
const WELL_KNOWN_QUERY = [
  'entrySurface', 'skipAuth', 'autoplay', 'resumeTimestamp', 'startFrom', 'returnTo', 'referralSource',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid',
  'showId', 'episodeId', 'reelId', 'promoId', 'trailerId', 'categoryId', 'campaignId', 'bannerId', 'offerId', 'rewardId',
];

class DeepLinkingService {
  constructor() {
    this._linkingPrefix = null;
    this.subscribers = new Set();
    this._navigationRef = null;
    this._getAuthState = null;
    this._getSubscriptionState = null;
    this._initialURLProcessed = false;
    this._pendingInitialUrl = null;
    this._lastProcessedUrl = null;
    this._lastProcessedTime = 0;
    this._dedupeWindowMs = 4000;
    this._postLoginDeeplinkHandled = false;
    this._pendingParsed = null;
  }

  /** Store parsed deeplink when DeepLinkHandler had no nav ref so OTPVerificationScreen can reset + process. */
  setPendingParsed(parsed) {
    this._pendingParsed = parsed && typeof parsed === 'object' ? parsed : null;
  }

  /** Get and clear pending parsed (used by OTPVerificationScreen when nav was null in DeepLinkHandler). */
  getAndClearPendingParsed() {
    const p = this._pendingParsed;
    this._pendingParsed = null;
    return p || null;
  }

  /** Notify subscribers with already-parsed data (e.g. after post-login reset when link came from pendingDeepLinkRef). */
  processParsed(parsed) {
    if (parsed && typeof parsed === 'object' && this.subscribers) {
      this.notifySubscribers(parsed);
    }
  }

  /** Set when DeepLinkHandler has processed (or will process) a pending deeplink after login. AuthScreen uses this to skip reset. */
  setPostLoginDeeplinkHandled() {
    this._postLoginDeeplinkHandled = true;
  }

  /** Peek and clear. Returns true if post-login deeplink was handled so AuthScreen should not reset to MainTabs. */
  getAndClearPostLoginDeeplinkHandled() {
    const v = this._postLoginDeeplinkHandled;
    this._postLoginDeeplinkHandled = false;
    return v;
  }

  /** Store URL to process after user logs in (cold start when we show Login first). */
  setPendingInitialUrl(url) {
    this._pendingInitialUrl = url && typeof url === 'string' ? url.trim() : null;
  }

  /** Get and clear the pending initial URL (used after login to navigate to intended route). */
  getAndClearPendingInitialUrl() {
    const url = this._pendingInitialUrl;
    this._pendingInitialUrl = null;
    return url || null;
  }

  /** Peek at the pending initial URL without clearing it. */
  getPendingInitialUrl() {
    return this._pendingInitialUrl || null;
  }

  setNavigationRef(ref) {
    this._navigationRef = ref;
  }

  setAuthResolver(getAuthState) {
    this._getAuthState = getAuthState;
  }

  setSubscriptionResolver(getSubscriptionState) {
    this._getSubscriptionState = getSubscriptionState;
  }

  getLinkingPrefix() {
    if (this._linkingPrefix == null) this._linkingPrefix = getLinking().createURL('/');
    return this._linkingPrefix;
  }

  initialize() {
    const Linking = getLinking();
    const subscription = Linking.addEventListener('url', this.handleDeepLink.bind(this));
    Linking.getInitialURL().then((url) => {
      if (url) this._initialURL = url;
    });
    return subscription;
  }

  /** Call when navigation is ready to process the URL that opened the app (cold start). */
  processInitialURL() {
    if (this._initialURLProcessed) return;
    const urlToProcess = this._initialURL;
    if (urlToProcess && typeof urlToProcess === 'string' && urlToProcess.trim()) {
      this._initialURL = null;
      this._initialURLProcessed = true;
      this.handleDeepLink({ url: urlToProcess });
      return;
    }
    getLinking().getInitialURL().then((url) => {
      if (this._initialURLProcessed) return;
      if (url && typeof url === 'string' && url.trim()) {
        this._initialURL = null;
        this._initialURLProcessed = true;
        this.handleDeepLink({ url });
      }
    });
  }

  /** Process a specific URL (e.g. initial URL from AuthGate after guest login). Use so iOS gets same behavior as Android when opened from link. */
  processURL(url) {
    if (url && typeof url === 'string' && url.trim()) {
      this._initialURL = null;
      this._initialURLProcessed = true; // So processInitialURL won't process the same URL again
      this.handleDeepLink({ url: url.trim() });
    }
  }

  /**
   * Normalize URL to path + queryParams. Handles both app scheme (hmini://) and web (https://fasttv.app/).
   */
  _normalizeUrlToPathAndQuery(url) {
    if (typeof url !== 'string' || !url.trim()) return { path: '', queryParams: {} };
    let u = url.trim();
    if (/^(hmini|exp|[\w.-]+):\/\/\/+/.test(u)) {
      u = u.replace(/^(hmini|exp|[\w.-]+):\/\/\/+/, '$1://');
    }
    if (/^https?:\/\/[^/]*fasttv\.app(\/.*)?$/i.test(u)) {
      try {
        const parsed = new URL(u);
        const path = (parsed.pathname || '').replace(/^\//, '').trim();
        const queryParams = {};
        parsed.searchParams.forEach((v, k) => { queryParams[k] = v; });
        return { path, queryParams };
      } catch (_) {
        // fallback to Linking.parse
      }
    }
    const parsed = getLinking().parse(u);
    let path = (parsed.path || '').replace(/^\//, '').trim();
    if (parsed.hostname && path) {
      path = `${parsed.hostname}/${path}`;
    } else if (parsed.hostname) {
      path = parsed.hostname;
    }
    const queryParams = { ...(parsed.queryParams || {}) };
    return { path, queryParams };
  }

  /**
   * Parse path (no leading slash) and query params into a normalized route + pathParams + queryParams.
   * Supports legacy watch/ and query-style routes for backward compatibility.
   * Handles both hmini:// and https://fasttv.app/... URLs (e.g. when opened from browser).
   */
  parseDeepLink(url) {
    try {
      const { path, queryParams } = this._normalizeUrlToPathAndQuery(url);

      // Legacy: watch/{episodeId}
      if (path.startsWith('watch/')) {
        const episodeId = path.replace('watch/', '').split('/')[0];
        return {
          route: 'play/episode',
          pathParams: { episodeId },
          queryParams,
          fullUrl: url,
        };
      }

      // Legacy: asset/category/type/id (e.g. reels/video/123)
      const assetMatch = path.match(/^asset\/([^/]+)\/([^/]+)\/([^/]+)/);
      if (assetMatch) {
        const [, category, type, id] = assetMatch;
        if (category === 'reels' || category === 'series') {
          const route = category === 'reels' ? 'feeds/reel' : 'play/show';
          const pathParams = category === 'reels' ? { reelId: id } : { showId: id };
          return { route, pathParams, queryParams, fullUrl: url };
        }
      }

      // Path-based spec routes
      for (const { pattern, route, pathParams } of ROUTE_PATTERNS) {
        const match = path.match(pattern);
        if (match) {
          const pathParamsObj = {};
          pathParams.forEach((key, i) => {
            if (match[i + 1] != null) pathParamsObj[key] = decodeURIComponent(match[i + 1]);
          });
          return { route, pathParams: pathParamsObj, queryParams, fullUrl: url };
        }
      }

      // Legacy query-based: path as route name (e.g. "series", "episode")
      const firstSegment = path.split('/')[0] || path;
      if (firstSegment && !path.includes('/')) {
        const legacy = this._legacyRouteFromPath(firstSegment, queryParams);
        if (legacy) return { ...legacy, fullUrl: url };
      }

      return { route: null, pathParams: {}, queryParams, fullUrl: url };
    } catch (error) {
      console.error('Error parsing deep link:', error);
      return null;
    }
  }

  _legacyRouteFromPath(route, queryParams) {
    if (route === 'home') return { route: 'home', pathParams: {}, queryParams };
    if (route === 'search') return { route: 'search', pathParams: {}, queryParams };
    if (route === 'mylist') return { route: 'watchlist', pathParams: {}, queryParams };
    if (route === 'profile') return { route: 'profile', pathParams: {}, queryParams };
    if (route === 'settings') return { route: 'profile/settings', pathParams: {}, queryParams };
    if (route === 'subscription') return { route: 'subscribe', pathParams: {}, queryParams };
    if (route === 'reels' || route === 'foryou') return { route: 'feeds', pathParams: {}, queryParams };
    if (route === 'watchhistory') return { route: 'profile/history', pathParams: {}, queryParams };
    if (route === 'series' && (queryParams.id || queryParams.seriesId)) {
      return { route: 'play/show', pathParams: { showId: queryParams.id || queryParams.seriesId }, queryParams };
    }
    if (route === 'episode') {
      const episodeId = queryParams.episodeId;
      const showId = queryParams.seriesId || queryParams.showId;
      if (episodeId) {
        return { route: 'play/episode', pathParams: { episodeId, showId }, queryParams };
      }
    }
    if (route === 'watch' && queryParams.episodeId) {
      return { route: 'play/episode', pathParams: { episodeId: queryParams.episodeId }, queryParams };
    }
    return null;
  }

  handleDeepLink(event) {
    if (Platform.OS === 'web') {
      return;
    }
    const { url } = event;
    if (typeof url !== 'string' || !url.trim()) return;
    const u = url.trim();
    // Only handle our app's deep links. Ignore OAuth redirects (e.g. fbXXXX://authorize from Facebook login)
    // so they don't trigger "unknown URL -> navigate to Home" and cause a brief Home flash on Android.
    const isAppUrl = u.startsWith('hmini://') || /^https?:\/\/[^/]*fasttv\.app(\/|$)/i.test(u);
    if (!isAppUrl) {
      return;
    }
    // Dedupe: if we processed this exact URL very recently, skip. Prevents duplicate/late 'url' events
    // (e.g. Android re-sending intent) from triggering a second navigate that can throw and send user to Home.
    const now = Date.now();
    if (this._lastProcessedUrl === u && now - this._lastProcessedTime < this._dedupeWindowMs) {
      return;
    }
    const parsed = this.parseDeepLink(url);
    if (!parsed) {
      console.error('Failed to parse deep link:', url);
      return;
    }
    this._lastProcessedUrl = u;
    this._lastProcessedTime = now;
    this.notifySubscribers(parsed);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(deepLinkData) {
    this.subscribers.forEach((cb) => {
      try {
        cb(deepLinkData);
      } catch (err) {
        console.error('Error in deep link subscriber:', err);
      }
    });
  }

  /**
   * Build deep link URL from path and optional query params.
   * path: e.g. 'home', 'play/episode/ep_123', 'feeds/reel/reel_teaser_123'
   */
  createDeepLink(path, queryParams = {}) {
    const pathStr = path.replace(/^\//, '');
    const filtered = Object.fromEntries(
      Object.entries(queryParams).filter(([, v]) => v != null && v !== '')
    );
    const queryString = Object.keys(filtered)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(filtered[k]))}`)
      .join('&');
    const base = this._getShareableScheme();
    const fullPath = queryString ? `${pathStr}?${queryString}` : pathStr;
    return `${base}${fullPath}`;
  }

  /** Scheme for shareable links: always hmini:// (no triple slash). */
  _getShareableScheme() {
    const p = this.getLinkingPrefix() || '';
    if (p.startsWith('hmini:')) return 'hmini://';
    return p.replace(/\/\/\/+/, '//').replace(/\/+$/, '') || 'hmini://';
  }

  /** Build path for play episode (share / open). */
  pathForPlayEpisode(episodeId, options = {}) {
    const path = `play/episode/${encodeURIComponent(episodeId)}`;
    return this.createDeepLink(path, options);
  }

  /** Build path for play show (first episode). */
  pathForPlayShow(showId, options = {}) {
    const path = `play/show/${encodeURIComponent(showId)}`;
    return this.createDeepLink(path, options);
  }

  /** Build path for feeds reel/promo/trailer (view in feeds or play). */
  pathForFeedsReel(reelId, options = {}) {
    const path = `feeds/reel/${encodeURIComponent(reelId)}`;
    return this.createDeepLink(path, options);
  }

  pathForPlayReel(reelId, options = {}) {
    const path = `play/reel/${encodeURIComponent(reelId)}`;
    return this.createDeepLink(path, options);
  }

  pathForFeedsPromo(promoId, options = {}) {
    const path = `feeds/promo/${encodeURIComponent(promoId)}`;
    return this.createDeepLink(path, options);
  }

  pathForFeedsTrailer(trailerId, options = {}) {
    const path = `feeds/trailer/${encodeURIComponent(trailerId)}`;
    return this.createDeepLink(path, options);
  }

  pathForSeriesDetail(showId, options = {}) {
    const path = `play/show/${encodeURIComponent(showId)}`;
    return this.createDeepLink(path, options);
  }

  async shareDeepLink(route, params = {}) {
    const url = this.createDeepLink(route, params);
    const Linking = getLinking();
    try {
      if (Linking.shareAsync) {
        await Linking.shareAsync(url);
      } else if (Linking.share) {
        await Linking.share(url);
      } else {
        const { Clipboard } = await import('@react-native-clipboard/clipboard');
        await Clipboard.setString(url);
      }
    } catch (error) {
      console.error('Error sharing deep link:', error);
      try {
        const { Clipboard } = await import('@react-native-clipboard/clipboard');
        await Clipboard.setString(url);
      } catch (e) {
        console.error('Failed to copy to clipboard:', e);
      }
    }
  }

  async openDeepLink(url) {
    const Linking = getLinking();
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else require('../utils/errorReporting').reportErrorAlert('Error', 'Cannot open this link');
    } catch (error) {
      console.error('Error opening deep link:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to open link');
    }
  }
}

export default new DeepLinkingService();
