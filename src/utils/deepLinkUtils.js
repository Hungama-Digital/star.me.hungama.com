import deepLinkingService from '../services/deepLinkingService';

/** Path-based deep link builders per spec (e.g. /home, /play/episode/{id}, /feeds/reel/{id}) */
export const DeepLinkPatterns = {
  HOME: () => deepLinkingService.createDeepLink('home'),
  HOME_BANNER: (bannerId, query = {}) => deepLinkingService.createDeepLink(`home/banner/${encodeURIComponent(bannerId)}`, query),
  HOME_RAIL: (railId, query = {}) => deepLinkingService.createDeepLink(`home/rail/${encodeURIComponent(railId)}`, query),
  FEEDS: () => deepLinkingService.createDeepLink('feeds'),
  FEEDS_REEL: (reelId, query = {}) => deepLinkingService.pathForFeedsReel(reelId, query),
  FEEDS_PROMO: (promoId, query = {}) => deepLinkingService.pathForFeedsPromo(promoId, query),
  FEEDS_TRAILER: (trailerId, query = {}) => deepLinkingService.pathForFeedsTrailer(trailerId, query),
  WATCHLIST: () => deepLinkingService.createDeepLink('watchlist'),
  WATCHLIST_SHOW: (showId, query = {}) => deepLinkingService.createDeepLink(`watchlist/show/${encodeURIComponent(showId)}`, query),
  SEARCH: () => deepLinkingService.createDeepLink('search'),
  SEARCH_CATEGORY: (categoryId, query = {}) => deepLinkingService.createDeepLink(`search/category/${encodeURIComponent(categoryId)}`, query),
  SEARCH_QUERY: (term, query = {}) => deepLinkingService.createDeepLink(`search/query/${encodeURIComponent(term)}`, query),
  PLAY_EPISODE: (episodeId, query = {}) => deepLinkingService.pathForPlayEpisode(episodeId, query),
  PLAY_SHOW: (showId, query = {}) => deepLinkingService.pathForPlayShow(showId, query),
  PLAY_REEL: (reelId, query = {}) => deepLinkingService.pathForPlayReel(reelId, query),
  PLAY_PROMO: (promoId, query = {}) => deepLinkingService.createDeepLink(`play/promo/${encodeURIComponent(promoId)}`, query),
  PLAY_TRAILER: (trailerId, query = {}) => deepLinkingService.createDeepLink(`play/trailer/${encodeURIComponent(trailerId)}`, query),
  CONTINUE: (query = {}) => deepLinkingService.createDeepLink('continue', query),
  SUBSCRIBE: (query = {}) => deepLinkingService.createDeepLink('subscribe', query),
  SUBSCRIBE_TRIAL: (planId, query = {}) => deepLinkingService.createDeepLink(`subscribe/trial/${encodeURIComponent(planId)}`, query),
  PROFILE: () => deepLinkingService.createDeepLink('profile'),
  PROFILE_SUBSCRIPTION: (query = {}) => deepLinkingService.createDeepLink('profile/subscription', query),
  PROFILE_HISTORY: (query = {}) => deepLinkingService.createDeepLink('profile/history', query),
  PROFILE_REWARDS: (query = {}) => deepLinkingService.createDeepLink('profile/rewards', query),
  PROFILE_SETTINGS: (query = {}) => deepLinkingService.createDeepLink('profile/settings', query),
  REWARDS: (query = {}) => deepLinkingService.createDeepLink('rewards', query),
  REWARDS_UNLOCK: (rewardId, query = {}) => deepLinkingService.createDeepLink(`rewards/unlock/${encodeURIComponent(rewardId)}`, query),
  CUSTOM: (path, query = {}) => deepLinkingService.createDeepLink(path, query),
};

/** Share helpers that open share sheet with spec-style deep link URL */
export const shareContent = {
  series: (showId, _seriesTitle, query = {}) => deepLinkingService.shareDeepLink(`play/show/${encodeURIComponent(showId)}`, query),
  episode: (showId, episodeId, _episodeTitle, query = {}) => deepLinkingService.shareDeepLink(`play/episode/${encodeURIComponent(episodeId)}`, { ...query, showId }),
  reel: (reelId, query = {}) => deepLinkingService.shareDeepLink(`feeds/reel/${encodeURIComponent(reelId)}`, query),
  promo: (promoId, query = {}) => deepLinkingService.shareDeepLink(`feeds/promo/${encodeURIComponent(promoId)}`, query),
  trailer: (trailerId, query = {}) => deepLinkingService.shareDeepLink(`feeds/trailer/${encodeURIComponent(trailerId)}`, query),
  search: (query, q) => deepLinkingService.shareDeepLink('search', q != null ? { query: q, ...query } : query),
  profile: (userId, query = {}) => deepLinkingService.shareDeepLink('profile', { id: userId, ...query }),
};

/** Extract common params from parsed deep link (pathParams + queryParams) */
export const parseDeepLinkParams = {
  getSeriesId: (params) => params.showId || params.id || params.seriesId,
  getEpisodeId: (params) => params.episodeId,
  getReelId: (params) => params.reelId || params.promoId || params.trailerId,
  getSearchQuery: (params) => params.q || params.query || params.term,
  getUserId: (params) => params.id || params.userId,
};

export const validateDeepLink = (route, params) => {
  if (route === 'play/episode') return !!params.episodeId;
  if (route === 'play/show' || route === 'watchlist/show') return !!params.showId;
  if (route?.startsWith('feeds/reel') || route?.startsWith('play/reel')) return !!params.reelId;
  if (route?.startsWith('search/query')) return !!params.term;
  return true;
};

export const getAppScheme = () => deepLinkingService.getLinkingPrefix() || 'hmini://';

const WEB_DOMAIN = 'https://fasttv.app';

/** Web fallback URL using same path structure as app deep links */
export const createUniversalLink = (path, params = {}) => {
  const pathStr = path.replace(/^\//, '');
  const queryString = Object.keys(params)
    .filter((k) => params[k] != null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
  return queryString ? `${WEB_DOMAIN}/${pathStr}?${queryString}` : `${WEB_DOMAIN}/${pathStr}`;
};
