import React, { createContext, useContext } from 'react';

/**
 * Viewport state: scroll offset and visible height.
 * Updated by the main ScrollView (e.g. HomeScreen) on scroll.
 */
let viewport = { scrollY: 0, viewportHeight: 0, stickyTopOffset: 0, touchX: -1 };
const listeners = new Set();

let _lastLoggedScrollY = -1;
export function updateViewport(scrollY, viewportHeight, stickyTopOffset = 0) {
  viewport = { ...viewport, scrollY, viewportHeight, stickyTopOffset };
  // Log only when scrollY changes by >100px to avoid spam
  if (Math.abs(scrollY - _lastLoggedScrollY) > 100) {
    _lastLoggedScrollY = scrollY;
    console.log('[Viewport] scrollY:', Math.round(scrollY), 'vpH:', Math.round(viewportHeight), 'stickyTop:', Math.round(stickyTopOffset), 'touchX:', Math.round(viewport.touchX), 'listeners:', listeners.size);
  }
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      if (__DEV__) console.warn('Viewport listener error:', e);
    }
  });
}

export function updateTouchX(x) {
  viewport.touchX = x;
  // We don't trigger listeners on touchX changes to avoid spamming the UI thread,
  // components check it reactively during scroll events (which fire constantly anyway).
}

export function subscribeToViewport(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getViewport() {
  return viewport;
}

/**
 * Ref to the main vertical ScrollView (e.g. HomeScreen).
 * Used by LazyImage to measure position relative to scroll content for viewport visibility.
 */
const ScrollViewRefContext = createContext(null);

export function useScrollViewRef() {
  return useContext(ScrollViewRefContext);
}

export function ScrollViewRefProvider({ scrollViewRef, children }) {
  return (
    <ScrollViewRefContext.Provider value={scrollViewRef}>
      {children}
    </ScrollViewRefContext.Provider>
  );
}

export default ScrollViewRefContext;
