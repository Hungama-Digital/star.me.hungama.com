// Stripe Configuration
export const STRIPE_CONFIG = {
  // Your actual Stripe publishable key
  // Get this from: https://dashboard.stripe.com/apikeys
  publishableKey: 'pk_test_51Ru3lZLc9IxaV6sKR3TBIUmR6JF4iMWadvaqMlzJ8jqwxiG7Qwrf2Z5mSseqDUMmcFZaEmZ6QlzRva8sQoGgDp3o00HGHgal86',
  
  // Merchant details
  merchantIdentifier: 'com.app.hmini',
  urlScheme: 'hmini',
  
  // Apple Pay configuration (iOS)
  applePay: {
    merchantIdentifier: 'com.app.hmini',
    supportedNetworks: ['visa', 'mastercard', 'amex'],
    supportedCountries: ['IN', 'US', 'CA', 'GB', 'AU'],
    requiredBillingContactFields: ['name', 'email'],
    requiredShippingContactFields: [],
  },
  
  // Google Pay configuration (Android)
  googlePay: {
    merchantIdentifier: 'com.app.hmini',
    supportedNetworks: ['visa', 'mastercard', 'amex'],
    supportedCountries: ['IN', 'US', 'CA', 'GB', 'AU'],
    currencyCode: 'INR',
    environment: 'Test', // Change to 'Production' for live
  },
};

// Test card numbers for development
export const TEST_CARDS = {
  visa: '4242424242424242',
  visaDebit: '4000056655665556',
  mastercard: '5555555555554444',
  amex: '378282246310005',
  declined: '4000000000000002',
  insufficientFunds: '4000000000009995',
  expired: '4000000000000069',
  cvcFail: '4000000000000127',
}; 