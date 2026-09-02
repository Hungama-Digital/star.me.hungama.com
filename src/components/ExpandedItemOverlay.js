import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableWithoutFeedback,
    TouchableOpacity,
    Dimensions,
    PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LazyImage from './LazyImage';
import { BlurView } from 'expo-blur';
import { Video } from 'expo-av';
import { SaveIcon } from './Icons';
import { useAuth } from '../context/AuthContext';
import { useMyList } from '../context/MyListContext';
import API from '../services/api';
import Toast from './Toast';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/** Best-effort trailer length from API when the player has not reported duration yet (ms). */
function parseTrailerDurationMsFromItem(it) {
    if (!it) return null;
    const ms = it.trailerDurationMs ?? it.durationMs ?? it.duration_millis;
    if (typeof ms === 'number' && ms > 0) return ms;
    const td = it.trailerDuration ?? it.trailer_duration;
    if (typeof td === 'number' && td > 0) {
        if (td >= 3600000 || td > 100000) return td;
        return td * 1000;
    }
    const d = it.duration ?? it.duration_seconds;
    if (typeof d === 'number' && d > 0 && d <= 86400) return d * 1000;
    return null;
}

const ExpandedItemOverlay = ({
    visible,
    item,
    layout,
    onClose,
    onWatchSeries,
    onAddToWatchList,
    onTrailerFirstComplete,
}) => {
    const { user, isGuestUser } = useAuth();
    const { addSeriesToMyList, removeSeriesFromMyList, isSeriesInMyList } = useMyList();
    // Determine image source
    const imageSource = item.verticalFilePath || item.posterImage || item.imageUrl || item.thumbnail;
    const trailerUrl = useMemo(() => {
        return (
            item.trailerUrl ||
            item.previewManifest ||
            item.trailerManifest ||
            item.previewUrl ||
            item.trailerUrl ||
            item.videoUrl ||
            null
        );
    }, [item]);
    const videoRef = useRef(null);
    const positionMillisRef = useRef(0);
    const durationMillisRef = useRef(0);
    const hasLoggedFirstCompleteRef = useRef(false);
    const scrubRef = useRef(null);
    const [isMuted, setIsMuted] = useState(true);
    const [positionMillis, setPositionMillis] = useState(0);
    const [durationMillis, setDurationMillis] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [scrubRatio, setScrubRatio] = useState(0);
    const [scrubMetrics, setScrubMetrics] = useState({ x: 0, width: 0 });
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');

    const path = item.path || item.id;
    // Save key for ExpandedItemOverlay is always the asset's own id (path).
    // This is consistent with TileDetailsScreen: both use asset id for save.
    // ReelsScreen uses series id separately — the two are independent.
    const saveKey = String(item.path || item.id || item.agdlmId || '');

    // Check saved status from context using the asset id
    const isSaved = saveKey ? isSeriesInMyList(saveKey) : false;



    useEffect(() => {
        if (!trailerUrl || !videoRef.current) return;
        if (visible) {
            videoRef.current.playAsync?.();
        } else {
            videoRef.current.pauseAsync?.();
            videoRef.current.setPositionAsync?.(0);
        }
    }, [visible, trailerUrl]);

    useEffect(() => {
        setPositionMillis(0);
        setDurationMillis(0);
        setScrubRatio(0);
        positionMillisRef.current = 0;
        durationMillisRef.current = 0;
        hasLoggedFirstCompleteRef.current = false;
    }, [trailerUrl]);

    useEffect(() => {
        if (visible && trailerUrl) {
            hasLoggedFirstCompleteRef.current = false;
        }
    }, [visible, trailerUrl]);

    const handlePlaybackStatusUpdate = useCallback((status) => {
        if (!status?.isLoaded) return;

        const prevPos = positionMillisRef.current;

        if (!isSeeking) {
            const p = status.positionMillis;
            const pos = typeof p === 'number' && p >= 0 ? p : 0;
            setPositionMillis(pos);
            positionMillisRef.current = pos;
        }
        const d = status.durationMillis;
        if (typeof d === 'number' && d > 0) {
            setDurationMillis(d);
            durationMillisRef.current = d;
        }

        if (!trailerUrl || typeof onTrailerFirstComplete !== 'function' || hasLoggedFirstCompleteRef.current) {
            return;
        }

        let trailerMs =
            typeof status.durationMillis === 'number' && status.durationMillis > 0
                ? status.durationMillis
                : durationMillisRef.current > 0
                    ? durationMillisRef.current
                    : 0;
        if (trailerMs <= 0) {
            const fb = parseTrailerDurationMsFromItem(item);
            if (fb != null) trailerMs = fb;
        }

        const posNow = !isSeeking
            ? typeof status.positionMillis === 'number' && status.positionMillis >= 0
                ? status.positionMillis
                : positionMillisRef.current
            : positionMillisRef.current;

        let loopCompleted = false;
        if (trailerMs > 0 && status.didJustFinish) {
            loopCompleted = true;
        } else if (!isSeeking && trailerMs > 0) {
            if (prevPos >= trailerMs * 0.85 && posNow < Math.min(trailerMs * 0.2, 2000)) {
                loopCompleted = true;
            }
        }

        if (loopCompleted && trailerMs > 0) {
            hasLoggedFirstCompleteRef.current = true;
            onTrailerFirstComplete(item, {
                trailerDuration: trailerMs,
                watchedDuration: trailerMs,
            });
        }
    }, [isSeeking, trailerUrl, item, onTrailerFirstComplete]);

    /** Prefer getStatusAsync at call time so close/swiped events are not stuck at 0 ms. */
    const resolvePlaybackMetrics = useCallback(async () => {
        let trailerDuration =
            typeof durationMillisRef.current === 'number' && durationMillisRef.current > 0
                ? durationMillisRef.current
                : 0;
        let watchedDuration =
            typeof positionMillisRef.current === 'number' && positionMillisRef.current >= 0
                ? positionMillisRef.current
                : 0;
        if (trailerUrl && videoRef.current) {
            try {
                const st = await videoRef.current.getStatusAsync?.();
                if (st?.isLoaded) {
                    if (typeof st.durationMillis === 'number' && st.durationMillis > 0) {
                        trailerDuration = st.durationMillis;
                        durationMillisRef.current = st.durationMillis;
                    }
                    if (typeof st.positionMillis === 'number' && st.positionMillis >= 0) {
                        watchedDuration = st.positionMillis;
                        positionMillisRef.current = st.positionMillis;
                    }
                }
            } catch (_) {
                // ignore
            }
        }
        if (trailerDuration <= 0) {
            const fb = parseTrailerDurationMsFromItem(item);
            if (fb != null) trailerDuration = fb;
        }
        return { trailerDuration, watchedDuration };
    }, [trailerUrl, item]);

    const emitClose = useCallback(() => {
        void (async () => {
            const metrics = await resolvePlaybackMetrics();
            onClose?.(metrics);
        })();
    }, [onClose, resolvePlaybackMetrics]);

    const measureScrubBar = useCallback(() => {
        if (!scrubRef.current) return;
        scrubRef.current.measureInWindow((x, y, width) => {
            if (width > 0) {
                setScrubMetrics({ x, width });
            }
        });
    }, []);

    useEffect(() => {
        if (visible) {
            requestAnimationFrame(measureScrubBar);
        }
    }, [visible, measureScrubBar]);

    const seekToPageX = useCallback((pageX) => {
        if (!durationMillis || !scrubMetrics.width) return;
        const ratio = Math.min(
            1,
            Math.max(0, (pageX - scrubMetrics.x) / scrubMetrics.width)
        );
        setScrubRatio(ratio);
        const seekTo = Math.floor(durationMillis * ratio);
        videoRef.current?.setPositionAsync?.(seekTo);
    }, [durationMillis, scrubMetrics]);

    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !!durationMillis,
        onMoveShouldSetPanResponder: () => !!durationMillis,
        onPanResponderGrant: (event) => {
            setIsSeeking(true);
            seekToPageX(event.nativeEvent.pageX);
        },
        onPanResponderMove: (event) => {
            seekToPageX(event.nativeEvent.pageX);
        },
        onPanResponderRelease: (event) => {
            seekToPageX(event.nativeEvent.pageX);
            setIsSeeking(false);
        },
        onPanResponderTerminate: () => {
            setIsSeeking(false);
        },
    }), [durationMillis, seekToPageX]);

    const playbackRatio = useMemo(() => {
        if (!durationMillis) return 0;
        return isSeeking ? scrubRatio : Math.min(1, positionMillis / durationMillis);
    }, [durationMillis, isSeeking, positionMillis, scrubRatio]);

    const handleSave = useCallback(async () => {
        if (!saveKey) {
            return;
        }

        const userId = user?.userId || user?.uid || null;
        if (isGuestUser || !userId) {
            setToastMessage('Please login to add to watchlist');
            setToastType('error');
            setToastVisible(true);
            return;
        }

        // Check saved status from context using asset id
        const isCurrentlySaved = isSeriesInMyList(saveKey);

        // Call centralized context functions (they handle API and optimistic updates)
        if (isCurrentlySaved) {
            const result = await removeSeriesFromMyList(saveKey, userId);
            if (!result.success) {
                setToastMessage('Failed to update My List');
                setToastType('error');
                setToastVisible(true);
            } else if (onAddToWatchList) {
                // Success: let parent show single app-level toast and close overlay (no duplicate toast here)
                onAddToWatchList(item, {
                    added: false,
                    playbackMetrics: await resolvePlaybackMetrics(),
                });
            }
        } else {
            const result = await addSeriesToMyList(saveKey, userId);
            if (!result.success) {
                setToastMessage('Failed to update My List');
                setToastType('error');
                setToastVisible(true);
            } else if (onAddToWatchList) {
                // Success: let parent show single app-level toast and close overlay (no duplicate toast here)
                onAddToWatchList(item, {
                    added: true,
                    playbackMetrics: await resolvePlaybackMetrics(),
                });
            }
        }
    }, [saveKey, user, isGuestUser, isSeriesInMyList, addSeriesToMyList, removeSeriesFromMyList, onAddToWatchList, item, resolvePlaybackMetrics]);

    // Calculate position and size to overlay at original position
    let cardStyle = {};
    if (layout) {
        // Scale factor
        const scale = 1.5;
        const scaledWidth = layout.width * scale;
        const scaledHeight = layout.height * scale;

        // Calculate position to center the scaled item over the original position
        let left = layout.pageX - (scaledWidth - layout.width) / 2;
        let top = layout.pageY - (scaledHeight - layout.height) / 2;

        // Clamp to screen bounds with margins
        // Use a larger bottom margin so the action buttons stay visible even
        // when the original card is near the bottom of the screen.
        const sideMargin = 10;
        const topMargin = 10;
        const bottomMargin = 160; // extra space for "Watch / Add to watch list" buttons

        const maxLeft = screenWidth - scaledWidth - sideMargin;
        let maxTop = screenHeight - scaledHeight - bottomMargin;
        // If content is taller than available height, fall back to top margin
        if (maxTop < topMargin) {
            maxTop = topMargin;
        }

        // Ensure card stays within screen bounds
        left = Math.max(sideMargin, Math.min(maxLeft, left));
        top = Math.max(topMargin, Math.min(maxTop, top));

        cardStyle = {
            position: 'absolute',
            top: top,
            left: left,
            width: scaledWidth,
        };
    } else {
        // Fallback to center
        cardStyle = {
            width: screenWidth * 0.75,
            alignSelf: 'center',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: [{ translateX: -screenWidth * 0.375 }, { translateY: -screenHeight * 0.25 }], // Adjust based on desired height/aspect ratio
        };
    }

    if (!item) {
        return null;
    }

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="none"
            onRequestClose={emitClose}
        >
            <TouchableWithoutFeedback onPress={emitClose}>
                <View style={styles.overlayContainer}>
                    <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />

                    <TouchableWithoutFeedback>
                        <View style={[styles.cardContainer, cardStyle]}>
                            {/* Main Image */}
                            <View style={styles.imageContainer}>
                                {trailerUrl ? (
                                    <Video
                                        ref={videoRef}
                                        source={{ uri: trailerUrl }}
                                        style={styles.video}
                                        resizeMode="cover"
                                        shouldPlay={visible}
                                        isLooping
                                        isMuted={isMuted}
                                        progressUpdateIntervalMillis={250}
                                        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                                    />
                                ) : imageSource ? (
                                    <LazyImage
                                        source={{ uri: imageSource }}
                                        style={styles.image}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={styles.placeholderImage}>
                                        <Ionicons name="image-outline" size={32} color="#666" />
                                    </View>
                                )}

                                {trailerUrl && (
                                    <View style={styles.mainView}>
                                        <TouchableOpacity
                                            style={styles.volumeButton}
                                            onPress={() => setIsMuted((prev) => !prev)}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons
                                                name={isMuted ? 'volume-mute' : 'volume-high'}
                                                size={22}
                                                color="#FFFFFF"
                                            />
                                        </TouchableOpacity>
                                        <View
                                            ref={scrubRef}
                                            style={styles.scrubContainer}
                                            onLayout={measureScrubBar}
                                            {...panResponder.panHandlers}
                                        >
                                            <View style={styles.scrubTrack} />
                                            <View style={[styles.scrubProgress, { width: `${playbackRatio * 100}%` }]} />
                                            <View style={[styles.scrubThumb, { left: `${playbackRatio * 100}%` }]} />
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Action Menu */}
                            <View style={styles.menuContainer}>
                                <TouchableOpacity
                                    style={styles.menuItem}
                                    onPress={() => {
                                        void (async () => {
                                            const metrics = await resolvePlaybackMetrics();
                                            if (onWatchSeries) {
                                                onWatchSeries(item, metrics);
                                            }
                                        })();
                                    }}
                                >
                                    <View style={styles.menuIconWrapper}>
                                        <Ionicons name="play" size={16} color="#FFF" />
                                    </View>
                                    <Text style={styles.menuText}>Watch Series</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.menuItem}
                                    onPress={handleSave}
                                >
                                    <View style={styles.menuIconWrapper}>
                                        <SaveIcon filled={isSaved} />
                                    </View>
                                    <Text style={styles.menuText}>
                                        {isSaved ? 'Remove from watch list' : 'Add to watch list'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
            {/* Toast outside card so it renders full-screen above the overlay */}
            <Toast
                visible={toastVisible}
                message={toastMessage}
                type={toastType}
                onHide={() => setToastVisible(false)}
            />
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlayContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    cardContainer: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.6,
        shadowRadius: 16,
        elevation: 15,
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 9 / 16,
        backgroundColor: '#2A2A2A',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    placeholderImage: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#333',
    },
    scrubContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 3,
        justifyContent: 'center',
    },
    scrubTrack: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    scrubProgress: {
        position: 'absolute',
        left: 0,
        height: 2,
        borderRadius: 2,
        backgroundColor: '#FFFFFF',
    },
    scrubThumb: {
        position: 'absolute',
        borderRadius: 6,
        backgroundColor: '#FFFFFF',
        marginLeft: -6,
    },
    volumeButton: {
        position: 'absolute',
        right: 10,
        bottom: 26,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#2A2229',
        borderWidth: 1,
        borderColor: '#2A2229',
        alignItems: 'center',
        justifyContent: 'center',
    },
    volumeIconContainer: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 16,
        padding: 4,
    },
    menuContainer: {
        paddingVertical: 4,
        backgroundColor: '#252525',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    menuIconWrapper: {
        marginRight: 8,
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuText: {
        fontFamily: 'Product Sans',
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '500',
    },
});

export default ExpandedItemOverlay;
