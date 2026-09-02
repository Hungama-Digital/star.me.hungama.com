import { useState, useEffect } from 'react';
import { getMenuCategoryForScreen } from '../utils/navigationUtils';
import { useDataCache } from '../context/DataCacheContext';

/**
 * Custom hook to get menuCategory data for a specific screen
 * @param {string} screenName - The name of the screen (e.g., 'Home', 'For You', 'My List')
 * @param {Array} navigationData - The navigation data from NavigationGate
 * @returns {Object} - Object containing menuCategory data and loading state
 */
export const useMenuCategory = (screenName, navigationData) => {
  const { getCachedData, setCachedData } = useDataCache();
  const [menuCategoryData, setMenuCategoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigationData || !Array.isArray(navigationData)) {
      setIsLoading(false);
      return;
    }

    try {
      // Check if menuCategory data is cached for this screen
      const cacheKey = `menuCategory_${screenName}`;
      const cachedMenuData = getCachedData(cacheKey);
      
      if (cachedMenuData) {
        console.log(`useMenuCategory: Using cached menuCategory data for "${screenName}"`);
        setMenuCategoryData(cachedMenuData);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const menuData = getMenuCategoryForScreen(navigationData, screenName);
      
      // Cache the menuCategory data
      setCachedData(cacheKey, menuData);
      
      setMenuCategoryData(menuData);
      
      console.log(`useMenuCategory: Loaded ${menuData.length} menuCategory items for "${screenName}"`);
    } catch (err) {
      console.error(`useMenuCategory: Error loading menuCategory for "${screenName}":`, err);
      setError(err.message);
      setMenuCategoryData([]);
    } finally {
      setIsLoading(false);
    }
  }, [screenName, navigationData, getCachedData, setCachedData]);

  return {
    menuCategoryData,
    isLoading,
    error,
    hasData: menuCategoryData.length > 0
  };
}; 