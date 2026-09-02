import { useEffect, useCallback } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import analyticsService from '../services/analytics';

// Custom hook for analytics
export const useAnalytics = () => {
  const navigation = useNavigation();
  const route = useRoute();

  // Initialize analytics on mount
  useEffect(() => {
    analyticsService.initialize();
  }, []);

  // Auto-track screen views
  useEffect(() => {
    if (route.name) {
      
    }
  }, [route.name]);

  // Auto-track navigation (screen views are handled globally in App)
  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e) => {
      const currentRoute = e.data.state.routes[e.data.state.index];
      const previousRoute = e.data.state.routes[e.data.state.index - 1];
      
      if (currentRoute && previousRoute) {
        analyticsService.logNavigation(previousRoute.name, currentRoute.name);
      }
    });

    return unsubscribe;
  }, [navigation]);


  const setUserProperties = useCallback((properties) => {
    analyticsService.setUserProperties(properties);
  }, []);

  const setUserId = useCallback((userId) => {
    analyticsService.setUserId(userId);
  }, []);

  const logCustomEvent = useCallback((eventName, parameters) => {
    analyticsService.logEvent(eventName, parameters);
  }, []);

  const trackUserLogin = useCallback((method) => analyticsService.logUserLogin(method), []);
  const trackUserSignUp = useCallback((method) => analyticsService.logUserSignUp(method), []);
  const trackVideoPlay = useCallback((videoId, videoTitle, category) => analyticsService.logVideoPlay(videoId, videoTitle, category), []);
  const trackVideoComplete = useCallback((videoId, videoTitle, duration) => analyticsService.logVideoComplete(videoId, videoTitle, duration), []);
  const trackEpisodeWatch = useCallback((seriesId, episodeId, episodeTitle) => analyticsService.logEpisodeWatch(seriesId, episodeId, episodeTitle), []);
  const trackSearch = useCallback((searchTerm, resultsCount) => analyticsService.logSearch(searchTerm, resultsCount), []);
  const trackAddToMyList = useCallback((contentId, contentType) => analyticsService.logAddToMyList(contentId, contentType), []);
  const trackRemoveFromMyList = useCallback((contentId, contentType) => analyticsService.logRemoveFromMyList(contentId, contentType), []);
  const trackShare = useCallback((contentId, contentType, shareMethod) => analyticsService.logShare(contentId, contentType, shareMethod), []);
  const trackSubscriptionOffer = useCallback((offerType, price) => analyticsService.logSubscriptionOffer(offerType, price), []);
  const trackSubscriptionPurchase = useCallback((planType, price, currency) => analyticsService.logSubscriptionPurchase(planType, price, currency), []);
  const trackError = useCallback((errorType, errorMessage, screenName) => analyticsService.logError(errorType, errorMessage, screenName), []);
  const trackContentImpression = useCallback((contentId, contentType, position) => analyticsService.logContentImpression(contentId, contentType, position), []);
  const trackContentClick = useCallback((contentId, contentType, position) => analyticsService.logContentClick(contentId, contentType, position), []);
  const trackSettingChange = useCallback((settingName, oldValue, newValue) => analyticsService.logSettingChange(settingName, oldValue, newValue), []);

  return {
    trackUserLogin,
    trackUserSignUp,
    trackVideoPlay,
    trackVideoComplete,
    trackEpisodeWatch,
    trackSearch,
    trackAddToMyList,
    trackRemoveFromMyList,
    trackShare,
    trackSubscriptionOffer,
    trackSubscriptionPurchase,
    trackError,
    trackContentImpression,
    trackContentClick,
    trackSettingChange,
    setUserProperties,
    setUserId,
    logCustomEvent,
    analyticsService,
  };
}; 