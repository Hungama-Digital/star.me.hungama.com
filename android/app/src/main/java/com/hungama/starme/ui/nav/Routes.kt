package com.hungama.starme.ui.nav

/**
 * The eight destinations mirror the demo's state machine (spec §3). Settings is
 * an extra, off-flow destination reached from Premiere.
 */
enum class Step(val route: String) {
    PROMO("promo"),
    SUBSCRIBE("subscribe"),
    CAPTURE("capture"),
    CONSENT("consent"),
    CONCEPT("concept"),
    PACKAGE("package"),
    PRODUCTION("production"),
    PREMIERE("premiere");

    companion object {
        fun fromRoute(route: String?): Step? = entries.firstOrNull { it.route == route }
    }
}

object Routes {
    const val ACCESS = "access"
    const val SETTINGS = "settings"

    /** 0-based index into the 8-segment stepper, or null for off-flow routes. */
    fun stepperIndex(route: String?): Int? = Step.fromRoute(route)?.ordinal

    const val STEP_COUNT = 8
}
