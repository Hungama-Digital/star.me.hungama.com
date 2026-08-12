package com.hungama.starme.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * StarME palette — 1:1 with the approved demo's CSS custom properties.
 * Material 3 only exposes a handful of slots, so the full set lives in
 * [StarColors] and is reached through [LocalStarColors].
 */
object StarPalette {
    // Emergent's strongest contribution was a disciplined cinema palette:
    // near-black neutral surfaces, one red action colour and restrained gold.
    val Bg = Color(0xFF09090C)
    val Surface = Color(0xFF16161D)
    val Surface2 = Color(0xFF22222D)
    val Line = Color(0xFF343443)

    val Orange = Color(0xFFD91E36)
    val OrangeDeep = Color(0xFF8E0F22)
    val Gold = Color(0xFFD4AF37)
    val Good = Color(0xFF2A9D8F)

    val Text = Color(0xFFFFF7F2)
    val Dim = Color(0xFF9C93AB)

    // Shell gradients
    val Love1 = Color(0xFF3C0B2B)
    val Love2 = Color(0xFFD51E62)
    val Act1 = Color(0xFF071C2A)
    val Act2 = Color(0xFF087F93)

    // Poster / signature accents
    val GoldInk = Color(0xFFF2CD82)
    val ConsentInk = Color(0xFFCFC7DC)
}
