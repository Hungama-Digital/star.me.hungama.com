import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useStripePayment } from '../context/StripeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../services/api';
import LottieLoader from './LottieLoader';
import { usePaymentFeedback } from '../context/PaymentFeedbackContext';

// Conditionally import Stripe components only on native platforms
let CardField, useStripe;
if (Platform.OS !== 'web') {
  try {
    const stripeModule = require('@stripe/stripe-react-native');
    CardField = stripeModule.CardField;
    useStripe = stripeModule.useStripe;
  } catch (error) {
    console.warn('Stripe not available:', error);
    const stub = require('../utils/stripeWebStub');
    CardField = stub.CardField;
    useStripe = stub.useStripe;
  }
} else {
  // Web fallback - use stub
  const stub = require('../utils/stripeWebStub');
  CardField = stub.CardField;
  useStripe = stub.useStripe;
}

const { width } = Dimensions.get('window');

const StripeCardForm = (props) => {
  // Safety check for props object
  if (!props || typeof props !== 'object') {
    console.error('StripeCardForm: Received invalid or null props:', props);
    return null;
  }



  // Destructure props with defaults
  const { 
    amount, 
    currency = 'inr', 
    onSuccess, 
    onCancel, 
    planData, 
    userId 
  } = props;

  // Early return if required props are missing
  if (!onSuccess || !onCancel) {
    console.warn('StripeCardForm: Missing required props onSuccess or onCancel');
    return null;
  }

  // Additional safety check for amount
  if (amount === undefined || amount === null || isNaN(amount)) {
    console.warn('StripeCardForm: Invalid amount prop:', amount);
    return null;
  }

  // Additional safety check for userId
  if (!userId) {
    console.warn('StripeCardForm: Missing userId prop');
    return null;
  }

  // Additional safety check for currency
  if (!currency || typeof currency !== 'string') {
    console.warn('StripeCardForm: Invalid currency prop:', currency);
    return null;
  }

  const { createPaymentMethod } = useStripe();
  const { createPayment, isLoading } = useStripePayment();
  const { registerPaymentAttempt, showPaymentFailed } = usePaymentFeedback();
  
  // Safety check for Stripe hooks
  if (!createPaymentMethod) {
    console.error('StripeCardForm: createPaymentMethod is not available');
    return null;
  }
  
  if (!createPayment) {
    console.error('StripeCardForm: createPayment is not available');
    return null;
  }

  // Create safe versions of variables with defaults
  const safeIsLoading = isLoading !== undefined ? isLoading : false;
  
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cardDetails, setCardDetails] = useState(null);

  // Ensure state variables are properly initialized
  React.useEffect(() => {
    // Component mounted successfully
  }, []);

  // Safety check for state variables
  if (cardComplete === undefined || processing === undefined) {
    console.warn('StripeCardForm: State variables not properly initialized');
    return null;
  }

  // Final safety check before rendering
  if (typeof cardComplete !== 'boolean' || typeof processing !== 'boolean') {
    console.error('StripeCardForm: Critical state variables are not properly initialized');
    return null;
  }

  // Ensure currency has a default value and is a string
  const safeCurrency = (currency && typeof currency === 'string') ? currency : 'inr';
  const safeAmount = (amount && !isNaN(amount) && amount > 0) ? amount : 0;

  // Enhanced validation - check if we have complete card info
  const isCardValid = () => {
    try {
      if (cardComplete) return true;
      
      // Fallback validation when CardField doesn't report complete
      if (cardDetails && typeof cardDetails === 'object') {
        const hasNumber = cardDetails.number && typeof cardDetails.number === 'string' && cardDetails.number.length >= 13;
        const hasExpiry = cardDetails.expiryMonth && cardDetails.expiryYear && 
                         typeof cardDetails.expiryMonth === 'string' && typeof cardDetails.expiryYear === 'string';
        const hasCVC = cardDetails.cvc && typeof cardDetails.cvc === 'string' && cardDetails.cvc.length >= 3;
        
        return hasNumber && hasExpiry && hasCVC;
      }
      
      return false;
    } catch (error) {
      console.error('Error in isCardValid:', error);
      return false;
    }
  };

  const handlePayment = async () => {
    if (!isCardValid()) {
      require('../utils/errorReporting').reportErrorAlert('Error', 'Please enter complete card details');
      return;
    }

    // Additional safety check for cardDetails
    if (!cardDetails || typeof cardDetails !== 'object') {
      require('../utils/errorReporting').reportErrorAlert('Error', 'Card details are not properly loaded. Please try again.');
      return;
    }

    try {
      registerPaymentAttempt({
        onRetry: handlePayment,
        onCancel,
      });
      setProcessing(true);

      // Create payment method
      const { error, paymentMethod } = await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            name: 'Hungama User',
          },
        },
      });

      if (error) {
        const errorMessage = error && error.message ? error.message : 'Unknown card error';
        require('../utils/errorReporting').reportErrorAlert('Card Error', errorMessage);
        return;
      }

      if (!paymentMethod) {
        require('../utils/errorReporting').reportErrorAlert('Card Error', 'Failed to create payment method');
        return;
      }

      // Create and confirm payment using your backend APIs
      if (!safeAmount || safeAmount <= 0) {
        require('../utils/errorReporting').reportErrorAlert('Error', 'Invalid amount for payment');
        return;
      }

      if (!safeCurrency || typeof safeCurrency !== 'string') {
        Alert.alert('Error', 'Invalid currency for payment');
        return;
      }

      if (!paymentMethod || !paymentMethod.id) {
        require('../utils/errorReporting').reportErrorAlert('Error', 'Payment method not created properly');
        return;
      }

      // Validate planData if provided
      if (planData && typeof planData !== 'object') {
        console.warn('Invalid planData:', planData);
        planData = null; // Set to null if invalid
      }

      // Get user ID from auth token (backend user ID, not Firebase UID)
      const authToken = await AsyncStorage.getItem('authToken');
      let backendUserId = null;
      
      if (authToken) {
        try {
          const decodedToken = API.decodeJwtToken(authToken);
          // Extract userId from the correct path in the token
          backendUserId = decodedToken?.data?.userId || decodedToken?.userId || decodedToken?.id;
          
          if (!backendUserId) {
            throw new Error('Could not extract user ID from auth token');
          }
        } catch (error) {
          console.error('Error decoding auth token:', error);
          // Try fallback authentication from stored user data
          try {
            const storedUser = await AsyncStorage.getItem('user');
            if (storedUser) {
              const userData = JSON.parse(storedUser);
              backendUserId = userData.uid || userData.id || userData.userId;
              
              if (!backendUserId) {
                throw new Error('No valid user ID found in stored user data');
              }
            } else {
              throw new Error('No stored user data found');
            }
          } catch (fallbackError) {
            console.error('Fallback authentication failed:', fallbackError);
            require('../utils/errorReporting').reportErrorAlert('Error', 'Authentication error. Please log in again.');
            return;
          }
        }
      } else {
        // Try fallback authentication from stored user data
        try {
          const storedUser = await AsyncStorage.getItem('user');
          if (storedUser) {
            const userData = JSON.parse(storedUser);
            backendUserId = userData.uid || userData.id || userData.userId;
            
            if (!backendUserId) {
              throw new Error('No valid user ID found in stored user data');
            }
          } else {
            throw new Error('No stored user data found');
          }
        } catch (fallbackError) {
          console.error('Fallback authentication failed:', fallbackError);
          require('../utils/errorReporting').reportErrorAlert('Error', 'Authentication token not found. Please log in again.');
          return;
        }
      }

      const result = await createPayment(
        safeAmount,
        safeCurrency,
        paymentMethod.id,
        planData,
        backendUserId
      );

      if (result && result.success) {
        try {
          onSuccess?.(result);
        } catch (error) {
          console.error('Error in onSuccess callback:', error);
        }
      } else {
        const errorMessage = result && result.error ? result.error : 'Payment failed with unknown error';
        
        // Check if it's a payment intent creation error
        if (errorMessage.includes('HTTP error! status: 500')) {
          require('../utils/errorReporting').reportErrorAlert(
            'Payment System Issue',
            'We\'re experiencing technical difficulties with our payment system. Please try again later or contact support.'
          );
        } else {
          showPaymentFailed({
            message:
              errorMessage ||
              'If amount was deducted it will be refunded,\nwithin 2 hours',
          });
        }
      }
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error && error.message ? error.message : 'An unexpected error occurred';
      showPaymentFailed({
        title: 'Payment Error',
        message:
          errorMessage ||
          'If amount was deducted it will be refunded,\nwithin 2 hours',
      });
    } finally {
      setProcessing(false);
    }
  };

  // Final safety check before rendering
  if (typeof cardComplete !== 'boolean' || typeof processing !== 'boolean') {
    console.error('StripeCardForm: Critical state variables are not properly initialized');
    return null;
  }

  // Show web fallback message if on web platform
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                try {
                  onCancel();
                } catch (error) {
                  console.error('Error in onCancel callback:', error);
                }
              }}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Payment Not Available</Text>
            <View style={styles.closeButton} />
          </View>
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amount}>
              ₹{(safeAmount && !isNaN(safeAmount)) ? safeAmount.toFixed(2) : '0.00'} {(safeCurrency && typeof safeCurrency === 'string') ? safeCurrency.toUpperCase() : 'INR'}
            </Text>
          </View>
          <View style={styles.cardContainer}>
            <Text style={styles.cardLabel}>
              Stripe payment is only available on iOS and Android devices.
            </Text>
            <Text style={[styles.cardLabel, { marginTop: 12, fontSize: 14, color: '#CCCCCC' }]}>
              Please use the mobile app to complete your purchase.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              try {
                onCancel();
              } catch (error) {
                console.error('Error in onCancel callback:', error);
              }
            }}
          >
            <Text style={styles.cancelButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              try {
                onCancel();
              } catch (error) {
                console.error('Error in onCancel callback:', error);
              }
            }}
            disabled={processing || safeIsLoading}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Enter Card Details</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Amount Display */}
        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Total Amount</Text>
          <Text style={styles.amount}>
            ₹{(safeAmount && !isNaN(safeAmount)) ? safeAmount.toFixed(2) : '0.00'} {(safeCurrency && typeof safeCurrency === 'string') ? safeCurrency.toUpperCase() : 'INR'}
          </Text>
          {planData && (
            <Text style={styles.planInfo}>
              {planData.title || 'Plan'} - {planData.period || 'Period'}
            </Text>
          )}
        </View>

        {/* Card Input */}
        <View style={styles.cardContainer}>
          <Text style={styles.cardLabel}>Card Information</Text>
          
          <CardField
            postalCodeEnabled={false}
            placeholders={{
              number: '4242 4242 4242 4242',
              expiry: 'MM/YY',
              cvc: 'CVC',
            }}
            cardStyle={styles.cardField}
            style={styles.cardFieldContainer}
            onCardChange={(cardDetails) => {
              try {
                // Add null check to prevent TypeError
                if (!cardDetails) {
                  setCardComplete(false);
                  setCardDetails(null);
                  return;
                }
                
                setCardComplete(cardDetails.complete || false);
                setCardDetails(cardDetails); // Store card details for fallback validation
              } catch (error) {
                console.error('Error in onCardChange:', error);
                // Set safe defaults to prevent crashes
                setCardComplete(false);
                setCardDetails(null);
              }
            }}
          />
        </View>



        {/* Payment Button */}
        <TouchableOpacity
          style={[styles.payButton, (!isCardValid() || processing || safeIsLoading) && styles.payButtonDisabled]}
          onPress={handlePayment}
          disabled={!isCardValid() || processing || safeIsLoading}
        >
          <LinearGradient
            colors={isCardValid() ? ['#4CAF50', '#66BB6A'] : ['#666666', '#888888']}
            style={styles.payGradient}
          >
            {processing || safeIsLoading ? (
              <View style={styles.loadingContainer}>
                <LottieLoader size="small" />
                <Text style={styles.payButtonText}>Processing...</Text>
              </View>
            ) : (
              <Text style={styles.payButtonText}>
                Pay ₹{(safeAmount && !isNaN(safeAmount)) ? safeAmount.toFixed(2) : '0.00'}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Security Info */}
        <View style={styles.securityInfo}>
          <Ionicons name="shield-checkmark" size={16} color="#4CAF50" />
          <Text style={styles.securityText}>
            Your payment is secured with 256-bit SSL encryption
          </Text>
        </View>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            try {
              onCancel();
            } catch (error) {
              console.error('Error in onCancel callback:', error);
            }
          }}
          disabled={processing || safeIsLoading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    width: width - 40,
    maxWidth: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
  },
  amountLabel: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 4,
  },
  amount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  planInfo: {
    fontSize: 14,
    color: '#CCCCCC',
    marginTop: 4,
  },
  cardContainer: {
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
    fontWeight: '600',
  },
  cardFieldContainer: {
    height: 50,
    borderRadius: 8,
  },
  cardField: {
    backgroundColor: '#2A2A2A',
    textColor: '#FFFFFF',
    placeholderColor: '#CCCCCC',
    borderColor: '#444444',
    borderWidth: 1,
    borderRadius: 8,
  },

  payButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  payButtonDisabled: {
    opacity: 0.7,
  },
  payGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  securityText: {
    fontSize: 12,
    color: '#CCCCCC',
    marginLeft: 6,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#CCCCCC',
  },

});

export default StripeCardForm; 