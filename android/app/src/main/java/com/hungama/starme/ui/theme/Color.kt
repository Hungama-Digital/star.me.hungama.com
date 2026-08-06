package com.hungama.starme.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * StarME palette — 1:1 with the approved demo's CSS custom properties.
 * Material 3 only exposes a handful of slots, so the full set lives in
 * [StarColors] and is reached through [LocalStarColors].
 */
object StarPalette {
    val Bg = Color(0xFF09070D)
    val Surface = Color(0xFF17121E)
    val Surface2 = Color(0xFF21182A)
    val Line = Color(0xFF3B2D45)

    val Orange = Color(0xFFFF4F6D)
    val OrangeDeep = Color(0xFFB71949)
    val Gold = Color(0xFFFFC56E)
    val Good = Color(0xFF63D7AE)

    val Text = Color(0xFFFFF7F2)
    val Dim = Color(0xFFB8AABD)

    // Shell gradients
    val Love1 = Color(0xFF3C0B2B)
    val Love2 = Color(0xFFD51E62)
    val Act1 = Color(0xFF071C2A)
    val Act2 = Color(0xFF087F93)

    // Poster / signature accents
    val GoldInk = Color(0xFFF2CD82)
    val ConsentInk = Color(0xFFCFC7DC)
}
