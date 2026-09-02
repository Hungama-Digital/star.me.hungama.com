// Web stub for Stripe React Native - provides no-op implementations
// This file is used when Platform.OS === 'web' to prevent bundling errors

export const StripeProvider = ({ children }) => children;

export const useStripe = () => ({
  initPaymentSheet: async () => ({ error: null }),
  presentPaymentSheet: async () => ({ error: null }),
  confirmPayment: async () => ({ error: null, paymentIntent: null }),
  createPaymentMethod: async () => ({ error: null, paymentMethod: null }),
});

export const CardField = () => null;

export default {
  StripeProvider,
  useStripe,
  CardField,
};

