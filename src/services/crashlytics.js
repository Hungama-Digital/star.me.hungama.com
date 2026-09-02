import { Platform } from 'react-native';

let crashlyticsModule = null;

function getCrashlytics() {
  if (Platform.OS === 'web') return null;
  if (crashlyticsModule) return crashlyticsModule;
  try {
    crashlyticsModule = require('@react-native-firebase/crashlytics').default;
    return crashlyticsModule;
  } catch (e) {
    return null;
  }
}

/** Max length for Crashlytics custom key values (256 chars). */
const MAX_KEY_LENGTH = 256;
/** Max breadcrumbs to keep and attach to reports. */
const MAX_BREADCRUMBS = 30;

function truncate(value) {
  const s = String(value ?? '');
  return s.length <= MAX_KEY_LENGTH ? s : s.slice(0, MAX_KEY_LENGTH - 3) + '...';
}

/**
 * Parse error stack and return the first relevant file location for debugging.
 * Prefers app code paths; for Hermes/minified stacks returns the first frame.
 */
function parseStackForLocation(stack) {
  if (!stack || typeof stack !== 'string') return null;
  const lines = stack.split('\n');
  let fallback = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/at\s+(?:[\w.]+\s+\()?(.+?)(?:\s*\))?\s*$/);
    const location = match ? match[1].trim() : line;
    const fileMatch = location.match(/^(.+?):(\d+)(?::(\d+))?$/);
    if (fileMatch) {
      const [, file, lineNum] = fileMatch;
      const loc = `${file}:${lineNum}`;
      if (/[/\\]src[/\\]|shortify|index\.bundle/.test(file) && !/node_modules/.test(file)) {
        return loc;
      }
      if (!fallback && !/node_modules/.test(file)) fallback = loc;
    }
    if (!fallback && (line.startsWith('at ') || /@\d+:\d+/.test(line))) {
      fallback = truncate(line.replace(/^\s*at\s+/, ''));
    }
  }
  return fallback || (lines[0] ? truncate(lines[0]) : null);
}

/** In-memory breadcrumb trail (last N entries) for crash reports. */
const breadcrumbs = [];
/** Current screen/scenario name (set by navigation). */
let currentScreen = '';

const crashlyticsService = {
  async initialize() {
    const crashlytics = getCrashlytics();
    if (!crashlytics) return;
    try {
      await crashlytics().setCrashlyticsCollectionEnabled(true);
      const c = crashlytics();
      let version = '0.0.0';
      let build = '';
      try {
        const Constants = require('expo-constants').default;
        version = Constants?.expoConfig?.version ?? Constants?.manifest?.version ?? version;
        build = String(Constants?.expoConfig?.ios?.buildNumber ?? Constants?.expoConfig?.android?.versionCode ?? Constants?.manifest?.extra?.expoClient?.build ?? '');
      } catch (_) {}
      c.setAttribute('app_version', truncate(version));
      c.setAttribute('build_number', truncate(build));
      c.setAttribute('platform', Platform.OS);
      c.setAttribute('os_version', truncate(Platform.Version));
      c.log(`[Crashlytics] App started v${version} (${build}) ${Platform.OS}`);
      console.log('Crashlytics initialized successfully');
    } catch (e) {
      console.warn('Crashlytics init:', e?.message);
    }
  },

  /**
   * Add a breadcrumb (trail of user actions / flow). Stored in memory and sent as log + custom key on next crash.
   * Use for: screen focus, button taps, video play/pause, share start, auth step, etc.
   */
  addBreadcrumb(message, category = 'user') {
    const crashlytics = getCrashlytics();
    const entry = `[${category}] ${message}`;
    breadcrumbs.push(entry);
    if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
    if (crashlytics) {
      try {
        crashlytics().log(entry);
      } catch (_) {}
    }
  },

  /**
   * Set current scenario/screen name. Included with every crash and in breadcrumbs.
   * Call on every navigation state change.
   */
  setScenario(scenario) {
    currentScreen = String(scenario ?? '');
    const crashlytics = getCrashlytics();
    if (crashlytics) {
      try {
        crashlytics().setAttribute('scenario', truncate(currentScreen));
        crashlytics().setAttribute('screen', truncate(currentScreen));
      } catch (e) {
        console.warn('Crashlytics setScenario:', e?.message);
      }
    }
    this.addBreadcrumb(`Screen: ${currentScreen}`, 'navigation');
  },

  /**
   * Set multiple custom attributes at once (included with the next crash/recordError).
   */
  setContext(attributes) {
    const crashlytics = getCrashlytics();
    if (!crashlytics || !attributes || typeof attributes !== 'object') return;
    try {
      const c = crashlytics();
      Object.entries(attributes).forEach(([key, value]) => {
        if (key && value != null) {
          c.setAttribute(String(key).slice(0, 64), truncate(value));
        }
      });
    } catch (e) {
      console.warn('Crashlytics setContext:', e?.message);
    }
  },

  /**
   * Record a non-fatal error with full context: file_location, scenario, screen, breadcrumbs, error message.
   */
  recordError(error, name, context = {}) {
    const crashlytics = getCrashlytics();
    if (!crashlytics) return;
    try {
      const c = crashlytics();
      const attrs = { ...context };

      if (!attrs.file_location && error?.stack) {
        attrs.file_location = parseStackForLocation(error.stack) ?? '';
      }
      if (!attrs.screen && currentScreen) {
        attrs.screen = currentScreen;
      }
      if (!attrs.scenario && currentScreen) {
        attrs.scenario = currentScreen;
      }
      attrs.error_message = truncate(error?.message ?? error?.toString?.() ?? String(error));

      const trail = breadcrumbs.slice(-15).join(' | ');
      if (trail) {
        attrs.last_breadcrumbs = trail;
        c.log('[Crash context] Breadcrumb trail: ' + trail);
      }
      c.log(`[Crash context] Error: ${attrs.error_message} | Screen: ${attrs.screen || 'unknown'} | Location: ${attrs.file_location || 'unknown'}`);

      Object.entries(attrs).forEach(([key, value]) => {
        if (key && value != null && value !== '') {
          c.setAttribute(String(key).slice(0, 64), truncate(value));
        }
      });

      const err = error instanceof Error ? error : new Error(String(error));
      if (name) {
        c.recordError(err, truncate(name));
      } else {
        c.recordError(err);
      }
    } catch (e) {
      console.warn('Crashlytics recordError:', e?.message);
    }
  },

  log(message) {
    const crashlytics = getCrashlytics();
    if (!crashlytics) return;
    try {
      crashlytics().log(String(message));
    } catch (e) {
      console.warn('Crashlytics log:', e?.message);
    }
  },

  setUserId(userId) {
    const crashlytics = getCrashlytics();
    if (!crashlytics) return;
    try {
      crashlytics().setUserId(String(userId));
    } catch (e) {
      console.warn('Crashlytics setUserId:', e?.message);
    }
  },

  setAttribute(key, value) {
    const crashlytics = getCrashlytics();
    if (!crashlytics) return;
    try {
      crashlytics().setAttribute(String(key).slice(0, 64), truncate(value));
    } catch (e) {
      console.warn('Crashlytics setAttribute:', e?.message);
    }
  },
};

export default crashlyticsService;
