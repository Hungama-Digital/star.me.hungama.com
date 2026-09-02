/**
 * ReelItem.web.js — Web stub.
 * ReelItem uses expo-video which is native-only and not available on web.
 * This stub renders nothing on web so the app can still bundle and run.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ReelItem = React.forwardRef((props, ref) => (
    <View style={styles.container}>
        <Text style={styles.text}>Reels not available on web</Text>
    </View>
));

ReelItem.displayName = 'ReelItem';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#111',
    },
    text: {
        color: '#888',
        fontSize: 16,
    },
});

export default ReelItem;
