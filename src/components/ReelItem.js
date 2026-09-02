import React, { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle, memo, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
    Dimensions,
    Animated,
    Platform,
    Image,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LikeIcon, SaveIcon, ShareIcon, EpisodesIcon } from './Icons';
import { safeGoBack } from '../utils/navigationUtils';
import { parseSrt, getCueTextAtTime, SUBTITLE_OFF } from '../utils/subtitleUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import InteractiveChip from './InteractiveChip';
import StoryChip from './StoryChip';
import SwitchAction from './SwitchAction';
import InteractiveChoiceModal from './InteractiveChoiceModal';
import BranchEpisodeSheet from './BranchEpisodeSheet';
import useChoicePointTrigger from '../hooks/useChoicePointTrigger';
import { useInteractiveShow } from '../context/InteractiveShowContext';
import { emitEpisodeSelection } from '../utils/episodeSelectionBus';

const { width: screenWidth, height: screenHeight } = Dimensions.get('screen');

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

const ReelItem = memo(forwardRef(({
    item,
    index,
    currentIndex,
    isPlaying,
    isSubscribed,
    videoResizeMode,
    handleScreenTap,
    handlePlayPause,
    handleLike,
    handleMyListToggle,
    handleDirectShare,
    navigation,
    insets,
    videoDataLength,
    allEpisodesData,
    detectedIsSeries,
    effectiveSeriesTitle,
    isTrailerMode,
    handleWatchSeries,
    isGuestUser,
    callToSubscribe,
    measureScrubBar,
    scrubPanResponder,
    progressAnim,
    scrubBarHeightAnim,
    isSeeking,
    pinchPanResponder,
    scaleAnim,
    showUI,
    showMetadataPopup,
    metadataAnimValue,
    likedVideos,
    isSaved,
    poster,
    genres,
    onPlaybackStatusUpdate,
    scrubberTrackRef,
    subtitles,
    selectedSubtitleLang,
    onOpenSubtitleMenu,
    showSubtitleMenuButton,
    onCurrentPlayerPlayingChange,
    // Interactive show props
    interactiveGraph,
    isInteractiveEnabled,
    showId,
    onBranchSelect,
}, ref) => {
    const isCurrentVideo = index === currentIndex;
    const subtitlesCuesRef = useRef([]);
    const [subtitleOverlayText, setSubtitleOverlayText] = useState('');
    /** Native playback truth for center icon (parent isPlaying can lag after OS pause / resume). */
    const [nativePlayingForUi, setNativePlayingForUi] = useState(false);
    const isMountedRef = useRef(true);

    // Interactive show state
    const isInteractiveShow = isInteractiveEnabled && !!interactiveGraph && !!item?.is_interactive;
    const interactiveCtx = useInteractiveShow();
    const [activeChoicePoint, setActiveChoicePoint] = useState(null);
    const [hasChosenLocal, setHasChosenLocal] = useState(false);
    const hasChosen = hasChosenLocal || !!(interactiveCtx?.currentBranchId);
    const [currentStoryNumberLocal, setCurrentStoryNumberLocal] = useState(1);
    const currentStoryNumber = useMemo(() => {
        const ctxBranchId = interactiveCtx?.currentBranchId;
        if (ctxBranchId && interactiveGraph?.choice_points?.[0]?.branches) {
            const idx = interactiveGraph.choice_points[0].branches.findIndex(b => b.id === ctxBranchId);
            if (idx >= 0) return idx + 1;
        }
        return currentStoryNumberLocal;
    }, [interactiveCtx?.currentBranchId, interactiveGraph, currentStoryNumberLocal]);
    const [showBranchSheet, setShowBranchSheet] = useState(false);
    const [isManualChoice, setIsManualChoice] = useState(false);
    const [introTooltipVisible, setIntroTooltipVisible] = useState(false);
    const introTooltipShownRef = useRef(false);
    const dotTooltipTimerRef = useRef(null);
    const [switchTooltipVisible, setSwitchTooltipVisible] = useState(false);
    const switchTooltipShownRef = useRef(false);
    const switchTooltipTimerRef = useRef(null);
    const [hidePlayPauseForSwitch, setHidePlayPauseForSwitch] = useState(false);
    const [currentPlaybackSec, setCurrentPlaybackSec] = useState(0);
    const [episodeEnded, setEpisodeEnded] = useState(false);

    /** Must be first effect so its cleanup runs last on unmount (see queueMicrotask handlers below). */
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Show intro tooltip once per show
    useEffect(() => {
        if (!isInteractiveShow || !isCurrentVideo || introTooltipShownRef.current || hasChosen) return;
        const storageKey = `interactive_intro_seen_${showId || 'default'}`;
        AsyncStorage.getItem(storageKey).then((val) => {
            if (val === '1' || !isMountedRef.current) return;
            introTooltipShownRef.current = true;
            setIntroTooltipVisible(true);
            const t = setTimeout(() => {
                if (isMountedRef.current) setIntroTooltipVisible(false);
                AsyncStorage.setItem(storageKey, '1').catch(() => {});
            }, 5000);
            return () => clearTimeout(t);
        }).catch(() => {});
    }, [isInteractiveShow, isCurrentVideo, hasChosen, showId]);

    // Show "Want a different story?" tooltip 6s after first story selection, for 6s
    useEffect(() => {
        if (!hasChosen || !isCurrentVideo || switchTooltipShownRef.current) return;
        switchTooltipShownRef.current = true;
        const showTimer = setTimeout(() => {
            if (!isMountedRef.current) return;
            setSwitchTooltipVisible(true);
            setHidePlayPauseForSwitch(true);
            switchTooltipTimerRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                    setSwitchTooltipVisible(false);
                    setHidePlayPauseForSwitch(false);
                }
            }, 6000);
        }, 1000);
        switchTooltipTimerRef.current = showTimer;
        return () => { if (switchTooltipTimerRef.current) clearTimeout(switchTooltipTimerRef.current); };
    }, [hasChosen, isCurrentVideo]);

    // Hide switch tooltip when user swipes away
    useEffect(() => {
        if (!isCurrentVideo) setSwitchTooltipVisible(false);
    }, [isCurrentVideo]);

    const handleChoicePointFired = useCallback((cp) => {
        if (!isMountedRef.current) return;
        setIsManualChoice(false);
        setActiveChoicePoint(cp);
        interactiveCtx?.setLastChoicePoint?.(cp);
        try { player.pause(); } catch (_) {}
    }, [interactiveCtx, player]);

    useChoicePointTrigger(
        isInteractiveShow ? interactiveGraph : null,
        item?.asset_id || item?.id,
        currentPlaybackSec,
        episodeEnded,
        handleChoicePointFired,
    );

    const handleChoiceSelect = useCallback((branchId) => {
        const branch = activeChoicePoint?.branches?.find(b => b.id === branchId);
        const storyNum = (activeChoicePoint?.branches?.findIndex(b => b.id === branchId) ?? 0) + 1;
        setActiveChoicePoint(null);
        setHasChosenLocal(true);
        setCurrentStoryNumberLocal(storyNum);
        interactiveCtx?.selectBranch?.(activeChoicePoint?.id, branchId, showId);
        if (branch?.to_asset_id) onBranchSelect?.(branch.to_asset_id, branch);
    }, [activeChoicePoint, interactiveCtx, showId, onBranchSelect]);

    const handleSwitchAction = useCallback(() => {
        const lastCp = interactiveCtx?.lastChoicePoint;
        if (lastCp) {
            setIsManualChoice(true);
            setActiveChoicePoint(lastCp);
        }
    }, [interactiveCtx]);

    const handleDotPress = useCallback(() => {
        if (dotTooltipTimerRef.current) clearTimeout(dotTooltipTimerRef.current);
        setIntroTooltipVisible(true);
        dotTooltipTimerRef.current = setTimeout(() => setIntroTooltipVisible(false), 4000);
    }, []);

    // Stable callback ref to avoid effect loops
    const onStatusUpdateRef = useRef(onPlaybackStatusUpdate);
    useEffect(() => {
        onStatusUpdateRef.current = onPlaybackStatusUpdate;
    }, [onPlaybackStatusUpdate]);

    // Load video for current + 1 adjacent item in each direction so the next episode
    // is already buffered before the user reaches it, eliminating the black screen on scroll.
    const isNearCurrent = Math.abs(index - currentIndex) <= 1;
    const player = useVideoPlayer(isNearCurrent ? item.videoUrl : null, (player) => {
        player.loop = false;
        // Auto-play only for the active video
        if (isCurrentVideo && isPlaying && (isSubscribed || isTrailerMode)) {
            player.play();
        }
    });

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        seek: (timeMs) => { try { player.currentTime = timeMs / 1000; } catch (_) {} },
        play: () => { try { player.play(); } catch (_) {} },
        pause: () => { try { player.pause(); } catch (_) {} },
        showChoiceModal: () => {
            const cp = interactiveGraph?.choice_points?.[0];
            if (cp) setActiveChoicePoint(cp);
        },
    }), [player, interactiveGraph]);

    // Load SRT cues when user selects a subtitle track (external URLs from assetlist API)
    useEffect(() => {
        subtitlesCuesRef.current = [];
        setSubtitleOverlayText('');
        if (!isCurrentVideo) return undefined;
        const lang = selectedSubtitleLang;
        if (!lang || lang === SUBTITLE_OFF) return undefined;
        const tracks = Array.isArray(subtitles) ? subtitles : [];
        const track = tracks.find(
            (t) => t?.language != null && String(t.language).toLowerCase() === String(lang).toLowerCase()
        );
        const url = track?.subtitleUrl;
        if (!url || typeof url !== 'string') return undefined;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) return;
                const text = await res.text();
                if (cancelled) return;
                subtitlesCuesRef.current = parseSrt(text);
            } catch (_) {
                if (!cancelled) subtitlesCuesRef.current = [];
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isCurrentVideo, item.id, selectedSubtitleLang, subtitles]);

    // Track playback status for progress bar via polling
    useEffect(() => {
        if (!isCurrentVideo) return;

        const interval = setInterval(() => {
            try {
                // Avoid reading from a released player (e.g. if scroll released it before this tick)
                const currentTimeSeconds = typeof player.currentTime === 'number' ? player.currentTime : 0;
                const durationSeconds = typeof player.duration === 'number' ? player.duration : 0;
                const status = {
                    positionMillis: currentTimeSeconds * 1000,
                    durationMillis: durationSeconds * 1000,
                    isPlaying: player.playing,
                    didJustFinish: false,
                };
                onStatusUpdateRef.current(status, item.id);
                if (isInteractiveShow) setCurrentPlaybackSec(currentTimeSeconds);

                let subText = '';
                try {
                    if (
                        selectedSubtitleLang &&
                        selectedSubtitleLang !== SUBTITLE_OFF &&
                        subtitlesCuesRef.current.length > 0
                    ) {
                        subText = getCueTextAtTime(subtitlesCuesRef.current, currentTimeSeconds);
                    }
                } catch (_) {}
                setSubtitleOverlayText((prev) => (prev === subText ? prev : subText));
            } catch (_) {
                // Player may have been released; skip this tick
            }
        }, 200); // ~5 updates per second is enough for a smooth scrub bar

        return () => {
            clearInterval(interval);
        };
    }, [isCurrentVideo, player, item.id, selectedSubtitleLang]); // Removed onPlaybackStatusUpdate from deps

    // Still detect end-of-playback so autoplay and bookmarking work
    useEffect(() => {
        if (!isCurrentVideo) return;

        const checkEndInterval = setInterval(() => {
            try {
                const durationSeconds = typeof player.duration === 'number' ? player.duration : 0;
                const currentTimeSeconds = typeof player.currentTime === 'number' ? player.currentTime : 0;
                if (durationSeconds <= 0) return;

                const isEndTriggerEpisode = isInteractiveShow &&
                    Array.isArray(interactiveGraph?.choice_points) &&
                    interactiveGraph.choice_points.some(
                        cp => cp.trigger_asset_id === (item?.id || item?.asset_id) &&
                              (cp.trigger_timestamp_sec === null || cp.trigger_timestamp_sec === undefined)
                    );

                // Fire choice modal at 76% of episode (dot is at 80%, fire just before it)
                if (isEndTriggerEpisode && currentTimeSeconds >= durationSeconds * 0.76) {
                    setEpisodeEnded(true);
                }

                // Non-trigger episodes: send didJustFinish at actual end for auto-advance
                if (!isEndTriggerEpisode && currentTimeSeconds >= durationSeconds - 0.1) {
                    const status = {
                        positionMillis: durationSeconds * 1000,
                        durationMillis: durationSeconds * 1000,
                        isPlaying: false,
                        didJustFinish: true,
                    };
                    onStatusUpdateRef.current(status, item.id);
                }
            } catch (_) {
                // Player may have been released; skip this tick
            }
        }, 500);

        return () => {
            clearInterval(checkEndInterval);
        };
    }, [isCurrentVideo, player, item.id, isInteractiveShow, interactiveGraph]); // Removed onPlaybackStatusUpdate from deps

    // Keep parent ref + overlay icon aligned with native playback. Defer setState: playingChange can
    // fire synchronously during native teardown (e.g. carousel back) and triggers "useInsertionEffect must not schedule updates".
    useEffect(() => {
        if (!isCurrentVideo) {
            queueMicrotask(() => {
                if (isMountedRef.current) setNativePlayingForUi(false);
            });
            return undefined;
        }
        let subscription;
        const applyPlaying = (next) => {
            queueMicrotask(() => {
                if (!isMountedRef.current) return;
                setNativePlayingForUi(next);
                onCurrentPlayerPlayingChange?.(next);
            });
        };
        try {
            applyPlaying(!!player.playing);
            subscription = player.addListener('playingChange', ({ isPlaying: playing }) => {
                applyPlaying(!!playing);
            });
        } catch (_) {}
        return () => {
            try {
                subscription?.remove();
            } catch (_) {}
        };
    }, [isCurrentVideo, player, onCurrentPlayerPlayingChange]);

    // Handle play/pause sync with global state
    useEffect(() => {
        try {
            if (isCurrentVideo) {
                if (isPlaying && (isSubscribed || isTrailerMode)) player.play();
                else player.pause();
            } else {
                player.pause();
            }
        } catch (_) {}
    }, [isPlaying, isCurrentVideo, isSubscribed, isTrailerMode, player]);

    // Sync mute state
    useEffect(() => {
        try {
            player.muted = !isCurrentVideo;
        } catch (_) {}
    }, [isCurrentVideo, player]);

    // Send initial status update when player is ready to ensure duration is available
    useEffect(() => {
        if (!isCurrentVideo || player.status !== 'readyToPlay') return;
        try {
            const status = {
                positionMillis: player.currentTime * 1000,
                durationMillis: player.duration * 1000,
                isPlaying: player.playing,
                didJustFinish: false,
            };
            onStatusUpdateRef.current(status, item.id);
        } catch (_) {}
    }, [player.status, isCurrentVideo, item.id]); // Removed onPlaybackStatusUpdate from deps

    // Auto-show choice modal when FlatList lands on a placeholder (no branch chosen yet)
    useEffect(() => {
        if (!item?.isPlaceholder || !isCurrentVideo) return;
        const cp = interactiveGraph?.choice_points?.[0];
        if (cp && !activeChoicePoint) setActiveChoicePoint(cp);
    }, [item?.isPlaceholder, isCurrentVideo, interactiveGraph?.choice_points]);

    if (item?.isPlaceholder) {
        return (
            <View style={[styles.videoContainer, { backgroundColor: '#000' }]}>
                <TouchableOpacity style={styles.backButton} onPress={() => safeGoBack(navigation)}>
                    <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
                </TouchableOpacity>
                {!!activeChoicePoint && (
                    <InteractiveChoiceModal
                        visible
                        choicePoint={activeChoicePoint}
                        previouslyChosenBranchId={interactiveCtx?.currentBranchId || null}
                        onSelect={handleChoiceSelect}
                        onDismiss={() => setActiveChoicePoint(null)}
                        episodes={allEpisodesData}
                    />
                )}
            </View>
        );
    }

    // Choice point ratio for split scrub bar — recomputes each render; currentPlaybackSec drives re-renders
    const cpRatio = (() => {
        if (!isInteractiveShow || !isCurrentVideo) return null;
        const cp = interactiveGraph?.choice_points?.find(
            c => c.trigger_asset_id === (item?.id || item?.asset_id),
        );
        if (!cp) return null;
        const dur = typeof player?.duration === 'number' && player.duration > 0 ? player.duration : 0;
        if (cp.trigger_timestamp_sec != null && dur > 0) {
            return Math.min(cp.trigger_timestamp_sec / dur, 0.95);
        }
        return 0.80;
    })();

    return (
        <View style={styles.videoContainer}>
            <View style={styles.pinchWrapper} {...(isCurrentVideo ? pinchPanResponder.panHandlers : {})}>
                <Animated.View style={[styles.pinchWrapper, { transform: [{ scale: isCurrentVideo ? scaleAnim : 1 }] }]}>
                    <TouchableWithoutFeedback onPress={handleScreenTap}>
                        <View style={styles.touchableVideoArea}>
                            <View style={styles.touchableVideoArea}>
                                <VideoView
                                    player={player}
                                    style={styles.video}
                                    contentFit={videoResizeMode}
                                    nativeControls={false}
                                />
                                {/* Tap overlay to ensure handleScreenTap works when controls are hidden */}
                                <TouchableOpacity
                                    style={StyleSheet.absoluteFill}
                                    onPress={handleScreenTap}
                                    activeOpacity={1}
                                />
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </Animated.View>
            </View>

            {/* Play/Pause Button Overlay */}
            {showUI && !hidePlayPauseForSwitch && (
                <TouchableOpacity
                    style={styles.playPauseButton}
                    onPress={handlePlayPause}
                    activeOpacity={0.8}
                >
                    <View style={styles.playPauseIconContainer}>
                        <Ionicons
                            name={isCurrentVideo && nativePlayingForUi ? "pause" : "play"}
                            size={32}
                            color="#FFFFFF"
                            style={isCurrentVideo && nativePlayingForUi ? {} : { marginLeft: 3 }}
                        />
                    </View>
                </TouchableOpacity>
            )}

            {/* Top Overlay */}
            {showUI && (
                <View style={[
                    styles.topOverlay,
                    Platform.OS === 'ios'
                        ? { paddingTop: Math.max(insets.top, 8) + 8 }
                        : { paddingTop: insets.top + 20 }
                ]}>
                    <View style={styles.topOverlayRow}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => safeGoBack(navigation)}
                        >
                            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                        {showSubtitleMenuButton && typeof onOpenSubtitleMenu === 'function' ? (
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={onOpenSubtitleMenu}
                                accessibilityLabel="Subtitles and options"
                            >
                                <Ionicons name="ellipsis-vertical" size={22} color="#FFFFFF" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>
            )}

            {!!subtitleOverlayText && isCurrentVideo && (
                <View style={styles.subtitleOverlay} pointerEvents="none">
                    <Text style={styles.subtitleText}>{subtitleOverlayText}</Text>
                </View>
            )}

            {/* Right Side Actions */}
            {showUI && (
                <View style={styles.rightActions}>
                    {isInteractiveShow && hasChosen ? (
                        <SwitchAction onPress={handleSwitchAction} />
                    ) : null}

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleLike(item.id)}
                    >
                        <View style={[styles.actionIconContainer, (item.isUserLikes === 1 || likedVideos.has(item.id)) && styles.likedIconContainer]}>
                            <LikeIcon filled={item.isUserLikes === 1 || likedVideos.has(item.id)} />
                        </View>
                        <Text style={styles.actionText}>Like</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleMyListToggle(item.id)}
                    >
                        <View style={[styles.actionIconContainer, isSaved && styles.savedIconContainer]}>
                            <SaveIcon filled={isSaved} />
                        </View>
                        <Text style={styles.actionText}>{isSaved ? 'Saved' : 'Save'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDirectShare(item)}
                    >
                        <View style={styles.actionIconContainer}>
                            <ShareIcon />
                        </View>
                        <Text style={styles.actionText}>Share</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => {
                            if (isInteractiveShow) {
                                setShowBranchSheet(true);
                                return;
                            }
                            // Ensure we pass the precise path and IDs used by the API
                            // Convert to string to avoid API failures if passed as number
                            const seriesPath = String(item.path || item.seriesId || item.assetGroupId || '2');
                            const sId = item.seriesId || item.assetGroupId || 1;

                            navigation.navigate('Episodes', {
                                seriesId: sId,
                                currentEpisode: item.episodeNumber || index + 1,
                                seriesData: item,
                                seriesTitle: effectiveSeriesTitle || item.seriesTitle,
                                poster: poster,
                                genres: genres,
                                path: seriesPath,
                                origin: 'Reels',
                                ...(Array.isArray(allEpisodesData) && allEpisodesData.length > 0
                                  ? { preloadedEpisodes: allEpisodesData }
                                  : {}),
                            });
                        }}
                    >
                        <View style={styles.actionIconContainer}>
                            <EpisodesIcon />
                        </View>
                        <Text style={styles.actionText}>Episodes</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Metadata Overlay */}
            {showMetadataPopup && (
                <Animated.View
                    style={[
                        styles.metadataContainer,
                        {
                            opacity: metadataAnimValue,
                            transform: [{ scale: metadataAnimValue }]
                        }
                    ]}
                    pointerEvents="box-none"
                >
                    <View style={styles.metadataContent} pointerEvents="box-none">
                        {detectedIsSeries && videoDataLength > 0 && (
                            <Text style={styles.episodeNumberText}>
                                {`Episode ${item?.episodeNumber || index + 1}/${videoDataLength || 0}`}
                            </Text>
                        )}
                        {detectedIsSeries && effectiveSeriesTitle && (
                            <Text style={styles.seriesNameText}>
                                {effectiveSeriesTitle}
                            </Text>
                        )}

                        {/* CTA Buttons */}
                        {(isTrailerMode || !isSubscribed) && (
                            <TouchableOpacity
                                style={styles.inlineWatchNowButton}
                                onPress={isTrailerMode ? handleWatchSeries : callToSubscribe}
                                activeOpacity={0.9}
                            >
                                <LinearGradient
                                    colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)']}
                                    style={styles.inlineWatchNowGradient}
                                >
                                    <Text style={styles.inlineWatchNowText}>
                                        {isTrailerMode ? (isSubscribed ? 'Watch Show' : 'Subscribe to Watch') : (isGuestUser ? 'Login to Watch' : 'Subscribe to Watch')}
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>
            )}

            {/* Scrubber Bar */}
            {showUI && (
                <View style={styles.scrubberContainer} pointerEvents="box-none">
                    <View
                        ref={isCurrentVideo ? scrubberTrackRef : undefined}
                        style={styles.scrubberTrack}
                        onLayout={isCurrentVideo ? measureScrubBar : undefined}
                        {...(isCurrentVideo ? scrubPanResponder.panHandlers : {})}
                    >
                        <View style={styles.scrubberTrackContainer} pointerEvents="box-none">
                            {cpRatio != null ? (
                                // Split bar for interactive show — dot overlaid outside pan responder
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    {/* Left segment: start → choice point */}
                                    <Animated.View style={[styles.splitSegment, { flex: cpRatio, height: scrubBarHeightAnim }]}>
                                        <AnimatedLinearGradient
                                            colors={['#A8E6FF', '#0081B5']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={[styles.scrubberProgress, {
                                                width: isCurrentVideo ? progressAnim.interpolate({
                                                    inputRange: [0, cpRatio],
                                                    outputRange: ['0%', '100%'],
                                                    extrapolate: 'clamp',
                                                }) : '0%',
                                            }]}
                                        />
                                    </Animated.View>
                                    {/* Visual dot placeholder — touch handled by overlay below */}
                                    <View style={styles.choicePointDot} />
                                    {/* Right segment: choice point → end */}
                                    <Animated.View style={[styles.splitSegment, { flex: 1 - cpRatio, height: scrubBarHeightAnim }]}>
                                        <AnimatedLinearGradient
                                            colors={['#A8E6FF', '#0081B5']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={[styles.scrubberProgress, {
                                                width: isCurrentVideo ? progressAnim.interpolate({
                                                    inputRange: [cpRatio, 1],
                                                    outputRange: ['0%', '100%'],
                                                    extrapolate: 'clamp',
                                                }) : '0%',
                                            }]}
                                        />
                                    </Animated.View>
                                </View>
                            ) : (
                                // Regular bar for non-interactive shows
                                <>
                                    <Animated.View style={[styles.scrubberBackground, { height: scrubBarHeightAnim }]}>
                                        <AnimatedLinearGradient
                                            colors={['#A8E6FF', '#0081B5']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={[styles.scrubberProgress, {
                                                width: isCurrentVideo ? progressAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: ['0%', '100%'],
                                                }) : '0%',
                                            }]}
                                        />
                                    </Animated.View>
                                    <Animated.View
                                        style={[styles.scrubberThumb, {
                                            left: isCurrentVideo ? progressAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0%', '100%'],
                                            }) : '0%',
                                            opacity: isSeeking ? 1 : 0,
                                        }]}
                                    />
                                </>
                            )}
                        </View>
                    </View>
                    {/* Tappable dot overlay — outside pan responder so touches register */}
                    {cpRatio != null && (
                        <View style={styles.dotTapContainer}>
                            <TouchableOpacity
                                onPress={handleDotPress}
                                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                                style={[styles.dotTapTarget, { left: `${(cpRatio * 100).toFixed(1)}%` }]}
                            />
                        </View>
                    )}
                </View>
            )}
            {/* Interactive show chip overlay — hides with controls */}
            {isInteractiveShow && isCurrentVideo && showUI ? (
                <View style={styles.interactivePlayerOverlay} pointerEvents="none">
                    <InteractiveChip size="small" />
                    {hasChosen ? <StoryChip storyNumber={currentStoryNumber} /> : null}
                </View>
            ) : null}

            {/* Intro tooltip — one-time, auto-dismisses in 5s */}
            {introTooltipVisible && isCurrentVideo && showUI ? (
                <View style={[styles.introTooltipContainer, {
                    right: cpRatio != null
                        ? Math.max(10, screenWidth - cpRatio * (screenWidth - 40) - 52)
                        : Math.max(10, screenWidth * 0.20 - 25),
                }]} pointerEvents="none">
                    <View style={styles.introTooltip}>
                        <Text style={styles.introTooltipText}>
                            Change the storyline by choosing your next path.
                        </Text>
                        <View style={styles.introTooltipArrow} />
                    </View>
                </View>
            ) : null}

            {/* Switch tooltip — "Want a different story?" shown 6s after choice, for 6s */}
            {switchTooltipVisible && isCurrentVideo && hasChosen && showUI ? (
                <View style={styles.switchTooltipContainer} pointerEvents="none">
                    <View style={styles.switchTooltip}>
                        <Text style={styles.switchTooltipText}>{'Want a different story?\nTap here.'}</Text>
                        <View style={styles.switchTooltipArrow} />
                    </View>
                </View>
            ) : null}

            {/* Interactive choice modal */}
            {isInteractiveShow && activeChoicePoint ? (
                <InteractiveChoiceModal
                    visible
                    choicePoint={activeChoicePoint}
                    previouslyChosenBranchId={interactiveCtx?.currentBranchId || null}
                    onSelect={handleChoiceSelect}
                    onDismiss={() => setActiveChoicePoint(null)}
                    disableAutoSelect={isManualChoice}
                    episodes={allEpisodesData}
                />
            ) : null}

            {/* Branch episode sheet */}
            {isInteractiveShow ? (
                <BranchEpisodeSheet
                    title={effectiveSeriesTitle}
                    poster={poster}
                    genres={genres}
                    episodes={allEpisodesData || []}
                    currentEpisodeIndex={index}
                    graph={interactiveGraph}
                    hasChosen={hasChosen}
                    activeBranchId={interactiveCtx?.currentBranchId || null}
                    choicePointEpisodeId={interactiveGraph?.choice_points?.[0]?.trigger_asset_id || null}
                    visible={showBranchSheet}
                    onClose={() => setShowBranchSheet(false)}
                    onEpisodePress={(globalIdx) => {
                        setShowBranchSheet(false);
                        emitEpisodeSelection({
                            origin: 'Reels',
                            videoData: allEpisodesData,
                            initialIndex: globalIdx,
                            path: item.path || item.seriesId || item.assetGroupId,
                        });
                    }}
                    onPlaceholderPress={() => {
                        setShowBranchSheet(false);
                        const cp = interactiveGraph?.choice_points?.[0];
                        if (cp) {
                            setIsManualChoice(true);
                            setActiveChoicePoint(cp);
                            interactiveCtx?.setLastChoicePoint?.(cp);
                        }
                    }}
                />
            ) : null}
        </View >
    );
}));

