import deepLinkingService from '../services/deepLinkingService';

/**
 * Hook exposing deep link creation and share helpers for use in screens.
 * Incoming deep link navigation is handled by DeepLinkHandler (root).
 */
export const useDeepLinking = () => ({
  createDeepLink: deepLinkingService.createDeepLink.bind(deepLinkingService),
  shareDeepLink: deepLinkingService.shareDeepLink.bind(deepLinkingService),
  openDeepLink: deepLinkingService.openDeepLink.bind(deepLinkingService),
  getLinkingPrefix: deepLinkingService.getLinkingPrefix.bind(deepLinkingService),
  pathForPlayEpisode: deepLinkingService.pathForPlayEpisode.bind(deepLinkingService),
  pathForPlayShow: deepLinkingService.pathForPlayShow.bind(deepLinkingService),
  pathForFeedsReel: deepLinkingService.pathForFeedsReel.bind(deepLinkingService),
  pathForPlayReel: deepLinkingService.pathForPlayReel.bind(deepLinkingService),
  pathForFeedsPromo: deepLinkingService.pathForFeedsPromo.bind(deepLinkingService),
  pathForFeedsTrailer: deepLinkingService.pathForFeedsTrailer.bind(deepLinkingService),
  pathForSeriesDetail: deepLinkingService.pathForSeriesDetail.bind(deepLinkingService),
});
