/**
 * MotionPreviewManager — Centralized singleton that ensures only ONE
 * inline motion preview plays at any time across the entire home screen.
 *
 * Usage:
 *   MotionPreviewManager.requestPreview(id, startFn, stopFn)
 *   MotionPreviewManager.cancelPreview(id)
 *   MotionPreviewManager.stopAll()
 */

const PREVIEW_DELAY_MS = 800;

let activePreviewId = null;
let activeStopFn = null;
let pendingTimerId = null;
let pendingId = null;
let requestCounter = 0; // guards against stale async closures

function _clearPending() {
    if (pendingTimerId !== null) {
        clearTimeout(pendingTimerId);
        pendingTimerId = null;
        pendingId = null;
    }
}

function _stopActive() {
    if (activeStopFn) {
        try {
            activeStopFn();
        } catch (e) {
            // Ignore errors during teardown
        }
        activeStopFn = null;
    }
    activePreviewId = null;
}

const MotionPreviewManager = {
    requestPreview(id, startFn, stopFn) {
        // Already active — nothing to do
        if (activePreviewId === id) return;

        // Already pending for this same card — update callbacks but don't restart timer
        if (pendingId === id) {
            activeStopFn = stopFn; // keep stopFn fresh
            return;
        }

        // Cancel any pending delay for a different card
        _clearPending();

        // Stop whatever is currently playing
        _stopActive();

        const myRequest = ++requestCounter;
        pendingId = id;

        pendingTimerId = setTimeout(() => {
            pendingTimerId = null;
            pendingId = null;

            // Guard: another request superseded this one before the timer fired
            if (requestCounter !== myRequest) {
                return;
            }

            activePreviewId = id;
            activeStopFn = stopFn;
            try {
                startFn();
            } catch (e) {
                activePreviewId = null;
                activeStopFn = null;
            }
        }, PREVIEW_DELAY_MS);
    },

    cancelPreview(id) {
        if (pendingId === id) {
            _clearPending();
        }
        if (activePreviewId === id) {
            _stopActive();
        }
    },

    stopAll() {
        _clearPending();
        _stopActive();
        ++requestCounter;
    },

    get activeId() {
        return activePreviewId;
    },
};

export default MotionPreviewManager;
