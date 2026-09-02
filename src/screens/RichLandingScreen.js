/**
 * RichLandingScreen
 *
 * Opens any URL inside an in-app WebView. Used by MoEngage push notifications and
 * in-app messages that redirect to non-fasttv.app URLs (rich landing pages).
 *
 * Route params:
 *   url   {string} — the URL to load (required)
 *   title {string} — optional header title, defaults to "Opening…"
 *
 * Navigation: navigate('RichLanding', { url: 'https://...', title: '...' })
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    View,
    TouchableOpacity,
    Text,
    BackHandler,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

const FALLBACK_URL = 'https://fasttv.app/home';

const RichLandingScreen = ({ navigation, route }) => {
    const insets = useSafeAreaInsets();
    const params = route?.params;
    const { url: rawUrl, title } = params && typeof params === 'object' ? params : {};

    // Validate URL — fall back to home if empty/invalid
    const url =
        typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl.trim())
            ? rawUrl.trim()
            : FALLBACK_URL;

    const displayTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Opening…';

    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    // Hardware back button (Android)
    useEffect(() => {
        const backAction = () => {
            if (navigation?.canGoBack?.()) {
                navigation.goBack();
            }
            return true;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => sub.remove();
    }, [navigation]);

    const handleLoadStart = useCallback(() => {
        setIsLoading(true);
        setHasError(false);
    }, []);

    const handleLoadEnd = useCallback(() => {
        setIsLoading(false);
    }, []);

    const handleError = useCallback(() => {
        setIsLoading(false);
        setHasError(true);
    }, []);

    const handleShouldStartLoad = useCallback((request) => {
        const target = request?.url || '';
        // Block Play Store / market links so user stays inside the app
        if (
            target.startsWith('market://') ||
            target.includes('play.google.com/store')
        ) {
            return false;
        }
        return true;
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <View
                style={[
                    styles.header,
                    { paddingTop: Platform.OS === 'android' ? (insets?.top ?? 0) + 16 : 16 },
                ]}
            >
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation?.goBack?.()}
                    accessibilityLabel="Go back"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>

                <Text style={styles.headerTitle} numberOfLines={1}>
                    {displayTitle}
                </Text>

                {/* Spacer to keep title centred */}
                <View style={styles.placeholder} />
            </View>

            {/* ── Content ────────────────────────────────────────────────────── */}
            <View style={styles.webviewContainer}>
                {hasError ? (
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={48} color="#666" />
                        <Text style={styles.errorTitle}>Unable to load page</Text>
                        <Text style={styles.errorSubtitle}>
                            Please check your connection and try again.
                        </Text>
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={() => {
                                setHasError(false);
                                setIsLoading(true);
                            }}
                        >
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <WebView
                            key={url /* remount on retry */}
                            source={{ uri: url }}
                            style={styles.webview}
                            onShouldStartLoadWithRequest={handleShouldStartLoad}
                            onLoadStart={handleLoadStart}
                            onLoadEnd={handleLoadEnd}
                            onError={handleError}
                            javaScriptEnabled
                            domStorageEnabled
                            mixedContentMode="always"
                            startInLoadingState={false}
                        />
                        {isLoading && (
                            <View style={styles.loaderOverlay}>
                                <ActivityIndicator size="large" color="#FFFFFF" />
                            </View>
                        )}
                    </>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 14,
        backgroundColor: '#1A1A1A',
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 10,
    },
    placeholder: {
        width: 40,
    },
    webviewContainer: {
        flex: 1,
    },
    webview: {
        flex: 1,
        backgroundColor: '#000000',
    },
    loaderOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        gap: 12,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        marginTop: 8,
    },
    errorSubtitle: {
        fontSize: 14,
        color: '#AAAAAA',
        textAlign: 'center',
        lineHeight: 20,
    },
    retryButton: {
        marginTop: 8,
        paddingHorizontal: 28,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
    },
    retryText: {
        color: '#000000',
        fontWeight: '700',
        fontSize: 14,
    },
});

export default RichLandingScreen;
