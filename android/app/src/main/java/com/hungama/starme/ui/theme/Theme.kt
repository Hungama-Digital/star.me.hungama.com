package com.hungama.starme.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The full StarME palette, carried through the tree so any composable can reach
 * tokens Material 3 does not model (gold, dim, good, shell gradients, …).
 */
@Immutable
data class StarColors(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val line: Color,
    val orange: Color,
    val orangeDeep: Color,
    val gold: Color,
    val good: Color,
    val text: Color,
    val dim: Color,
    val love1: Color,
    val love2: Color,
    val act1: Color,
    val act2: Color,
)

private val StarDark = StarColors(
    bg = StarPalette.Bg,
    surface = StarPalette.Surface,
    surface2 = StarPalette.Surface2,
    line = StarPalette.Line,
    orange = StarPalette.Orange,
    orangeDeep = StarPalette.OrangeDeep,
    gold = StarPalette.Gold,
    good = StarPalette.Good,
    text = StarPalette.Text,
    dim = StarPalette.Dim,
    love1 = StarPalette.Love1,
    love2 = StarPalette.Love2,
    act1 = StarPalette.Act1,
    act2 = StarPalette.Act2,
)

val LocalStarColors = staticCompositionLocalOf { StarDark }

/** Shorthand: `StarTheme.colors.gold`. */
object StarTheme {
    val colors: StarColors
        @Composable get() = LocalStarColors.current
}

private val StarM3ColorScheme = darkColorScheme(
    primary = StarPalette.Orange,
    onPrimary = Color.White,
    secondary = StarPalette.Gold,
    onSecondary = Color(0xFF241A05),
    tertiary = StarPalette.Good,
    background = StarPalette.Bg,
    onBackground = StarPalette.Text,
    surface = StarPalette.Surface,
    onSurface = StarPalette.Text,
    surfaceVariant = StarPalette.Surface2,
    onSurfaceVariant = StarPalette.Dim,
    outline = StarPalette.Line,
    error = Color(0xFFE5484D),
)

/**
 * StarME is dark-only by spec ("Material 3, dark theme only"). [darkTheme] is
 * accepted for previews but the scheme does not change.
 */
@Composable
fun StarMeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = StarM3ColorScheme,
        typography = StarTypography,
        shapes = StarShapes,
    ) {
        androidx.compose.runtime.CompositionLocalProvider(
            LocalStarColors provides StarDark,
            content = content,
        )
    }
}
