import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const RateAppModal = ({ visible, onClose, onRateComplete, claimed = false }) => {
  const [rating, setRating] = useState(0);
  const [hasRated, setHasRated] = useState(false);
  const [storedRating, setStoredRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load stored rating when modal becomes visible
  useEffect(() => {
    if (visible) {
      loadStoredRating();
      // Reset local state when modal opens
      if (!claimed) {
        setRating(0);
        setHasRated(false);
        setIsSubmitting(false);
      }
    } else {
      // Reset state when modal closes
      setIsSubmitting(false);
    }
  }, [visible, claimed]);

  const loadStoredRating = async () => {
    try {
      const stored = await AsyncStorage.getItem('rate_app_rating');
      if (stored) {
        setStoredRating(parseInt(stored));
        if (claimed) {
          setRating(parseInt(stored));
        }
      }
    } catch (error) {
      console.error('Error loading stored rating:', error);
    }
  };

  const handleStarPress = (starIndex) => {
    if (claimed || isSubmitting) {
      return;
    }
    setRating(starIndex + 1);
  };

  const handleSubmitRating = async () => {
    if (claimed || isSubmitting) {
      return;
    }
    
    if (rating === 0) {
      Alert.alert('Please Rate', 'Please select a rating before submitting.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Call the onRateComplete callback
      const success = await onRateComplete(rating);
      
      if (success) {
        // If successful, show success message and then close
        setHasRated(true);
        Alert.alert(
          'Reward Claimed! 🎉',
          `You earned 50 coins for rating our app ${rating} star${rating > 1 ? 's' : ''}! Thank you for your feedback!`,
          [
            {
              text: 'Great!',
              onPress: () => {
                onClose(); // Close the modal after user acknowledges
              },
            },
          ]
        );
        
        // Auto-close the modal after 3 seconds as a fallback
        setTimeout(() => {
          onClose();
        }, 3000);
      } else {
        // If failed, reset submitting state and show error
        setIsSubmitting(false);
        Alert.alert('Already Claimed', 'You have already claimed the rate app reward.', [
          {
            text: 'OK',
            onPress: () => {
              // Allow user to close the modal after seeing the error
              onClose();
            },
          },
        ]);
      }
    } catch (error) {
      setIsSubmitting(false);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to submit rating. Please try again.');
    }
  };

  const handleClose = () => {
    if (isSubmitting) {
      // Don't allow closing while submitting
      return;
    }
    
    if (claimed) {
      // If already claimed, just close without prompt
      onClose();
      return;
    }
    
    // If user has selected stars but not submitted, ask for confirmation
    if (rating > 0 && !hasRated) {
      Alert.alert(
        'Rate Our App',
        'Please submit your rating to earn coins. Your feedback helps us improve!',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Submit Rating',
            onPress: () => {
              // Don't close, let user submit
            },
          },
        ]
      );
      return;
    }
    
    // Otherwise, close normally
    onClose();
  };

  const renderStars = () => {
    const stars = [];
    
    for (let i = 0; i < 5; i++) {
      const isStarFilled = i < (claimed ? storedRating : rating);
      
      stars.push(
        <TouchableOpacity
          key={i}
          style={[styles.starContainer, (claimed || isSubmitting) && styles.starContainerDisabled]}
          onPress={() => handleStarPress(i)}
          activeOpacity={(claimed || isSubmitting) ? 1 : 0.7}
          disabled={claimed || isSubmitting}
        >
          <Ionicons
            name={isStarFilled ? 'star' : 'star-outline'}
            size={40}
            color={isStarFilled ? '#FFD700' : '#888888'}
            style={styles.star}
          />
        </TouchableOpacity>
      );
    }
    return stars;
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={isSubmitting ? undefined : handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#1a1a1a', '#2d2d2d', '#1a1a1a']}
            style={styles.modalGradient}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {claimed ? 'App Rating' : 'Rate Our App'}
              </Text>
              <Text style={styles.subtitle}>
                {claimed 
                  ? 'You have already rated and claimed your reward for this app.'
                  : 'How would you rate your experience?'
                }
              </Text>
            </View>

            {/* Stars */}
            <View style={styles.starsContainer}>
              {renderStars()}
            </View>

            {/* Rating Text */}
            {(rating > 0 || (claimed && storedRating > 0)) && (
              <View style={styles.ratingTextContainer}>
                <Text style={styles.ratingText}>
                  {claimed ? 'Your Rating: ' : ''}
                  {(claimed ? storedRating : rating) === 1 && 'Poor'}
                  {(claimed ? storedRating : rating) === 2 && 'Fair'}
                  {(claimed ? storedRating : rating) === 3 && 'Good'}
                  {(claimed ? storedRating : rating) === 4 && 'Very Good'}
                  {(claimed ? storedRating : rating) === 5 && 'Excellent!'}
                  {claimed && storedRating === 0 && 'Not specified'}
                </Text>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (rating === 0 || claimed || isSubmitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitRating}
              disabled={rating === 0 || claimed || isSubmitting}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={claimed ? ['#666666', '#888888'] : (rating > 0 ? ['#FFD700', '#FFA500'] : ['#666666', '#888888'])}
                style={styles.submitGradient}
              >
                <Ionicons
                  name={claimed ? 'checkmark-circle' : (isSubmitting ? 'hourglass' : 'star')}
                  size={20}
                  color={claimed ? '#cccccc' : (rating > 0 ? '#1a1a1a' : '#cccccc')}
                />
                <Text
                  style={[
                    styles.submitButtonText,
                    (rating === 0 || claimed || isSubmitting) && styles.submitButtonTextDisabled,
                  ]}
                >
                  {claimed ? 'Already Claimed ✓' : (isSubmitting ? 'Submitting...' : 'Submit Rating')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <Text style={[styles.closeButtonText, isSubmitting && styles.closeButtonTextDisabled]}>
                Close
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.9,
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalGradient: {
    padding: 30,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#cccccc',
    textAlign: 'center',
    lineHeight: 22,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  starContainer: {
    marginHorizontal: 8,
    padding: 5,
  },
  starContainerDisabled: {
    opacity: 0.8,
  },
  star: {
    textShadowColor: 'rgba(255, 215, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  ratingTextContainer: {
    marginBottom: 25,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFD700',
    textAlign: 'center',
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    width: '100%',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  submitButtonTextDisabled: {
    color: '#cccccc',
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  closeButtonText: {
    color: '#888888',
    fontSize: 16,
    fontWeight: '500',
  },
  closeButtonTextDisabled: {
    color: '#666666',
  },
});

export default RateAppModal; 