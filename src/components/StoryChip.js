import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const StoryChip = ({ storyNumber = 1 }) => (
  <View style={styles.chip}>
    <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.85)" />
    <Text style={styles.label}>{`STORY ${storyNumber}`}</Text>
  </View>
);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    gap: 4,
  },
  label: {
    color: '#FFFFFF',
    fontFamily: 'Arial',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});

export default StoryChip;
