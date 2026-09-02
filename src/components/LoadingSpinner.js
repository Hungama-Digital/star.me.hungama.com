import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LottieLoader from './LottieLoader';

const LoadingSpinner = ({ 
  size = 'large', 
  color = '#FFFFFF', 
  text = 'Loading...', 
  textStyle = {},
  containerStyle = {} 
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      <LottieLoader size={size} />
      {text && (
        <Text style={[styles.text, textStyle]}>
          {text}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
  },
});

export default LoadingSpinner; 