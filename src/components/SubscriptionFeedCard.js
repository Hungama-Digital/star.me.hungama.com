import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { FourK, Devices, Block, AppLogo, RupeeOneIcon } from './Icons';
import { usePlanPageDetails } from '../hooks/usePlanPageDetails';
import LazyImage from './LazyImage';

/**
 * Fullscreen subscription paywall card used inside the Feeds FlatList.
 *
 * Variants:
 * - mode === 'guest' → Trial offer (₹1, Start Trial)
 * - mode === 'free'  → Subscription card (₹399 / 3 mon, Subscribe Now)
 */
const SubscriptionFeedCard = ({ mode = 'guest', posterImage, onPrimaryPress }) => {
  const isGuest = mode === 'guest';
  const { planDetails } = usePlanPageDetails();

  return (
    <View style={styles.container}>
      {posterImage ? (
        <>
          <LazyImage
            source={{ uri: posterImage }}
            style={styles.posterImage}
            resizeMode="cover"
          />
          {Platform.OS === 'android' ? (
            // Android: Use a darker semi-transparent overlay to simulate blur effect
            // since native blur doesn't work well on Android
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.88)' }]} />
          ) : (
            <BlurView intensity={80} tint="dark" style={styles.blurOverlay} />
          )}
        </>
      ) : (
        <ImageBackground
          source={require('../../assets/Subscription_BG.png')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <View style={styles.contentWrapper}>
        {isGuest ? (
          <>
            <Text style={styles.trialShuruKare}>
              {planDetails?.plan_page_text_1 || ''}
            </Text>
            <View style={styles.trialOfferTitleContainer}>
              <Text style={styles.trialOfferTitle}>
                {planDetails?.plan_page_text_2 || ''}
              </Text>
            </View>

            <LinearGradient
              colors={['rgba(11, 42, 54, 1)', 'rgba(17, 66, 85, 1)', 'rgba(11, 42, 54, 1)']}
              locations={[0, 0.1788, 0.4786]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.trialLimitPill}
            >
              <Text style={styles.trialLimitText}>
                {planDetails?.plan_page_text_3 || ''}
              </Text>
            </LinearGradient>

            <View style={styles.priceWrapper}>
              <RupeeOneIcon width={98} height={72} />
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.9}
              onPress={onPrimaryPress}
            >
              <Text style={styles.primaryButtonText}>Start Trial</Text>
            </TouchableOpacity>

            <Text style={styles.trialSubtitle}>
              {planDetails
                ? `${planDetails.plan_page_text_5} ₹399 ${planDetails.plan_page_text_6}`
                : 'After 3 days, auto pay ₹399 for 3 months'}
            </Text>
          </>
        ) : (
          <>
            <ImageBackground
              source={require('../../assets/Subscription_internal.png')}
              style={styles.regCard}
              resizeMode="cover"
              imageStyle={styles.regCardImage}
            >
              <View style={styles.regCardContent}>
                <View style={styles.regLogoContainer}>
                  <AppLogo width={100} height={30} />
                </View>

                <Text style={styles.regTitle1}>Unlock</Text>

                <Text style={styles.regTitle2}>Endless Entertainment</Text>
                <Text style={styles.regSubtitle}>Unlimited movies & series on FastTV</Text>

                <Text style={styles.regPrice}>₹399<Text style={styles.regPricePeriod}> / 3 months</Text></Text>

                <View style={styles.regDivider} />

                <View style={styles.regFeaturesContainer}>
                  <View style={styles.regFeatureRow}>
                    <View style={styles.regFeatureIcon}>
                      <FourK />
                    </View>
                    <Text style={styles.regFeatureText}>250+ Latest content</Text>
                  </View>
                  <View style={styles.regFeatureRow}>
                    <View style={styles.regFeatureIcon}>
                      <Devices />
                    </View>
                    <Text style={styles.regFeatureText}>Every week new series</Text>
                  </View>
                  <View style={styles.regFeatureRow}>
                    <View style={styles.regFeatureIcon}>
                      <Block />
                    </View>
                    <Text style={styles.regFeatureText}>Ad-free Experience</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.9}
                  onPress={onPrimaryPress}
                >
                  <Text style={styles.primaryButtonText}>Subscribe Now</Text>
                </TouchableOpacity>

                <Text style={styles.regSecureText}>
                  Secure payment · UPI · Cards
                </Text>
              </View>
            </ImageBackground>

            
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  posterImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    position: 'relative',
  },
  // Guest trial styles
  trialShuruKare: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Product Sans',
  },
  trialOfferTitleContainer: {
    marginBottom: 12,
  },
  trialOfferTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    // letterSpacing: 0.4,
    fontFamily: 'Product Sans',
  },
  trialLimitPill: {
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#4481984D',
  },
  trialLimitText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    fontFamily: 'Product Sans',
  },
  priceWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Product Sans',
  },
  trialSubtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'Product Sans',
  },
  // Free user card styles
  regCard: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 48,
    borderWidth: 1,
    bottom: 0,
    position: 'absolute',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  regCardImage: {
    borderRadius: 24,
  },
  regCardContent: {
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  regLogoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  regTitle1: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: 'Product Sans',
  },
  regTitle2: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Product Sans',
  },
  regSubtitle: {
    color: '#FFFFFF',
    opacity: 0.7,
    fontSize: 15,
    fontWeight: 400,
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'Product Sans',
  },
  regPrice: {
    color: '#FFFFFF',
    fontSize: 41,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'Product Sans',
  },
  regPricePeriod: {
    color: '#CCCCCC',
    fontSize: 21,
    fontWeight: '400',
  },
  regDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    // marginVertical: 16,
    marginBottom: 24,
  },
  regFeaturesContainer: {
    alignItems: 'center',
    marginBottom: 18,
  },
  regFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  regFeatureIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regFeatureText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Product Sans',
  },
  regSecureText: {
    color: '#A8A29E',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Product Sans',
  },
});

export default SubscriptionFeedCard;

