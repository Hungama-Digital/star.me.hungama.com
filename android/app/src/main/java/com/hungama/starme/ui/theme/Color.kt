package com.hungama.starme.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * StarME palette — 1:1 with the approved demo's CSS custom properties.
 * Material 3 only exposes a handful of slots, so the full set lives in
 * [StarColors] and is reached through [LocalStarColors].
 */
object StarPalette {
    val Bg = Color(0xFF0C0A10)
    val Surface = Color(0xFF171320)
    val Surface2 = Color(0xFF1F1A2B)
    val Line = Color(0xFF2B2438)

    val Orange = Color(0xFFFF5A1F)
    val OrangeDeep = Color(0xFFD8430E)
    val Gold = Color(0xFFE9BF6B)
    val Good = Color(0xFF59C98A)

    val Text = Color(0xFFF5F0EA)
    val Dim = Color(0xFF9C93AB)

    // Shell gradients
    val Love1 = Color(0xFF43102B)
    val Love2 = Color(0xFFB01A55)
    val Act1 = Color(0xFF0B1C2E)
    val Act2 = Color(0xFF1E5C8C)

    // Poster / signature accents
    val GoldInk = Color(0xFFF2CD82)
    val ConsentInk = Color(0xFFCFC7DC)
}
