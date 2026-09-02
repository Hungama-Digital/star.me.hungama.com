import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  BackHandler,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieLoader from '../components/LottieLoader';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStaticFooterContent } from '../constants/footerLinkContent';


const FooterLinkDetailScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  
  const { link } = route.params || {};

  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);

  useEffect(() => {
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
              console.error('Failed to get guest token:', guestError);
              throw new Error('No authentication token available');
            }
          }
          
          // Call the getFooterLinkByPath API
          const response = await API.getFooterLinkByPath(link.path);
          
          // Handle JWT response if needed
          let linkData = response;
          if (typeof response === 'string') {
            const decodedResponse = API.decodeJwtToken(response);
            linkData = decodedResponse;
          }
          
          // Extract content from the response
          let extractedContent = 'Content not available';
          
          if (linkData?.data && Array.isArray(linkData.data) && linkData.data.length > 0) {
            // New response format with array
            extractedContent = linkData.data[0]?.description || linkData.data[0]?.content || 'Content not available';
          } else if (linkData?.data?.content) {
            // Old response format
            extractedContent = linkData.data.content;
          } else if (linkData?.content) {
            extractedContent = linkData.content;
          } else if (linkData?.data?.description) {
            extractedContent = linkData.data.description;
          } else if (linkData?.description) {
            extractedContent = linkData.description;
          }

          // When API returns no content, show static content (same as login screen fallback)
          if (!extractedContent || extractedContent === 'Content not available' || !extractedContent.trim()) {
            extractedContent = getStaticFooterContent(link.path) || 'Content not available';
          }
          
          setContent(extractedContent);
                } catch (error) {
          // On API error, show static content so user still sees Terms/Privacy/About Us (same as login flow)
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

    fetchFooterLinkContent();
  }, [link, user]);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <LottieLoader size="large" />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ffffff" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
                        onPress={() => {
              setLoading(true);
              setError(null);
              // Re-fetch content
              const fetchContent = async () => {
                try {
                  const token = await AsyncStorage.getItem('authToken');
                  
                  if (token) {
                    API.setAuthToken(token);
                  } else {
                    // Try to get a guest token if no auth token is available
                    const guestTokenResponse = await API.getGuestToken();
                    const guestToken = guestTokenResponse;
                    API.setAuthToken(guestToken);
                  }
                  
                  const response = await API.getFooterLinkByPath(link.path);
                  
                  let linkData = response;
                  if (typeof response === 'string') {
                    const decodedResponse = API.decodeJwtToken(response);
                    linkData = decodedResponse;
                  }
                  
                  let extractedContent = 'Content not available';
                  if (linkData?.data && Array.isArray(linkData.data) && linkData.data.length > 0) {
                    extractedContent = linkData.data[0]?.description || linkData.data[0]?.content || 'Content not available';
                  } else if (linkData?.data?.content) {
                    extractedContent = linkData.data.content;
                  } else if (linkData?.content) {
                    extractedContent = linkData.content;
                  } else if (linkData?.data?.description) {
                    extractedContent = linkData.data.description;
                  } else if (linkData?.description) {
                    extractedContent = linkData.description;
                  }
                  if (!extractedContent || extractedContent === 'Content not available' || !extractedContent.trim()) {
                    extractedContent = getStaticFooterContent(link.path) || 'Content not available';
                  }
                  setContent(extractedContent);
                } catch (error) {
                  console.error('Error fetching footer link content:', error);
                  const fallback = getStaticFooterContent(link.path);
                  if (fallback) {
                    setContent(fallback);
                    setError(null);
                  } else {
                    setError('Failed to load content. Please try again.');
                  }
                } finally {
                  setLoading(false);
                }
              };
              fetchContent();
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.contentContainer}>
        <ScrollView 
          style={styles.contentScrollView}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.contentText}>
            {content.replace(/<[^>]*>/g, '\n').replace(/\n\s*\n/g, '\n\n').trim()}
          </Text>
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "android" ? insets.top + 20 : 20 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {link?.title || link?.label || 'Footer Link'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <View style={styles.mainContainer}>
        {renderContent()}
      </View>
    </SafeAreaView>
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
    paddingVertical: 15,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  placeholder: {
    width: 40,
  },
  mainContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  contentScrollView: {
    flex: 1,
    padding: 20,
  },
  contentText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 24,
  },
});

export default FooterLinkDetailScreen; 