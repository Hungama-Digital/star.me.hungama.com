@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package com.hungama.starme.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.hungama.starme.R

/**
 * Type system.
 *
 * The demo uses two typefaces:
 *   - Display: **Anton** (condensed, heavy, all-caps) — titles, poster billing, numerals.
 *   - Body: **Inter** — everything else.
 *
 * This build ships with *system-font stand-ins* so it compiles and runs with no
 * bundled binaries. To match the demo pixel-for-pixel, the dev team does a
 * one-line swap (see README → "Fonts"):
 *
 *   1. Drop `Anton-Regular.ttf` and `Inter-*.ttf` into `app/src/main/res/font/`.
 *   2. Replace the two families below with `FontFamily(Font(R.font.anton))` etc.
 *
 * Alternatively wire the downloadable Google Fonts provider (also in README).
 */

// Display: Anton (single weight — mapped across the weights the styles request).
val DisplayFontFamily: FontFamily = FontFamily(
    Font(R.font.anton_regular, weight = FontWeight.Normal),
    Font(R.font.anton_regular, weight = FontWeight.Bold),
    Font(R.font.anton_regular, weight = FontWeight.Black),
)

// Body: Inter variable font, weight axis pinned per declared weight.
val BodyFontFamily: FontFamily = FontFamily(
    Font(R.font.inter_variable, weight = FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.inter_variable, weight = FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.inter_variable, weight = FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.inter_variable, weight = FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
)

/** Convenience style for the all-caps condensed display treatment (`.disp` in the demo). */
val DisplayCaps = TextStyle(
    fontFamily = DisplayFontFamily,
    fontWeight = FontWeight.Black,
    letterSpacing = 0.02.em,
)

/** Tabular numerals for the countdown / package episode counts. */
val NumeralStyle = TextStyle(
    fontFamily = DisplayFontFamily,
    fontWeight = FontWeight.Black,
)

val StarTypography = Typography(
    // Hero — "Star in your own Micro Drama"
    displayLarge = TextStyle(
        fontFamily = DisplayFontFamily,
        fontWeight = FontWeight.Black,
        fontSize = 44.sp,
        lineHeight = 43.sp,
        letterSpacing = 0.02.em,
    ),
    // Screen h2
    headlineMedium = TextStyle(
        fontFamily = DisplayFontFamily,
        fontWeight = FontWeight.Black,
        fontSize = 26.sp,
        lineHeight = 30.sp,
        letterSpacing = 0.02.em,
    ),
    titleLarge = TextStyle(
        fontFamily = BodyFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = BodyFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = BodyFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = BodyFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = BodyFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = BodyFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = BodyFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.24.em,
    ),
)
