package com.hungama.starme.util

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import java.io.File
import java.io.FileOutputStream

/**
 * All StarME-private files live in app-internal storage and never leave the
 * device in this build (spec §8). Directory layout:
 *
 *   filesDir/consent/photo_{ref}.jpg    — the cast photo
 *   filesDir/consent/sig_{ref}.png      — the finger signature
 *   filesDir/posters/StarME_{ref}.png   — generated poster
 *   filesDir/episodes/{orderId}_ep{n}.mp4 — "downloaded" episode copies
 *   cacheDir/shared/…                   — transient copies staged for share sheet
 */
class FileStore(context: Context) {

    private val app = context.applicationContext

    private fun dir(name: String): File = File(app.filesDir, name).apply { mkdirs() }

    fun consentDir(): File = dir("consent")
    fun postersDir(): File = dir("posters")
    fun episodesDir(): File = dir("episodes")
    fun sharedCacheDir(): File = File(app.cacheDir, "shared").apply { mkdirs() }

    /** Copies a picked/captured image into internal storage; returns the local file. */
    fun copyImageToTemp(uri: Uri): File {
        val out = File(consentDir(), "capture_${System.currentTimeMillis()}.jpg")
        app.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Cannot open image stream for $uri" }
            FileOutputStream(out).use { input.copyTo(it) }
        }
        return out
    }

    /**
     * Commits the captured photo and signature under the consent [ref].
     * Returns (photoPath, signaturePath) as absolute file paths.
     */
    fun commitConsentAssets(ref: String, photoSource: File?, signature: Bitmap?): Pair<String?, String?> {
        val photoPath = photoSource?.let { src ->
            val dest = File(consentDir(), "photo_$ref.jpg")
            src.copyTo(dest, overwrite = true)
            dest.absolutePath
        }
        val sigPath = signature?.let { bmp ->
            val dest = File(consentDir(), "sig_$ref.png")
            FileOutputStream(dest).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            dest.absolutePath
        }
        return photoPath to sigPath
    }

    fun savePosterPng(ref: String, bitmap: Bitmap): File {
        val dest = File(postersDir(), "StarME_$ref.png")
        FileOutputStream(dest).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return dest
    }

    /** Stages a copy of [file] into the share cache and returns it. */
    fun stageForShare(file: File): File {
        val dest = File(sharedCacheDir(), file.name)
        file.copyTo(dest, overwrite = true)
        return dest
    }

    /** Deletes the on-device biometric files for a consent ref (revocation). */
    fun deleteConsentAssets(ref: String) {
        File(consentDir(), "photo_$ref.jpg").delete()
        File(consentDir(), "sig_$ref.png").delete()
    }
}
