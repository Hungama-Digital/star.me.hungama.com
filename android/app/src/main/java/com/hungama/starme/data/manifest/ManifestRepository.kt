package com.hungama.starme.data.manifest

import android.content.Context
import kotlinx.serialization.json.Json

/**
 * Loads and caches the shells manifest from assets. Parsed once; the demo
 * manifest is tiny so a lazy in-memory cache is plenty.
 */
class ManifestRepository(private val appContext: Context) {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    @Volatile
    private var cached: ShellManifest? = null

    fun load(): ShellManifest {
        cached?.let { return it }
        synchronized(this) {
            cached?.let { return it }
            val text = appContext.assets
                .open("shells/shells_manifest.json")
                .bufferedReader()
                .use { it.readText() }
            return json.decodeFromString<ShellManifest>(text).also { cached = it }
        }
    }
}
