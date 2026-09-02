import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import API from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStaticFooterContent } from '../constants/footerLinkContent';
import LottieLoader from './LottieLoader';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const FooterLinkModal = ({ visible, onClose, link }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible && link) {
      fetchFooterLinkContent();
    } else if (visible && !link) {
      setError('No link data provided');
      setLoading(false);
    }
  }, [visible, link]);

  // Clean HTML content for display
  const cleanHtmlContent = (htmlContent) => {
    if (!htmlContent) return '';
    
    // Remove HTML tags and decode HTML entities
    let cleanContent = htmlContent
      .replace(/<div>/g, '\n') // Replace div tags with newlines
      .replace(/<\/div>/g, '') // Remove closing div tags
      .replace(/<br>/g, '\n') // Replace br tags with newlines
      .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
      .replace(/&amp;/g, '&') // Decode HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n/g, '\n\n') // Remove extra blank lines
      .trim();
    
    return cleanContent;
  };

  const fetchFooterLinkContent = async () => {
    if (!link || !link.path) {
      setError('Invalid link data');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get the current auth token from AsyncStorage
      const token = await AsyncStorage.getItem('authToken');
      
      if (token) {
        // Set the auth token for API calls
        API.setAuthToken(token);
      } else {
        // Try to get a guest token if no auth token is available
        try {
          const guestTokenResponse = await API.getGuestToken();
          const guestToken = guestTokenResponse;
          API.setAuthToken(guestToken);
        } catch (guestError) {
          throw new Error('No authentication token available');
        }
      }
      
      // Call the getFooterLinkByPath API
      const response = await API.getFooterLinkByPath(link.path);
      
      // Handle JWT response if needed
      let linkData = response;
      if (typeof response === 'string') {
        try {
          const decodedResponse = API.decodeJwtToken(response);
          linkData = decodedResponse;
        } catch (decodeError) {
          // If JWT decode fails, try to use the response as is
          linkData = response;
        }
      }
      
      // Extract content from the response
      let extractedContent = 'Content not available';
      
      if (linkData?.data && Array.isArray(linkData.data) && linkData.data.length > 0) {
        // New response format with array
        const rawContent = linkData.data[0]?.description || linkData.data[0]?.content || 'Content not available';
        extractedContent = cleanHtmlContent(rawContent);
      } else if (linkData?.data?.content) {
        // Old response format
        extractedContent = cleanHtmlContent(linkData.data.content);
      } else if (linkData?.content) {
        extractedContent = cleanHtmlContent(linkData.content);
      } else if (linkData?.data?.description) {
        extractedContent = cleanHtmlContent(linkData.data.description);
      } else if (linkData?.description) {
        extractedContent = cleanHtmlContent(linkData.description);
      } else if (typeof linkData === 'string') {
        extractedContent = cleanHtmlContent(linkData);
      }

      // When API returns no content, show static content (same as Settings and login)
      if (!extractedContent || extractedContent === 'Content not available' || !extractedContent.trim()) {
        extractedContent = getStaticFooterContent(link.path) || 'Content not available';
      }
      
      setContent(extractedContent);
    } catch (error) {
      // On API error, show static content so user still sees Terms/Privacy/About Us
      const fallback = getStaticFooterContent(link.path);
      if (fallback) {
        setContent(fallback);
        setError(null);
      } else {
        let errorMessage = 'Failed to load content. Please try again.';
        if (error.message.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorMessage = 'Authentication error. Please login again.';
        } else if (error.message.includes('404') || error.message.includes('Not Found')) {
          errorMessage = 'Content not found. Please try again later.';
        } else if (error.message.includes('500') || error.message.includes('Server')) {
          errorMessage = 'Server error. Please try again later.';
        }
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setContent('');
    setError(null);
    setLoading(true);
    onClose();
  };



  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="fullScreen"
    >
      <View style={styles.fullScreenContainer}>
        {/* Header */}
        <View style={styles.fullScreenHeader}>
          <Text style={styles.fullScreenTitle}>{link?.title || 'Legal Information'}</Text>
          <TouchableOpacity style={styles.fullScreenCloseButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.fullScreenContent}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <LottieLoader size="large" />
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.fullScreenScrollView}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.fullScreenScrollContent}
            >
              {/* Content */}
              <Text style={styles.fullScreenContentText}>
                {content}
              </Text>
              
              {/* Footer */}
              <Text style={styles.fullScreenFooterText}>
                Content loaded successfully. Length: {content.length} characters.
              </Text>
            </ScrollView>
          )}
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
    padding: 20,
  },
  modalContainer: {
    width: screenWidth * 0.95,
    maxHeight: screenHeight * 0.85,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#007AFF',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentScrollView: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#333333',
    fontSize: 16,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    color: '#FF0000',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  simpleContentText: {
    color: '#000000',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  simpleFooterText: {
    color: '#666666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fullScreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#007AFF',
  },
  fullScreenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  fullScreenCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenContent: {
    flex: 1,
    padding: 20,
  },
  fullScreenScrollView: {
    flex: 1,
  },
  fullScreenScrollContent: {
    flexGrow: 1,
  },
  fullScreenContentText: {
    color: '#000000',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  fullScreenFooterText: {
    color: '#666666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});

export default FooterLinkModal; 