const styles = StyleSheet.create({
    videoContainer: {
        width: screenWidth,
        height: Platform.OS === 'ios' ? screenHeight + 1 : screenHeight,
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
    },
    pinchWrapper: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    video: {
        width: '100%',
        height: '100%',
        flex: 1,
    },
    touchableVideoArea: {
        width: '100%',
        height: '100%',
        flex: 1,
    },
    playPauseButton: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: [{ translateX: -35 }, { translateY: -35 }],
        zIndex: 999,
    },
    playPauseIconContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 35,
        width: 70,
        height: 70,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    topOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
    },
    topOverlayRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        width: '100%',
    },
    subtitleOverlay: {
        position: 'absolute',
        bottom: 200,
        left: 0,
        right: 0,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 600,
    },
    subtitleText: {
        color: '#FFFFFF',
        fontSize: 19,
        lineHeight: 26,
        fontWeight: '600',
        textAlign: 'center',
        width: '100%',
        alignSelf: 'center',
        textShadowColor: 'rgba(0,0,0,0.95)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    backButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 50,
        padding: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    rightActions: {
        position: 'absolute',
        right: 20,
        bottom: 120,
        alignItems: 'center',
        zIndex: 1000,
        gap: 10,
    },
    actionButton: {
        alignItems: 'center',
        minWidth: 40,
        minHeight: 57,
        justifyContent: 'center',
    },
    actionIconContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 50,
        padding: 11,
        alignItems: 'center',
        justifyContent: 'center',
        width: 50,
        height: 50,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    likedIconContainer: {
        // Only change icon color, not background
    },
    savedIconContainer: {
        // No background color for saved items to match original UI
    },
    actionText: {
        color: '#FFFFFF',
        fontSize: 10,
        marginTop: 4,
        fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
    },
    metadataContainer: {
        position: 'absolute',
        bottom: 120,
        left: 0,
        right: 120,
        paddingHorizontal: 20,
    },
    metadataContent: {
        backgroundColor: 'transparent',
        position: 'relative',
    },
    episodeNumberText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    seriesNameText: {
        color: '#ffffff79',
        fontSize: 15,
        fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    inlineWatchNowButton: {
        marginTop: 10,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        alignSelf: 'flex-start',
    },
    inlineWatchNowGradient: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        minHeight: 50,
        justifyContent: 'center',
    },
    inlineWatchNowText: {
        color: '#000000',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
    },
    scrubberContainer: {
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    scrubberTrack: {
        width: '100%',
        justifyContent: 'center',
        paddingHorizontal: 12,
        position: 'relative',
        paddingVertical: 2,
    },
    scrubberTrackContainer: {
        width: '100%',
        position: 'relative',
        justifyContent: 'center',
        minHeight: 15,
    },
    scrubberBackground: {
        width: '100%',
        height: 3,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 1.5,
        overflow: 'hidden',
    },
    scrubberProgress: {
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 1.5,
    },
    scrubberThumb: {
        position: 'absolute',
        top: '50%',
        marginTop: -5,
        marginLeft: -5,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FFFFFF',
        zIndex: 2,
    },
    choicePointDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.65)',
        zIndex: 2,
    },
    splitSegment: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 1.5,
        overflow: 'hidden',
    },
    dotTapContainer: {
        position: 'absolute',
        left: 12,
        right: 12,
        top: 0,
        bottom: 0,
    },
    dotTapTarget: {
        position: 'absolute',
        top: '50%',
        marginTop: -4,
        marginLeft: -4,
        width: 8,
        height: 8,
    },
    interactivePlayerOverlay: {
        position: 'absolute',
        bottom: 180,
        left: 16,
        zIndex: 800,
        gap: 6,
        flexDirection: 'column',
        alignItems: 'flex-start',
    },
    introTooltipContainer: {
        position: 'absolute',
        bottom: 105,
        right: 16,
        zIndex: 1100,
        maxWidth: 230,
    },
    introTooltip: {
        backgroundColor: 'rgba(20,20,20,0.88)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    introTooltipText: {
        color: '#FFFFFF',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'Arial',
        fontWeight: '500',
    },
    introTooltipArrow: {
        position: 'absolute',
        bottom: -8,
        right: 24,
        width: 0,
        height: 0,
        borderLeftWidth: 8,
        borderRightWidth: 8,
        borderTopWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: 'rgba(20,20,20,0.88)',
    },
    switchTooltipContainer: {
        position: 'absolute',
        right: 78,
        bottom: 435,
        zIndex: 900,
        alignItems: 'flex-end',
    },
    switchTooltip: {
        backgroundColor: 'rgba(20,20,20,0.88)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: 200,
    },
    switchTooltipText: {
        color: '#FFFFFF',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'Arial',
        fontWeight: '500',
    },
    switchTooltipArrow: {
        position: 'absolute',
        right: -8,
        top: '50%',
        marginTop: -6,
        width: 0,
        height: 0,
        borderTopWidth: 6,
        borderBottomWidth: 6,
        borderLeftWidth: 8,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: 'rgba(20,20,20,0.88)',
    },
});

export default ReelItem;
