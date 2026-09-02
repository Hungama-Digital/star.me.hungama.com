/**
 * LazyImage.web.js — Web-safe version of LazyImage.
 *
 * On web, react-native-fast-image uses requireNativeComponent which is not
 * available, so this file replaces it with a standard Image component.
 * Expo automatically uses the .web.js file on web platform.
 */

import React, { useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';

const PLACEHOLDER_IMAGE = require('../../assets/placeholder.png');

const LazyImage = React.memo(({
    source,
    style,
    resizeMode = 'cover',
    placeholderStyle,
    showPlaceholderSpinner = false,
    priority = false,
    onLoad,
    onError,
    onLoadStart,
    ...rest
}) => {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    if (!source) return null;

    const handleLoad = (e) => {
        setLoaded(true);
        onLoad?.(e);
    };

    const handleError = (e) => {
        setError(true);
        onError?.(e);
    };

    return (
        <View style={[styles.wrapper, style]}>
            {/* Placeholder shown until image loads */}
            {!loaded && !error && (
                <Image
                    source={PLACEHOLDER_IMAGE}
                    style={[StyleSheet.absoluteFill, styles.placeholder, placeholderStyle]}
                    resizeMode="cover"
                />
            )}

            <Image
                source={source}
                style={StyleSheet.absoluteFill}
                resizeMode={resizeMode}
                onLoadStart={onLoadStart}
                onLoad={handleLoad}
                onError={handleError}
                {...rest}
            />
        </View>
    );
});

LazyImage.displayName = 'LazyImage';

const styles = StyleSheet.create({
    wrapper: {
        overflow: 'hidden',
    },
    placeholder: {
        width: '100%',
        height: '100%',
    },
});

export default LazyImage;
