package com.hungama.starme.data.manifest

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.Serializable

/**
 * Typed model of `assets/shells/shells_manifest.json` — the single source of
 * truth for shells, roles, episodes and packages (spec §5). Nothing here is
 * hardcoded elsewhere; screens read this model.
 */
@Serializable
data class ShellManifest(
    val manifestVersion: Int,
    val brand: String,
    val welcomeCredits: Int,
    val packages: List<PackageDef>,
    val shells: List<ShellDef>,
) {
    val liveShells: List<ShellDef> get() = shells.filter { it.isLive }
    fun shell(id: String?): ShellDef? = shells.firstOrNull { it.id == id }
    fun pkg(id: String?): PackageDef? = packages.firstOrNull { it.id == id }
}

@Serializable
data class PackageDef(
    val id: String,
    val name: String,
    val episodes: Int,
    val credits: Int,
    val desc: String,
    val highlight: Boolean = false,
)

@Serializable
data class ShellPalette(
    val c1: String,
    val c2: String,
    val accent: String,
) {
    val color1: Color get() = c1.toColor()
    val color2: Color get() = c2.toColor()
    val accentColor: Color get() = accent.toColor()
}

@Serializable
data class RoleDef(
    val id: String,
    val name: String,
    val desc: String,
)

@Serializable
data class EpisodeDef(
    val n: Int,
    val title: String,
    val file: String? = null,
    val durationSec: Int? = null,
    val placeholder: Boolean = false,
) {
    /** Episodes 4-10 ship with `file: null`; they stay locked until real content lands. */
    val hasContent: Boolean get() = !file.isNullOrBlank()
}

@Serializable
data class ShellDef(
    val id: String,
    val title: String,
    val kicker: String,
    val status: String,
    val palette: ShellPalette? = null,
    val roles: List<RoleDef> = emptyList(),
    val episodes: List<EpisodeDef> = emptyList(),
) {
    val isLive: Boolean get() = status.equals("live", ignoreCase = true)
}

/** Parse a `#RRGGBB` hex string into a Compose [Color]; falls back to the demo ground. */
fun String.toColor(): Color = try {
    val clean = removePrefix("#")
    val v = clean.toLong(16)
    when (clean.length) {
        6 -> Color(0xFF000000 or v)
        8 -> Color(v)
        else -> Color(0xFF0C0A10)
    }
} catch (_: Exception) {
    Color(0xFF0C0A10)
}
