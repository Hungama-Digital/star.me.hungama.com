/**
 * Utility functions for working with navigation data and menuCategory extraction
 */

/**
 * Go back if there is history; otherwise navigate to Home.
 * Use for back buttons and hardware back so users never get stuck.
 * @param {object} navigation - React Navigation object (from props or useNavigation())
 */
export function safeGoBack(navigation) {
  if (!navigation) return;
  if (navigation.canGoBack && navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  if (navigation.navigate) {
    navigation.navigate('MainTabs', { screen: 'Home' });
  }
}

/**
 * Extract menuCategory data for a specific screen from navigation data
 * @param {Array} navigationData - The full navigation data array
 * @param {string} screenName - The name of the screen (e.g., 'Home', 'For You', 'My List')
 * @returns {Array} - Array of menuCategory items for the specified screen
 */
export const getMenuCategoryForScreen = (navigationData, screenName) => {
  if (!navigationData || !Array.isArray(navigationData)) {
    console.warn('getMenuCategoryForScreen: Invalid navigationData provided');
    return [];
  }

  // Find the navigation item for the specified screen
  const navItem = navigationData.find(item => 
    item.title === screenName || 
    item.name === screenName ||
    item.path === screenName
  );

  if (!navItem) {
    console.warn(`getMenuCategoryForScreen: No navigation item found for screen "${screenName}"`);
    return [];
  }

  if (!navItem.menuCategory || !Array.isArray(navItem.menuCategory)) {
    console.warn(`getMenuCategoryForScreen: No menuCategory data found for screen "${screenName}"`);
    return [];
  }

  console.log(`getMenuCategoryForScreen: Found ${navItem.menuCategory.length} menuCategory items for "${screenName}"`);
  return navItem.menuCategory;
};

/**
 * Get all available screen names from navigation data
 * @param {Array} navigationData - The full navigation data array
 * @returns {Array} - Array of screen names
 */
export const getAvailableScreenNames = (navigationData) => {
  if (!navigationData || !Array.isArray(navigationData)) {
    return [];
  }

  return navigationData.map(item => item.title || item.name || item.path).filter(Boolean);
};

/**
 * Check if a screen has menuCategory data
 * @param {Array} navigationData - The full navigation data array
 * @param {string} screenName - The name of the screen
 * @returns {boolean} - True if the screen has menuCategory data
 */
export const hasMenuCategoryData = (navigationData, screenName) => {
  const menuCategory = getMenuCategoryForScreen(navigationData, screenName);
  return menuCategory.length > 0;
};

/**
 * Get navigation item for a specific screen
 * @param {Array} navigationData - The full navigation data array
 * @param {string} screenName - The name of the screen
 * @returns {Object|null} - The navigation item or null if not found
 */
export const getNavigationItemForScreen = (navigationData, screenName) => {
  if (!navigationData || !Array.isArray(navigationData)) {
    return null;
  }

  return navigationData.find(item => 
    item.title === screenName || 
    item.name === screenName ||
    item.path === screenName
  );
}; 