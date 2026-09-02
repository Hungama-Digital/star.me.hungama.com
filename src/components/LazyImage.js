import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  InteractionManager,
  findNodeHandle,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {
  subscribeToViewport,
  getViewport,
  useScrollViewRef,
} from '../context/ViewportContext';
import LottieLoader from './LottieLoader';

const PLACEHOLDER_IMAGE = require('../../assets/placeholder.png');

const VIEWPORT_BUFFER = 400;
const THROTTLE_MS = 100;
const INITIAL_CHECK_DELAY = 150;

const MAX_LOADED_URIS = 100;
const loadedUrisCache = new Set();
const loadedUrisOrder = [];

function markUriLoaded(uri) {
  if (!uri || loadedUrisCache.has(uri)) return;
  while (loadedUrisCache.size >= MAX_LOADED_URIS && loadedUrisOrder.length > 0) {
    const oldest = loadedUrisOrder.shift();
    if (oldest) loadedUrisCache.delete(oldest);
  }
  loadedUrisCache.add(uri);
  loadedUrisOrder.push(uri);
}

function isUriCached(uri) {
  return uri && loadedUrisCache.has(uri);
}

const mapResizeModeToFastImage = (mode) => {
  switch (mode) {
    case 'contain':
      return FastImage.resizeMode.contain;
    case 'stretch':
      return FastImage.resizeMode.stretch;
    case 'center':
      return FastImage.resizeMode.center;
    case 'cover':
    default:
      return FastImage.resizeMode.cover;
  }
};

/**
 * LazyImage – viewport-based lazy loading for remote images.
 * - Remote URIs: loads only when the image is in (or near) the visible scroll area.
 * - If no scroll context (e.g. not inside HomeScreen), falls back to deferred load after interactions.
 * - Static require() sources: rendered immediately.
 * - Use priority={true} for above-the-fold images (e.g. hero) to load immediately.
 */
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
  const isRemote = source && typeof source === 'object' && source.uri && typeof source.uri === 'string';
  const isStatic = source && (typeof source === 'number' || (typeof source === 'object' && !source.uri));
  const uri = isRemote && source?.uri ? source.uri : null;
  const wasCached = uri && isUriCached(uri);

  const [shouldLoad, setShouldLoad] = useState(() => priority || !!wasCached);
  const [loaded, setLoaded] = useState(() => !!wasCached);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const wrapperRef = useRef(null);
  const lastCheckRef = useRef(0);
  const scrollViewRef = useScrollViewRef();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false };
  }, []);

  const checkInView = useCallback(() => {
    if (!mounted.current || shouldLoad) return;
    const scrollRef = scrollViewRef?.current;
    const wrapper = wrapperRef?.current;
    if (!scrollRef || !wrapper || typeof wrapper.measureLayout !== 'function') return;

    const now = Date.now();
    if (now - lastCheckRef.current < THROTTLE_MS) return;
    lastCheckRef.current = now;

    const scrollNative = findNodeHandle(scrollRef);
    if (!scrollNative) return;

    wrapper.measureLayout(scrollNative, (x, y, width, height) => {
      if (!mounted.current) return;
      const v = getViewport();
      const inView =
        y + height >= v.scrollY - VIEWPORT_BUFFER &&
        y <= v.scrollY + v.viewportHeight + VIEWPORT_BUFFER;
      if (inView) setShouldLoad(true);
    }, () => {});
  }, [scrollViewRef, shouldLoad]);

  useEffect(() => {
    if (!isRemote) {
      setShouldLoad(true);
      return;
    }
    if (priority) {
      setShouldLoad(true);
      return;
    }

    let unsub = null;
    let t2 = null;
    const t1 = setTimeout(() => {
      if (!mounted.current) return;
      if (scrollViewRef?.current) {
        unsub = subscribeToViewport(checkInView);
        checkInView();
        t2 = setTimeout(checkInView, INITIAL_CHECK_DELAY);
      }
    }, 0);

    const fallback = InteractionManager.runAfterInteractions(() => {
      if (!mounted.current) return;
      if (unsub) return;
      setShouldLoad(true);
    });

    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
      fallback.cancel();
      if (unsub) unsub();
    };
  }, [isRemote, priority, scrollViewRef, checkInView]);

  const handleLoad = (e) => {
    if (mounted.current) {
      setLoaded(true);
      if (uri) markUriLoaded(uri);
    }
    onLoad?.(e);
  };

  const handleError = (e) => {
    if (mounted.current) setError(true);
    onError?.(e);
  };

  if (!source) return null;

  if (isStatic) {
    return (
      <Image
        source={source}
        style={style}
        resizeMode={resizeMode}
        onLoad={onLoad}
        onError={onError}
        {...rest}
      />
    );
  }

  if (!shouldLoad) {
    return (
      <View
        ref={wrapperRef}
        style={[styles.placeholderContainer, style, placeholderStyle]}
        collapsable={false}
      >
        <Image
          source={PLACEHOLDER_IMAGE}
          style={styles.placeholderImage}
          resizeMode="cover"
        />
        {showPlaceholderSpinner && (
          <View style={[StyleSheet.absoluteFill, styles.spinnerWrap]}>
            <LottieLoader size="small" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View ref={wrapperRef} style={[styles.wrapper, style]} collapsable={false}>
      {!loaded && !error && (
        <Image
          source={PLACEHOLDER_IMAGE}
          style={[styles.placeholderImage, placeholderStyle]}
          resizeMode="cover"
        />
      )}
      {!loaded && !error && showPlaceholderSpinner && (
        <View style={[StyleSheet.absoluteFill, styles.spinnerWrap]}>
          <LottieLoader size={30} />
        </View>
      )}
      {isRemote ? (
        <FastImage
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode={mapResizeModeToFastImage(resizeMode)}
          onLoadStart={onLoadStart}
          onLoad={handleLoad}
          onError={handleError}
          {...rest}
        />
      ) : (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          onLoadStart={onLoadStart}
          onLoad={handleLoad}
          onError={handleError}
          {...rest}
        />
      )}
    </View>
  );
});

LazyImage.displayName = 'LazyImage';

const styles = StyleSheet.create({
  placeholderContainer: {
    overflow: 'hidden',
  },
  placeholderImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  wrapper: {
    overflow: 'hidden',
  },
  spinnerWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LazyImage;
