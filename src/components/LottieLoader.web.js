import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';

// Blue color matching the Lottie loader (from loader.json stroke color)
const LOADER_BLUE = 'rgba(0, 156, 219, 1)';

/**
 * Web implementation: use ActivityIndicator only (avoids lottie-react-native web dependency on @lottiefiles/dotlottie-react).
 */
const LottieLoader = ({ 
  size = 'large', 
  containerStyle = {},
  style = {}
}) => {
  const sizeMap = {
    small: 30,
    large: 50,
  };
  
  const pixelSize = typeof size === 'string' ? (sizeMap[size] || sizeMap.large) : size;
  const indicatorSize = typeof size === 'string' ? size : (size <= 30 ? 'small' : 'large');

  return (
    <View style={[styles.container, containerStyle, { width: pixelSize, height: pixelSize }]}>
      <ActivityIndicator size={indicatorSize} color={LOADER_BLUE} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LottieLoader;
