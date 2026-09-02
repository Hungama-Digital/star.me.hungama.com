import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../services/api';
import { useAuth } from './AuthContext';

const WatchHistoryContext = createContext();

export const WatchHistoryProvider = ({ children }) => {
    const { user } = useAuth();
    const [watchHistory, setWatchHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [historyVersion, setHistoryVersion] = useState(0);

    const fetchWatchHistory = useCallback(async () => {
        if (!user) {
            setWatchHistory([]);
            return;
        }

        setLoading(true);
        try {
            const authToken = await AsyncStorage.getItem('authToken');
            if (!authToken) {
                setWatchHistory([]);
                return;
            }
            const userId = user.userId || user.uid || user.profileId;
            if (!userId) {
                setWatchHistory([]);
                return;
            }

            const response = await API.getWatchHistory(userId);
            const decodedData = API.decodeJwtToken(response);

            if (decodedData && decodedData.data && Array.isArray(decodedData.data.data)) {
                const transformedHistory = decodedData.data.data.map((item) => {
                    // Extract episode number from title (e.g., "Title | EP 01" -> "01")
                    const episodeMatch = item.title ? item.title.match(/EP\s*(\d+)/i) : null;
                    const episodeNumber = episodeMatch ? episodeMatch[1] : '1';

                    let thumbnailImage = item.verticalFilePath || item.horizontalFilePath || item.vodOrLivePosterImageFilePath || item.thumbnail;

                    return {
                        id: item.path,
                        title: item.title,
                        assetTitle: item.title,
                        description: item.description,
                        videoUrl: item.hlsUrl,
                        assetUrl: item.hlsUrl,
                        // Format duration if needed, or keep as is
                        duration: item.duration,
                        watchedAt: item.created_id,
                        thumbnail: thumbnailImage,
                        seriesTitle: null,
                        episodeNumber: episodeNumber,
                        // Map fields for FeedGrid/TileDetails
                        path: item.path,
                        assetId: item.assetId,
                        assetGroupId: item.assetGroupId,
                        label: item.title,
                        genre: item.content_genre,
                        verticalFilePath: thumbnailImage,
                        horizontalFilePath: item.horizontalFilePath || thumbnailImage,
                        preview_url: item.hlsUrl,
                        hlsUrl: item.hlsUrl,
                        last_watched_asset_id: item.last_watched_asset_id,
                        last_watched_asset_duration: item.last_watched_asset_duration,
                        // Total episodes in series and watched count from API (for progress)
                        asset_count: item.asset_count ?? item.assetCount,
                        total_episode_watched_count: item?.total_episode_watched_count ?? item?.totalEpisodeWatchedCount,
                    };
                });
                setWatchHistory(transformedHistory);
            } else {
                setWatchHistory([]);
            }
        } catch (error) {
            console.error('Error fetching watch history:', error);
            setWatchHistory([]);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Initial fetch when user changes
    useEffect(() => {
        fetchWatchHistory();
    }, [fetchWatchHistory]);

    const addToHistory = useCallback(async (assetGroupId, assetId, duration) => {
        if (!user) return;
        try {
            const userId = user.userId || user.uid || user.profileId;
            const result = await API.createBookmark({
                userId,
                assetGroupId,
                assetId,
                duration
            });
            if (result && result.success !== false) {
                setHistoryVersion(v => v + 1);
            }
        } catch (error) {
            // createBookmark no longer throws; catch any unexpected error so playback is never blocked
            console.error('Failed to add to watch history:', error?.message || error);
        }
    }, [user]);

    const removeFromHistory = useCallback(async (assetGroupId) => {
        // Optimistic update
        setWatchHistory(prev => prev.filter(item => item.assetGroupId !== assetGroupId));

        try {
            await API.deleteWatchHistory({ assetGroupId });
            fetchWatchHistory();
            setHistoryVersion(v => v + 1);
        } catch (error) {
            console.error('Failed to delete from watch history:', error);
            // Revert if needed (fetching again is safer)
            fetchWatchHistory();
        }
    }, [fetchWatchHistory]);

    return (
        <WatchHistoryContext.Provider
            value={{
                watchHistory,
                loading,
                fetchWatchHistory,
                addToHistory,
                removeFromHistory,
                historyVersion
            }}
        >
            {children}
        </WatchHistoryContext.Provider>
    );
};

export const useWatchHistory = () => useContext(WatchHistoryContext);
