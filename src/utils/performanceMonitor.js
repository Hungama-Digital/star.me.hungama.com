// Performance monitoring utility for Hungama app
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      renderTimes: new Map(),
      memoryUsage: [],
      videoLoadTimes: new Map(),
      navigationTimes: new Map(),
    };
    this.isEnabled = __DEV__;
  }

  // Start timing a specific operation
  startTimer(operationName) {
    if (!this.isEnabled) return null;
    
    const startTime = performance.now();
    return {
      end: () => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        if (!this.metrics.renderTimes.has(operationName)) {
          this.metrics.renderTimes.set(operationName, []);
        }
        this.metrics.renderTimes.get(operationName).push(duration);
        
        // Log if duration is above threshold
        if (duration > 16) { // 60fps threshold
          console.warn(`Performance warning: ${operationName} took ${duration.toFixed(2)}ms`);
        }
        
        return duration;
      }
    };
  }

  // Track video load time
  trackVideoLoad(videoId, loadTime) {
    if (!this.isEnabled) return;
    
    this.metrics.videoLoadTimes.set(videoId, loadTime);
    
    if (loadTime > 2000) { // 2 second threshold
      console.warn(`Video load warning: ${videoId} took ${loadTime}ms to load`);
    }
  }

  // Track navigation time
  trackNavigation(screenName, navigationTime) {
    if (!this.isEnabled) return;
    
    if (!this.metrics.navigationTimes.has(screenName)) {
      this.metrics.navigationTimes.set(screenName, []);
    }
    this.metrics.navigationTimes.get(screenName).push(navigationTime);
  }

  // Get performance summary
  getSummary() {
    if (!this.isEnabled) return null;
    
    const summary = {
      renderTimes: {},
      navigationTimes: {},
      videoLoadTimes: {},
      memoryUsage: this.metrics.memoryUsage.length > 0 ? 
        this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1] : null,
    };

    // Calculate averages for render times
    this.metrics.renderTimes.forEach((times, operation) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      const min = Math.min(...times);
      
      summary.renderTimes[operation] = {
        average: avg.toFixed(2),
        max: max.toFixed(2),
        min: min.toFixed(2),
        count: times.length,
      };
    });

    // Calculate averages for navigation times
    this.metrics.navigationTimes.forEach((times, screen) => {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      summary.navigationTimes[screen] = {
        average: avg.toFixed(2),
        count: times.length,
      };
    });

    // Calculate video load statistics
    const videoLoadTimes = Array.from(this.metrics.videoLoadTimes.values());
    if (videoLoadTimes.length > 0) {
      const avg = videoLoadTimes.reduce((a, b) => a + b, 0) / videoLoadTimes.length;
      summary.videoLoadTimes = {
        average: avg.toFixed(2),
        count: videoLoadTimes.length,
      };
    }

    return summary;
  }

  // Log performance summary
  logSummary() {
    if (!this.isEnabled) return;
    
    const summary = this.getSummary();
    if (summary) {
      console.log('=== Performance Summary ===');
      console.log('Render Times:', summary.renderTimes);
      console.log('Navigation Times:', summary.navigationTimes);
      console.log('Video Load Times:', summary.videoLoadTimes);
      console.log('Memory Usage:', summary.memoryUsage);
      console.log('===========================');
    }
  }

  // Clear all metrics
  clear() {
    this.metrics.renderTimes.clear();
    this.metrics.videoLoadTimes.clear();
    this.metrics.navigationTimes.clear();
    this.metrics.memoryUsage = [];
  }

  // Enable/disable monitoring
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;

// Performance hooks for React components
export const usePerformanceMonitor = (componentName) => {
  const startRender = () => {
    return performanceMonitor.startTimer(`${componentName}_render`);
  };

  const trackVideoLoad = (videoId, loadTime) => {
    performanceMonitor.trackVideoLoad(videoId, loadTime);
  };

  const trackNavigation = (screenName, navigationTime) => {
    performanceMonitor.trackNavigation(screenName, navigationTime);
  };

  return {
    startRender,
    trackVideoLoad,
    trackNavigation,
  };
}; 