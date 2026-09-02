package com.app.fastme

/**
 * Tracks whether the app is in foreground. Set from MainActivity so that
 * FcmKilledNotificationReceiver can avoid showing a duplicate when app is in foreground.
 */
object AppState {
    @Volatile
    var isInForeground: Boolean = false
        private set

    fun setForeground(value: Boolean) {
        isInForeground = value
    }
}
