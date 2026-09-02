import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const ICON = require('../../assets/ic_interactive.png');

const FastMeChip = () => (
  <View style={styles.chip}>
    <Image source={ICON} style={styles.icon} resizeMode="contain" />
    <Text style={styles.label}>FastME</Text>
  </View>
);

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#FF6623',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  icon: { width: 10, height: 10, marginRight: 3, tintColor: '#FFFFFF' },
  label: {
    color: '#FFFFFF',
    fontFamily: 'Arial',
    fontWeight: '600',
    fontSize: 11,
  },
});

export default FastMeChip;
