/**
 * MotionPreviewCard
 *
 * Absolutely-positioned video overlay that covers the card image when active.
 * The parent (FeedGrid / Slider) renders this INSIDE their image container
 * alongside the thumbnail — this component fills that container with the video.
 *
 * Controlled entirely via `isPreviewActive` prop.
 */

import React, {
    useEffect,
    useCallback,
    useState,
    useRef,
} from 'react';
import { StyleSheet, Animated } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const MotionPreviewCard = ({
    previewUrl,           // HLS / MP4 URL string
    cardId,               // Unique ID for debugging
    isPreviewActive,      // true = show & play, false = hide & pause
    isScreenFocused,      // false = force-stop
    videoOverlayStyle,    // Extra style (e.g. borderRadius matching parent)
}) => {
    const [videoError, setVideoError] = useState(false);
    const hasValidPreview = !!(previewUrl && !videoError);
    const shouldPlay = isPreviewActive && hasValidPreview && isScreenFocused !== false;

    // Smooth fade transition
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // --- Lazy Player Management ---
    // We only create the player when active. To allow for a 200ms fade-out animation,
    // we keep the player alive for 300ms after shouldPlay becomes false.
    const [keepPlayerAlive, setKeepPlayerAlive] = useState(false);
    const cleanupTimerRef = useRef(null);

    useEffect(() => {
        if (shouldPlay) {
            if (cleanupTimerRef.current) {
                clearTimeout(cleanupTimerRef.current);
                cleanupTimerRef.current = null;
            }
            setKeepPlayerAlive(true);
        } else {
            // Delay destruction to allow fade-out (200ms) to complete
            cleanupTimerRef.current = setTimeout(() => {
                setKeepPlayerAlive(false);
                cleanupTimerRef.current = null;
            }, 300);
        }
        return () => {
            if (cleanupTimerRef.current) {
                clearTimeout(cleanupTimerRef.current);
                cleanupTimerRef.current = null;
            }
        };
    }, [shouldPlay]);

    const player = useVideoPlayer(
        (hasValidPreview && (shouldPlay || keepPlayerAlive)) ? { uri: previewUrl } : null,
        (p) => {
            p.muted = true;
            p.loop = true;
        }
    );

    useEffect(() => {
        if (!player) return;
        try {
            if (shouldPlay) {
                player.muted = true;
                player.loop = true;
                player.play();
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500, // 500ms smooth fade in
                    useNativeDriver: true,
                }).start();
            } else {
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200, // Quick fade out
                    useNativeDriver: true,
                }).start(() => {
                    try { player.pause(); } catch (_) {}
                });
            }
        } catch {
            // ignore imperative errors
        }
    }, [shouldPlay, player, fadeAnim]);

    const handleError = useCallback((error) => {
        console.warn(`[MotionPreview] Video error for ${cardId}:`, error);
        setVideoError(true);
    }, [cardId]);

    if (!hasValidPreview || !player) return null;

    return (
        <Animated.View
            style={[
                StyleSheet.absoluteFill,
                styles.overlay,
                videoOverlayStyle,
                { opacity: fadeAnim },
            ]}
            pointerEvents="none"
        >
            <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
                allowsFullscreen={false}
                allowsPictureInPicture={false}
                onError={handleError}
            />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        zIndex: 10,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
});

export default MotionPreviewCard;
