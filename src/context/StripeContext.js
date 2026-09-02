import React, { createContext, useContext, useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import API from '../services/api';

// Conditionally import useStripe only on native platforms
let useStripe;
if (Platform.OS !== 'web') {
  try {
    useStripe = require('@stripe/stripe-react-native').useStripe;
  } catch (error) {
    console.warn('Stripe not available:', error);
    useStripe = require('../utils/stripeWebStub').useStripe;
  }
} else {
  // Web fallback - use stub
  useStripe = require('../utils/stripeWebStub').useStripe;
}

const StripeContext = createContext();

export const useStripePayment = () => {
  const context = useContext(StripeContext);
  if (!context) {
    throw new Error('useStripePayment must be used within a StripeProvider');
  }
  return context;
};

export const StripeProvider = ({ children }) => {
  const { initPaymentSheet, presentPaymentSheet, confirmPayment } = useStripe();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentSheetEnabled, setPaymentSheetEnabled] = useState(false);

  // Initialize payment sheet
  const initializePaymentSheet = useCallback(async (amount, currency = 'usd', paymentIntentData = null) => {
    try {
      setIsLoading(true);
      
      // Use the payment intent data from your backend
      if (!paymentIntentData || !paymentIntentData.client_secret) {
        throw new Error('Payment intent data is required');
      }

      const { error } = await initPaymentSheet({
        merchantDisplayName: 'Hungama',
        paymentIntentClientSecret: paymentIntentData.client_secret,
        allowsDelayedPaymentMethods: true,
        defaultBillingDetails: {
          name: 'Hungama User',
        },
        returnURL: 'hmini://payment-return',
      });

      if (error) {
        console.error('Error initializing payment sheet:', error);
        return { success: false, error: error.message };
      }

      setPaymentSheetEnabled(true);
      return { success: true };
    } catch (error) {
      console.error('Error in initializePaymentSheet:', error);
      return { success: false, error: error.message || 'Failed to initialize payment' };
    } finally {
      setIsLoading(false);
    }
  }, [initPaymentSheet]);

  // Present payment sheet
  const openPaymentSheet = useCallback(async () => {
    try {
      if (!paymentSheetEnabled) {
        throw new Error('Payment sheet not initialized');
      }

      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code === 'Canceled') {
          return { success: false, canceled: true };
        }
        console.error('Payment failed:', error);
        return { success: false, error: error.message };
      }

      // Payment successful
      setPaymentSheetEnabled(false);
      return { success: true };
    } catch (error) {
      console.error('Error in openPaymentSheet:', error);
      return { success: false, error: error.message || 'Payment failed' };
    }
  }, [presentPaymentSheet, paymentSheetEnabled]);

  // Process subscription payment using your backend APIs only
  const processSubscriptionPayment = useCallback(async (planData, userId) => {
    try {
      setIsLoading(true);

      // Extract amount from plan data (assuming INR currency)
      const amount = parseFloat(planData.price.replace(/[₹$,]/g, ''));
      
      // Step 1: Create payment intent using your backend API
      let paymentIntentResponse;
      
      try {
        paymentIntentResponse = await API.createStripePaymentIntent({
          rate: amount,
          currency: 'inr', // Send original currency, backend will handle conversion
          userId: userId
        });
        
      } catch (paymentIntentError) {
        // Fallback: Create order directly without payment intent
        const orderResponse = await API.createOrder({
          rate: amount,
          orderId: `stripe_direct_${Date.now()}`, // Generate a unique order ID
          assetId: "0",
          userId: userId,
          subscriptionId: planData.id,
          billingName: planData.billingName || "",
          billingEmail: planData.billingEmail || "",
          status: "Active",
          usageType: "Paid",
          isActive: 1,
          paymentMethod: "stripe"
        });
        
        return {
          success: true,
          message: 'Subscription activated! Order created directly.',
          order: orderResponse,
          paymentMethod: 'stripe_direct'
        };
      }

      // Step 2: Initialize payment sheet with the payment intent from your backend (only if payment intent was created)
      if (paymentIntentResponse && paymentIntentResponse.success && paymentIntentResponse.clientSecret) {
        const initResult = await initializePaymentSheet(
          amount,
          'inr', // Use original currency
          { client_secret: paymentIntentResponse.clientSecret } // Extract clientSecret and map to client_secret
        );

        if (!initResult.success) {
          throw new Error(initResult.error);
        }

        // Step 3: Present payment sheet
        const paymentResult = await openPaymentSheet();

        if (paymentResult.canceled) {
          return { success: false, canceled: true, message: 'Payment canceled by user' };
        }

        if (!paymentResult.success) {
          throw new Error(paymentResult.error);
        }

        // Step 4: Create order after successful payment using your backend API
        const orderResponse = await API.createOrder({
          rate: amount,
          orderId: `stripe_${Date.now()}`, // Generate a unique order ID since we don't have payment intent ID
          assetId: "0",
          userId: userId,
          subscriptionId: planData.id,
          billingName: planData.billingName || "",
          billingEmail: planData.billingEmail || "",
          status: "Active",
          usageType: "Paid",
          isActive: 1,
          paymentMethod: "stripe"
        });

        return {
          success: true,
          message: 'Payment successful! Subscription activated.',
          order: orderResponse,
          paymentIntent: paymentIntentResponse,
        };
      } else {
        throw new Error('Payment intent creation failed and no fallback available');
      }
    } catch (error) {
      console.error('Error in processSubscriptionPayment:', error);
      return {
        success: false,
        error: error.message || 'Payment processing failed',
      };
    } finally {
      setIsLoading(false);
    }
  }, [initializePaymentSheet, openPaymentSheet]);

  // Create and confirm payment (for direct card payments)
  const createPayment = useCallback(async (amount, currency = 'usd', paymentMethodId, planData, userId) => {
    try {
      setIsLoading(true);

      // Step 1: Try to create payment intent using your backend
      let paymentIntentResponse;
      
      try {
        paymentIntentResponse = await API.createStripePaymentIntent({
          rate: amount,
          currency: 'inr', // Send original currency, backend will handle conversion
          userId: userId
        });
        
      } catch (paymentIntentError) {
        // Fallback: Create order directly without payment intent
        const orderResponse = await API.createOrder({
          rate: amount,
          orderId: `stripe_direct_${Date.now()}`, // Generate a unique order ID
          assetId: "0",
          userId: userId,
          subscriptionId: planData?.id || "0",
          billingName: planData?.billingName || "",
          billingEmail: planData?.billingEmail || "",
          status: "Active",
          usageType: "Paid",
          isActive: 1,
          paymentMethod: "stripe"
        });
        
        return {
          success: true,
          order: orderResponse,
          message: 'Payment successful! Order created directly.',
          paymentMethod: 'stripe_direct'
        };
      }

      // Step 2: Confirm payment with the payment method (only if payment intent was created)
      if (paymentIntentResponse && paymentIntentResponse.success && paymentIntentResponse.clientSecret) {
        // Additional validation
        if (!paymentIntentResponse.clientSecret || typeof paymentIntentResponse.clientSecret !== 'string') {
          console.error('Invalid client secret format:', paymentIntentResponse.clientSecret);
          throw new Error('Invalid client secret format');
        }
        
        let paymentIntent = null;
        try {
          // Try using the full client secret first
          const { error, paymentIntent: confirmedPaymentIntent } = await confirmPayment(paymentIntentResponse.clientSecret, {
            paymentMethodType: 'Card',
          });

          if (error) {
            console.error('Payment confirmation failed:', error);
            return { success: false, error: error.message };
          }
          
          paymentIntent = confirmedPaymentIntent;
        } catch (confirmError) {
          console.error('Payment confirmation exception:', confirmError);
          return { success: false, error: confirmError.message };
        }

        // Step 3: Create order after successful payment
        const orderResponse = await API.createOrder({
          rate: amount,
          orderId: `stripe_${Date.now()}`, // Generate a unique order ID
          assetId: "0",
          userId: userId,
          subscriptionId: planData?.id || "0",
          billingName: planData?.billingName || "",
          billingEmail: planData?.billingEmail || "",
          status: "Active",
          usageType: "Paid",
          isActive: 1,
          paymentMethod: "stripe"
        });

        return {
          success: true,
          paymentIntent: paymentIntent || paymentIntentResponse,
          order: orderResponse,
          message: 'Payment successful!',
        };
      } else {
        console.error('Payment intent creation failed and no fallback available');
        throw new Error('Payment intent creation failed and no fallback available');
      }
    } catch (error) {
      console.error('Error in createPayment:', error);
      return {
        success: false,
        error: error.message || 'Payment failed',
      };
    } finally {
      setIsLoading(false);
    }
  }, [confirmPayment]);

  const value = {
    isLoading,
    paymentSheetEnabled,
    initializePaymentSheet,
    openPaymentSheet,
    processSubscriptionPayment,
    createPayment,
  };

  return (
    <StripeContext.Provider value={value}>
      {children}
    </StripeContext.Provider>
  );
}; 