import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import LazyImage from './LazyImage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import assetSharingService from '../services/assetSharingService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const AssetSharingModal = ({ 
  visible, 
  onClose, 
  asset,
  onShareSuccess 
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!asset) return null;

  const handleShare = async (platform = null) => {
    try {
      setIsSharing(true);
      
      const result = await assetSharingService.shareAsset(asset, platform);
      
      if (result.action === 'sharedAction') {
        Alert.alert('Success', `Asset shared successfully${platform ? ` to ${platform}` : ''}!`);
        
        // Track share success
        if (onShareSuccess) {
          onShareSuccess(asset, platform || 'general');
        }
        
        // Log analytics
        const analytics = assetSharingService.getShareAnalytics(asset, platform || 'general');
      }
      
      onClose();
    } catch (error) {
      console.error('Share failed:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', `Failed to share asset: ${error.message}`);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const result = await assetSharingService.copyAssetLink(asset);
      setCopiedLink(true);
      
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Copy link failed:', error);
    }
  };

  const handleShareFile = async () => {
    try {
      if (asset.filePath) {
        await assetSharingService.shareAssetFile(asset, asset.filePath);
      } else {
        Alert.alert('Info', 'File sharing not available for this asset type');
      }
    } catch (error) {
      console.error('File sharing failed:', error);
      require('../utils/errorReporting').reportErrorAlert('Error', 'File sharing not supported on this platform');
    }
  };

  const shareOptions = [
    {
      id: 'general',
      name: 'Share',
      icon: 'share-outline',
      color: '#007AFF',
      action: () => handleShare()
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: 'logo-whatsapp',
      color: '#25D366',
      action: () => handleShare('whatsapp')
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'logo-instagram',
      color: '#E4405F',
      action: () => handleShare('instagram')
    },
    {
      id: 'twitter',
      name: 'Twitter',
      icon: 'logo-twitter',
      color: '#1DA1F2',
      action: () => handleShare('twitter')
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: 'logo-facebook',
      color: '#1877F2',
      action: () => handleShare('facebook')
    },
    {
      id: 'copy',
      name: copiedLink ? 'Copied!' : 'Copy Link',
      icon: copiedLink ? 'checkmark-circle' : 'copy-outline',
      color: copiedLink ? '#34C759' : '#FF9500',
      action: handleCopyLink
    },
    {
      id: 'file',
      name: 'Share File',
      icon: 'document-outline',
      color: '#AF52DE',
      action: handleShareFile
    }
  ];

  const renderAssetPreview = () => {
    if (asset.thumbnail) {
      return (
        <LazyImage
          source={typeof asset.thumbnail === 'string' ? { uri: asset.thumbnail } : asset.thumbnail}
          style={styles.assetThumbnail}
          resizeMode="cover"
        />
      );
    }
    
    return (
      <View style={styles.assetPlaceholder}>
        <Ionicons name="image-outline" size={48} color="#8E8E93" />
        <Text style={styles.assetPlaceholderText}>{asset.type}</Text>
      </View>
    );
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
            <Text style={styles.headerTitle}>Share Asset</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* Asset Preview */}
          <View style={styles.assetPreview}>
            {renderAssetPreview()}
            <View style={styles.assetInfo}>
              <Text style={styles.assetName}>{asset.name || asset.type}</Text>
              {asset.description && (
                <Text style={styles.assetDescription} numberOfLines={2}>
                  {asset.description}
                </Text>
              )}
              <Text style={styles.assetType}>{asset.type}</Text>
            </View>
          </View>

          {/* Share Options */}
          <ScrollView style={styles.shareOptions} showsVerticalScrollIndicator={false}>
            <View style={styles.optionsGrid}>
              {shareOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.optionButton}
                  onPress={option.action}
                  disabled={isSharing}
                >
                  <View style={[styles.optionIcon, { backgroundColor: option.color }]}>
                    <Ionicons 
                      name={option.icon} 
                      size={24} 
                      color="white" 
                    />
                  </View>
                  <Text style={styles.optionName}>{option.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Asset Link Preview */}
          <View style={styles.linkPreview}>
            <Text style={styles.linkLabel}>Shareable Link:</Text>
            <Text style={styles.linkText} numberOfLines={2}>
              {assetSharingService.generateAssetLink(asset)}
            </Text>
          </View>

          {/* Loading State */}
          {isSharing && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingContent}>
                <Ionicons name="share-outline" size={32} color="#007AFF" />
                <Text style={styles.loadingText}>Sharing...</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: screenHeight * 0.8,
    minHeight: screenHeight * 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  closeButton: {
    padding: 4,
  },
  assetPreview: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
  },
  assetThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 16,
  },
  assetPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  assetPlaceholderText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  assetDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
    lineHeight: 20,
  },
  assetType: {
    fontSize: 12,
    color: '#007AFF',
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  shareOptions: {
    paddingHorizontal: 20,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  optionButton: {
    width: (screenWidth - 60) / 3,
    alignItems: 'center',
    marginBottom: 20,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionName: {
    fontSize: 12,
    color: '#000000',
    textAlign: 'center',
  },
  linkPreview: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
    marginBottom: 8,
  },
  linkText: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#007AFF',
    marginTop: 8,
    fontWeight: '500',
  },
});

export default AssetSharingModal; 