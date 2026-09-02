const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add resolver for Firebase modules
config.resolver.alias = {
  ...config.resolver.alias,
  '@react-native-firebase/app': '@react-native-firebase/app/lib/index.js',
  '@react-native-firebase/analytics': '@react-native-firebase/analytics/lib/index.js',
};

// Add resolver for Firebase common modules
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Custom resolver to handle platform-specific modules
const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Block Stripe React Native on web platform - it's native-only
  if (platform === 'web' && (moduleName.includes('@stripe/stripe-react-native') || moduleName === '@stripe/stripe-react-native')) {
    // Return empty module to prevent bundling errors
    return {
      type: 'empty',
    };
  }

  // Block MoEngage on web platform - it's native-only
  if (platform === 'web' && (moduleName.includes('react-native-moengage') || moduleName === 'react-native-moengage')) {
    // Return empty module to prevent bundling errors
    return {
      type: 'empty',
    };
  }

  // Block lottie-react-native on web - it requires @lottiefiles/dotlottie-react; we use LottieLoader.web.js instead
  if (platform === 'web' && (moduleName === 'lottie-react-native' || moduleName.includes('lottie-react-native'))) {
    return {
      type: 'empty',
    };
  }

  // Block react-native-fast-image on web - uses requireNativeComponent which is native-only.
  // LazyImage.web.js (using standard Image) is picked up automatically on web.
  if (platform === 'web' && (moduleName === 'react-native-fast-image' || moduleName.includes('react-native-fast-image'))) {
    return {
      type: 'empty',
    };
  }

  // Block expo-video on web - VideoView uses requireNativeViewManager (native-only).
  // MotionPreviewCard.web.js renders children without video on web.
  if (platform === 'web' && moduleName === 'expo-video') {
    return { type: 'empty' };
  }

  // Block react-native-secure-window on web - native-only module.
  if (platform === 'web' && moduleName.includes('react-native-secure-window')) {
    return { type: 'empty' };
  }

  // Use default resolver for everything else
  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }

  // Fallback if no default resolver
  return context.resolveRequest(context, moduleName, platform);
};

// Disable web-specific features
config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  mangle: {
    ...config.transformer.minifierConfig?.mangle,
    keep_fnames: true,
  },
};

module.exports = config; 