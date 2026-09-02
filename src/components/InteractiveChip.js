import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const ICON = require('../../assets/ic_interactive.png');

const SIZES = {
  small:  { height: 20, fontSize: 10, iconSize: 12, paddingH: 6, paddingV: 3, gap: 4 },
  medium: { height: 26, fontSize: 12, iconSize: 14, paddingH: 8, paddingV: 4, gap: 4 },
};

const InteractiveChip = ({ size = 'small', style }) => {
  const s = SIZES[size] || SIZES.small;
  return (
    <LinearGradient
      colors={['#FF6A41', '#C044FD']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.chip, { height: s.height, borderRadius: 5, paddingHorizontal: s.paddingH, paddingVertical: s.paddingV }, style]}
    >
      <Image source={ICON} style={{ width: s.iconSize, height: s.iconSize, marginRight: s.gap, tintColor: '#FFFFFF' }} resizeMode="contain" />
      <Text style={[styles.label, { fontSize: s.fontSize }]}>FASTME SHOW</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  label: {
    color: '#FFFFFF',
    fontFamily: 'Arial',
    fontWeight: '700',
    includeFontPadding: false,
  },
});

export default InteractiveChip;
