/**
 * ReelsScreen.web.js — Web stub.
 * ReelsScreen and ReelItem both use expo-video which is native-only.
 * This stub renders a simple "not available" screen on web.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ReelsScreen = () => (
    <View style={styles.container}>
        <Text style={styles.title}>Reels</Text>
        <Text style={styles.subtitle}>Reels playback is only available on the mobile app.</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
        padding: 24,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 12,
    },
    subtitle: {
        color: '#888',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
});

export default ReelsScreen;
