import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import LottieView from 'lottie-react-native';

const LottieLoader = ({ 
  size = 'large', 
  containerStyle = {},
  style = {}
}) => {
  // Map size prop to pixel values
  const sizeMap = {
    small: 30,
    large: 50,
  };
  
  // Support both string ('small'/'large') and number for backward compatibility
  const pixelSize = typeof size === 'string' ? (sizeMap[size] || sizeMap.large) : size;

  return (
    <View style={[styles.container, containerStyle, { width: pixelSize, height: pixelSize }]}>
      <LottieView
        source={require('../../assets/json/loader.json')}
        autoPlay
        loop
        style={[{ width: pixelSize, height: pixelSize }, style]}
        hardwareAccelerationAndroid={true}
        renderMode={Platform.OS === 'ios' ? 'SOFTWARE' : 'AUTOMATIC'}
      />
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
