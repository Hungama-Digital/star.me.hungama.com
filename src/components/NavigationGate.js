import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useNavigation } from '../context/NavigationContext';
import LottieLoader from './LottieLoader';

// Hardcoded navigation menu (no API call needed)
const HARDCODED_NAVIGATION_DATA = [
  {
    title: 'Home',
    path: '1',
    icon: null,
    menuCategory: [],
  },
  {
    title: 'Feeds',
    path: '2',
    icon: null,
    menuCategory: [],
  },
  {
    // StarME entry point — centered create action (feature yourself in a show).
    title: 'StarME',
    path: 'starme',
    icon: null,
    menuCategory: [],
  },
  {
    title: 'Search',
    path: '6',
    icon: null,
    menuCategory: [],
  },
  {
    title: 'Profile',
    path: '5',
    icon: null,
    menuCategory: [],
  },
];

const NavigationGate = ({ children, navigation }) => {
  const { setNavigationData: setContextNavigationData } = useNavigation();
  const [navigationLoading, setNavigationLoading] = useState(true);
  const [localNavigationData, setLocalNavigationData] = useState(null);

  useEffect(() => {
    // Use hardcoded navigation data directly (no API call)
    console.log('NavigationGate: Using hardcoded navigation menu');
    setLocalNavigationData(HARDCODED_NAVIGATION_DATA);
    setContextNavigationData(HARDCODED_NAVIGATION_DATA);
    setNavigationLoading(false);
  }, [setContextNavigationData]);

  // Show loading spinner while loading navigation data
  if (navigationLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LottieLoader size="large" />
      </View>
    );
  }

  // Use hardcoded navigation data (always available)
  const navigationDataToUse = localNavigationData || HARDCODED_NAVIGATION_DATA;

  // If navigation data is available (either from API or defaults), render the children
  if (navigationDataToUse) {
    console.log('navigationData', localNavigationData);
    
    // Validate that children is a valid function
    if (!children || typeof children !== 'function') {
      console.error('NavigationGate: children is not a valid function:', children);
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Navigation Error</Text>
          <Text style={styles.errorSubtext}>Invalid navigation component</Text>
        </View>
      );
    }
    
    try {
      // Call children as a function with navigationData (which contains menuCategory arrays)
      return children({ navigationData: navigationDataToUse });
    } catch (error) {
      console.error('NavigationGate: Error rendering children:', error);
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Navigation Error</Text>
          <Text style={styles.errorSubtext}>{error.message}</Text>
        </View>
      );
    }
  }

  // Fallback: Use hardcoded navigation data if somehow we still don't have data
  console.warn('NavigationGate: No navigation data available, using hardcoded menu as last resort');
  try {
    return children({ navigationData: HARDCODED_NAVIGATION_DATA });
  } catch (error) {
    console.error('NavigationGate: Error rendering with default data:', error);
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Navigation Error</Text>
        <Text style={styles.errorSubtext}>{error.message}</Text>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 20,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default NavigationGate; 