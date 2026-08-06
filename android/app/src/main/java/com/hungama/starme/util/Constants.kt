package com.hungama.starme.util

/** Demo-only constants that are not part of the manifest. */
object Demo {
    /** Demo credit top-up granted when a package costs more than the balance. */
    const val TOP_UP_CREDITS = 250

    /** Countdown shown on the Production screen. */
    const val COUNTDOWN_SECONDS = 12 * 3600

    /**
     * Delay before the "Your premiere is ready" notification fires. 60s in the
     * demo to stand in for the real 12-hour push (spec §3.7).
     */
    const val PREMIERE_NOTIFICATION_DELAY_SEC = 60L

    /** Cadence of each on-device verification row (spec §3.3). */
    const val VERIFY_ROW_MS = 650L
}

object Notifications {
    const val CHANNEL_ID = "starme_premiere"
    const val CHANNEL_NAME = "Premiere updates"
    const val PREMIERE_NOTIFICATION_ID = 4201
}
