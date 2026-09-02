import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Animated,
  Alert,
  StatusBar,
} from 'react-native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSubscription } from '../context/SubscriptionContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const AdWatchModal = ({ visible, onClose, onAdComplete }) => {
  const { watchAd } = useSubscription();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(15); // 15 seconds for production
  const [isCompleted, setIsCompleted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false); // Prevent multiple completions

  const videoRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);
  const progressTimerRef = useRef(null);

  const AD_DURATION = 15; // 15 seconds for production

  useEffect(() => {
    if (visible) {
      resetAd();
      startAd();
    } else {
      cleanupAd();
    }

    return () => cleanupAd();
  }, [visible]);

  // Sync progress animation with progress state
  useEffect(() => {
    progressAnim.setValue(progress);
  }, [progress, progressAnim]);

  const resetAd = () => {
    setProgress(0);
    setTimeRemaining(AD_DURATION);
    setIsCompleted(false);
    setIsPlaying(false);
    setVideoError(false);
    setIsCompleting(false);
    progressAnim.setValue(0);
  };

  const startAd = () => {
    // Start the timer
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Don't call completeAd here, let the progress timer handle it
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Start progress animation
    progressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / AD_DURATION);
        if (newProgress >= 100) {
          completeAd();
          return 100;
        }
        // Update the animated value
        progressAnim.setValue(newProgress);
        return newProgress;
      });
    }, 1000);
  };

  const cleanupAd = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const completeAd = async () => {
    // Prevent multiple completions
    if (isCompleting || isCompleted) {
      return;
    }

    setIsCompleting(true);
    cleanupAd();
    setIsCompleted(true);

    try {
      // Call the watchAd function to earn coins
      const result = await watchAd();

      if (result && result.success) {
        // Show immediate success message with coin reward
        const remaining = result.remaining || 0;
        const coinsEarned = result.coinsEarned || 5;
        const fallbackNote = result.fallback ? ' (offline mode)' : '';

        Alert.alert(
          'Ad Completed! 🎉',
          `You earned ${coinsEarned} coins${fallbackNote}! You can watch ${remaining} more ads today.`,
          [
            {
              text: 'Great!',
              onPress: () => {
                onAdComplete(result);
                onClose();
              }
            }
          ]
        );
      } else {
        // Show error message
        require('../utils/errorReporting').reportErrorAlert(
          'Error',
          result?.message || 'Failed to process reward. Please try again.',
          [
            {
              text: 'OK',
              onPress: () => {
                onAdComplete(result);
                onClose();
              }
            }
          ]
        );
      }
    } catch (error) {
      require('../utils/errorReporting').reportErrorAlert(
        'Error',
        'Failed to process reward. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => {
              onAdComplete({ success: false, reason: 'error', message: 'An error occurred' });
              onClose();
            }
          }
        ]
      );
    }
  };

  const handleVideoLoad = () => {
    setIsPlaying(true);
  };

  const handleVideoError = (error) => {
    console.error('Video error:', error);
    setVideoError(true);
    // Continue with timer even if video fails
    setIsPlaying(true);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Watch Ad</Text>
            <Text style={styles.headerSubtitle}>Earn 5 coins</Text>
          </View>
        </View>

        {/* Video Container */}
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{ uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' }}
            style={styles.video}
            shouldPlay={true}
            isLooping={false}
            isMuted={false}
            resizeMode="contain"
            onLoad={handleVideoLoad}
            onError={handleVideoError}
            onPlaybackStatusUpdate={(status) => {
              if (status.isPlaying) {
                setIsPlaying(true);
              }
            }}
            useNativeControls={false}
            shouldCorrectPitch={true}
            volume={1.0}
          />

          {/* Video Overlay */}
          <View style={styles.videoOverlay}>
            {!isPlaying && !videoError && (
              <View style={styles.loadingContainer}>
                <Ionicons name="play-circle" size={80} color="#FFFFFF" />
              </View>
            )}
            {videoError && (
              <View style={styles.errorContainer}>
                <Ionicons name="image" size={80} color="#FFFFFF" />
                <Text style={styles.errorText}>Ad Content</Text>
                <Text style={styles.errorSubtext}>Please wait for the timer to complete</Text>
              </View>
            )}
          </View>
        </View>

        {/* Progress Section */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {isCompleted ? 'Ad Completed!' : 'Please watch the full ad'}
            </Text>
            <Text style={styles.timeText}>
              {isCompleted ? '0:00' : formatTime(timeRemaining)}
            </Text>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%']
                    })
                  }
                ]}
              />
            </View>
          </View>

          <Text style={styles.progressDescription}>
            {isCompleted
              ? 'Processing your reward...'
              : `Watch for ${AD_DURATION} seconds to earn coins`
            }
          </Text>
        </View>

        {/* Bottom Section */}
        <View style={styles.bottomSection}>
          <View style={styles.infoContainer}>
            <Ionicons name="information-circle" size={20} color="#FFD700" />
            <Text style={styles.infoText}>
              You must watch the complete ad to earn coins
            </Text>
          </View>

          {!isCompleted && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: '600',
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    margin: 20,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 20,
    textAlign: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  errorSubtext: {
    color: '#CCCCCC',
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  progressSection: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  progressText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timeText: {
    fontSize: 18,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  progressBarContainer: {
    marginBottom: 15,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },
  progressDescription: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomSection: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 10,
    textAlign: 'center',
    flex: 1,
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AdWatchModal; 