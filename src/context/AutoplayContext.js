import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AutoplayContext = createContext();

export const useAutoplay = () => {
  const context = useContext(AutoplayContext);
  if (!context) {
    throw new Error('useAutoplay must be used within an AutoplayProvider');
  }
  return context;
};

export const AutoplayProvider = ({ children }) => {
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Load autoplay setting from AsyncStorage on mount
  useEffect(() => {
    const loadAutoplaySetting = async () => {
      try {
        const savedSetting = await AsyncStorage.getItem('autoplayEnabled');
        if (savedSetting !== null) {
          setAutoplayEnabled(JSON.parse(savedSetting));
        }
      } catch (error) {
        console.error('Error loading autoplay setting:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAutoplaySetting();
  }, []);

  // Save autoplay setting to AsyncStorage when it changes
  const updateAutoplaySetting = async (enabled) => {
    try {
      setAutoplayEnabled(enabled);
      await AsyncStorage.setItem('autoplayEnabled', JSON.stringify(enabled));
    } catch (error) {
      console.error('Error saving autoplay setting:', error);
    }
  };

  const value = {
    autoplayEnabled,
    updateAutoplaySetting,
    isLoading,
  };

  return (
    <AutoplayContext.Provider value={value}>
      {children}
    </AutoplayContext.Provider>
  );
}; 