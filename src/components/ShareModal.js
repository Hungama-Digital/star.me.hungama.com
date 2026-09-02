import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
  Alert,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ShareModal = ({ 
  visible, 
  onClose, 
  onShare, 
  video, 
  isSeries, 
  seriesData 
}) => {
  const videoTitle = isSeries && seriesData ? `${seriesData.title} - ${video?.title}` : (video?.title || 'Check out this amazing video!');
  const videoDescription = isSeries && seriesData ? seriesData.description : (video?.description || 'Watch this incredible content!');
  const creatorName = video?.creator || 'Unknown Creator';
  const shareUrl = `https://myshortreels.app/reel/${video?.id}`;
  
  const shareMessage = `${videoTitle} by ${creatorName}\n\n${videoDescription}\n\nShared from MyShortReels App\n\n${shareUrl}`;

  const shareOptions = [
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'logo-instagram',
      color: '#E4405F',
      hashtags: ['#MyShortReels', '#ShortVideos', '#Entertainment', '#Viral'],
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: 'logo-facebook',
      color: '#1877F2',
      hashtags: ['#MyShortReels', '#ShortVideos', '#Entertainment'],
    },
    {
      id: 'twitter',
      name: 'Twitter',
      icon: 'logo-twitter',
      color: '#1DA1F2',
      hashtags: ['#MyShortReels', '#ShortVideos', '#Entertainment'],
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: 'logo-whatsapp',
      color: '#25D366',
      hashtags: ['#MyShortReels', '#ShortVideos'],
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: 'paper-plane',
      color: '#0088CC',
      hashtags: ['#MyShortReels', '#ShortVideos'],
    },
    {
      id: 'general',
      name: 'More Options',
      icon: 'share-social',
      color: '#FFD700',
      hashtags: ['#MyShortReels', '#ShortVideos', '#Entertainment'],
    },
  ];

  const handleShareToPlatform = async (option) => {
    try {
      const platformMessage = shareMessage + `\n\n${option.hashtags.join(' ')}`;
      
      if (option.id === 'general') {
        // General share with all options using native Share API
        const shareOptions = {
          title: videoTitle,
          message: platformMessage,
          url: shareUrl,
        };

        const result = await Share.share(shareOptions, {
          dialogTitle: `Share to ${option.name}`,
        });

        if (result.action === Share.sharedAction) {
          // Share successful - no alert
          // Call analytics tracking
          if (onShare) {
            onShare(video, 'general');
          }
        }
      } else {
        // For specific platforms, use native Share API with platform-specific message
        const shareOptions = {
          title: videoTitle,
          message: platformMessage,
          url: shareUrl,
        };

        const result = await Share.share(shareOptions, {
          dialogTitle: `Share to ${option.name}`,
        });

        if (result.action === Share.sharedAction) {
          // Share successful - no alert
          // Call analytics tracking
          if (onShare) {
            onShare(video, option.name.toLowerCase());
          }
        }
      }
      
      onClose();
    } catch (error) {
      console.error(`Share to ${option.name} failed:`, error);
      require('../utils/errorReporting').reportErrorAlert('Error', `Failed to share to ${option.name}. Please try again.`);
    }
  };

  const handleCopyLink = async () => {
    try {
      // Use Expo clipboard
      await Clipboard.setStringAsync(shareUrl);
      
      Alert.alert('Success', 'Link copied to clipboard!');
      onClose();
    } catch (error) {
      console.error('Copy link failed:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'Failed to copy link. Please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Share Video</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Video Info */}
          <View style={styles.videoInfo}>
            <Text style={styles.videoTitle} numberOfLines={2}>
              {videoTitle}
            </Text>
            <Text style={styles.videoCreator}>
              by {creatorName}
            </Text>
          </View>

          {/* Share Options Grid */}
          <View style={styles.shareOptionsGrid}>
            {shareOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.shareOption}
                onPress={() => handleShareToPlatform(option)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[option.color, `${option.color}CC`]}
                  style={styles.shareOptionGradient}
                >
                  <Ionicons name={option.icon} size={28} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.shareOptionText}>{option.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Copy Link Button */}
          <TouchableOpacity
            style={styles.copyLinkButton}
            onPress={handleCopyLink}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#4CAF50', '#45A049']}
              style={styles.copyLinkGradient}
            >
              <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
              <Text style={styles.copyLinkText}>Copy Link</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 20,
    minHeight: screenHeight * 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 5,
  },
  videoInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    padding: 15,
    marginBottom: 25,
  },
  videoTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    lineHeight: 22,
  },
  videoCreator: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '500',
  },
  shareOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  shareOption: {
    width: (screenWidth - 60) / 3,
    alignItems: 'center',
    marginBottom: 20,
  },
  shareOptionGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  shareOptionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  copyLinkButton: {
    marginBottom: 15,
    borderRadius: 25,
    overflow: 'hidden',
  },
  copyLinkGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  copyLinkText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 15,
  },
  cancelButtonText: {
    color: '#999999',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ShareModal; 