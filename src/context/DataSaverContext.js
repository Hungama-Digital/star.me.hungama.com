import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DataSaverContext = createContext();

export const useDataSaver = () => {
  const context = useContext(DataSaverContext);
  if (!context) {
    throw new Error('useDataSaver must be used within a DataSaverProvider');
  }
  return context;
};

// Storage keys
const DATA_SAVER_SETTINGS_KEY = '@hungama_data_saver_enabled';
const MANUAL_QUALITY_KEY = '@hungama_manual_quality';
const VIDEO_POSITIONS_KEY = '@hungama_video_positions';
const PER_VIDEO_QUALITY_KEY = '@hungama_per_video_quality';

export const DataSaverProvider = ({ children }) => {
  const [isDataSaverEnabled, setIsDataSaverEnabled] = useState(false);
  const [manualQuality, setManualQuality] = useState('Auto');
  const [videoPositions, setVideoPositions] = useState({});
  const [perVideoQuality, setPerVideoQuality] = useState({});
  const [currentVideoId, setCurrentVideoId] = useState(null);

  // Load data saver setting from AsyncStorage on app start
  useEffect(() => {
    loadDataSaverSetting();
  }, []);

  // Load data saver setting from AsyncStorage
  const loadDataSaverSetting = useCallback(async () => {
    try {
      const [dataSaverSetting, manualQualitySetting, videoPositionsSetting, perVideoQualitySetting] = await Promise.all([
        AsyncStorage.getItem(DATA_SAVER_SETTINGS_KEY),
        AsyncStorage.getItem(MANUAL_QUALITY_KEY),
        AsyncStorage.getItem(VIDEO_POSITIONS_KEY),
        AsyncStorage.getItem(PER_VIDEO_QUALITY_KEY),
      ]);
      
      if (dataSaverSetting !== null) {
        setIsDataSaverEnabled(JSON.parse(dataSaverSetting));
      }
      
      if (manualQualitySetting !== null) {
        setManualQuality(JSON.parse(manualQualitySetting));
      }
      
      if (videoPositionsSetting !== null) {
        setVideoPositions(JSON.parse(videoPositionsSetting));
      }

      if (perVideoQualitySetting !== null) {
        setPerVideoQuality(JSON.parse(perVideoQualitySetting));
      }
    } catch (error) {
      console.error('Error loading data saver setting:', error);
    }
  }, []);

  // Save data saver setting to AsyncStorage
  const saveDataSaverSetting = useCallback(async (enabled) => {
    try {
      await AsyncStorage.setItem(DATA_SAVER_SETTINGS_KEY, JSON.stringify(enabled));
      setIsDataSaverEnabled(enabled);
    } catch (error) {
      console.error('Error saving data saver setting:', error);
    }
  }, []);

  // Save manual quality setting
  const saveManualQuality = useCallback(async (quality) => {
    try {
      await AsyncStorage.setItem(MANUAL_QUALITY_KEY, JSON.stringify(quality));
      setManualQuality(quality);
    } catch (error) {
      console.error('Error saving manual quality setting:', error);
    }
  }, []);

  // Save video position for a specific video
  const saveVideoPosition = useCallback(async (videoId, position) => {
    try {
      const newPositions = { ...videoPositions, [videoId]: position };
      setVideoPositions(newPositions);
      await AsyncStorage.setItem(VIDEO_POSITIONS_KEY, JSON.stringify(newPositions));
    } catch (error) {
      console.error('Error saving video position:', error);
    }
  }, [videoPositions]);

  // Get saved video position
  const getVideoPosition = useCallback((videoId) => {
    return videoPositions[videoId] || 0;
  }, [videoPositions]);

  // Clear video position (when video is finished or user seeks to beginning)
  const clearVideoPosition = useCallback(async (videoId) => {
    try {
      const newPositions = { ...videoPositions };
      delete newPositions[videoId];
      setVideoPositions(newPositions);
      await AsyncStorage.setItem(VIDEO_POSITIONS_KEY, JSON.stringify(newPositions));
    } catch (error) {
      console.error('Error clearing video position:', error);
    }
  }, [videoPositions]);

  // Set current video ID (called when starting to play a video)
  const setCurrentPlayingVideo = useCallback((videoId) => {
    setCurrentVideoId(videoId);
  }, []);

  // Save per-video quality setting
  const savePerVideoQuality = useCallback(async (videoId, quality) => {
    try {
      const newPerVideoQuality = { ...perVideoQuality, [videoId]: quality };
      setPerVideoQuality(newPerVideoQuality);
      await AsyncStorage.setItem(PER_VIDEO_QUALITY_KEY, JSON.stringify(newPerVideoQuality));
    } catch (error) {
      console.error('Error saving per-video quality setting:', error);
    }
  }, [perVideoQuality]);

  // Get per-video quality setting
  const getPerVideoQuality = useCallback((videoId) => {
    return perVideoQuality[videoId] || null;
  }, [perVideoQuality]);

  // Clear per-video quality setting (when video is finished or user switches to another video)
  const clearPerVideoQuality = useCallback(async (videoId) => {
    try {
      const newPerVideoQuality = { ...perVideoQuality };
      delete newPerVideoQuality[videoId];
      setPerVideoQuality(newPerVideoQuality);
      await AsyncStorage.setItem(PER_VIDEO_QUALITY_KEY, JSON.stringify(newPerVideoQuality));
    } catch (error) {
      console.error('Error clearing per-video quality setting:', error);
    }
  }, [perVideoQuality]);

  // Get video quality based on data saver setting, manual selection, and per-video settings
  const getVideoQuality = useCallback((videoId = null) => {
    const targetVideoId = videoId || currentVideoId;
    
    // First check if there's a per-video quality setting
    if (targetVideoId && perVideoQuality[targetVideoId]) {
      return perVideoQuality[targetVideoId];
    }
    
    // If data saver is enabled, override manual selection with Low quality
    if (isDataSaverEnabled) {
      return 'Low';
    }
    
    // Otherwise use manual quality selection
    return manualQuality;
  }, [isDataSaverEnabled, manualQuality, perVideoQuality, currentVideoId]);

  // Get video URL with quality parameter
  const getVideoUrlWithQuality = useCallback((baseUrl, videoId = null) => {
    if (!baseUrl) return baseUrl;
    
    const quality = getVideoQuality(videoId);
    
    // Add quality parameter to URL
    if (baseUrl.includes('?')) {
      return `${baseUrl}&quality=${quality.toLowerCase()}`;
    } else {
      return `${baseUrl}?quality=${quality.toLowerCase()}`;
    }
  }, [getVideoQuality]);

  // Get data usage estimate
  const getDataUsageEstimate = useCallback((videoId = null) => {
    const quality = getVideoQuality(videoId);
    const qualityInfo = {
      'Auto': '2.5 MB/min (1080p)',
      'Low': '0.5 MB/min (480p)',
      'Medium': '1.2 MB/min (720p)',
      'High': '2.5 MB/min (1080p)',
      'HD': '4.0 MB/min (1440p)',
      '4K': '8.0 MB/min (2160p)',
    };
    return qualityInfo[quality] || '2.5 MB/min (1080p)';
  }, [getVideoQuality]);

  const value = {
    isDataSaverEnabled,
    manualQuality,
    currentVideoId,
    saveDataSaverSetting,
    saveManualQuality,
    saveVideoPosition,
    getVideoPosition,
    clearVideoPosition,
    setCurrentPlayingVideo,
    savePerVideoQuality,
    getPerVideoQuality,
    clearPerVideoQuality,
    getVideoQuality,
    getVideoUrlWithQuality,
    getDataUsageEstimate,
  };

  return (
    <DataSaverContext.Provider value={value}>
      {children}
    </DataSaverContext.Provider>
  );
}; 