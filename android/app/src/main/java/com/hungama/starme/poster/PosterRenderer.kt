package com.hungama.starme.poster

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Build
import androidx.core.content.res.ResourcesCompat
import com.hungama.starme.R
import com.hungama.starme.data.manifest.ShellDef

/**
 * Native Canvas poster — 900×1350 PNG, matching the demo's composition exactly
 * (spec §6). Anton/Inter are approximated with condensed/sans system typefaces
 * here; drop the real typefaces in and swap [displayFace]/[bodyFace] for a
 * pixel-exact match (see README → Fonts).
 */
object PosterRenderer {

    private const val W = 900
    private const val H = 1350

    // Bundled Anton / Inter, loaded on first render; system faces as fallback.
    private var displayFace: Typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
    private var bodyFace: Typeface = Typeface.create("sans-serif", Typeface.NORMAL)
    private var bodyMedium: Typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    private var fontsLoaded = false

    private fun loadFonts(context: Context) {
        if (fontsLoaded) return
        ResourcesCompat.getFont(context, R.font.anton_regular)?.let { displayFace = it }
        ResourcesCompat.getFont(context, R.font.inter_variable)?.let { inter ->
            bodyFace = inter
            bodyMedium = if (Build.VERSION.SDK_INT >= 28) Typeface.create(inter, 500, false) else inter
        }
        fontsLoaded = true
    }

    fun render(
        context: Context,
        photoPath: String?,
        name: String,
        shell: ShellDef,
        episodeCount: Int,
        consentRef: String,
    ): Bitmap {
        loadFonts(context)
        val bitmap = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val c = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        // Ground
        paint.color = Color.parseColor("#0B0810")
        c.drawRect(0f, 0f, W.toFloat(), H.toFloat(), paint)

        // User photo — cover fit, weighted to the upper portion.
        val photo = photoPath?.let { runCatching { BitmapFactory.decodeFile(it) }.getOrNull() }
        if (photo != null) {
            val r = maxOf(W.toFloat() / photo.width, H.toFloat() / photo.height)
            val w = photo.width * r
            val h = photo.height * r
            val left = (W - w) / 2f
            val top = (H - h) / 2f * 0.6f
            c.drawBitmap(photo, null, Rect(left.toInt(), top.toInt(), (left + w).toInt(), (top + h).toInt()), paint)
        }

        // Bottom darkening gradient
        paint.shader = LinearGradient(
            0f, H * 0.35f, 0f, H.toFloat(),
            intArrayOf(Color.parseColor("#000A070E"), Color.parseColor("#B80A070E"), Color.parseColor("#F70A070E")),
            floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP,
        )
        c.drawRect(0f, 0f, W.toFloat(), H.toFloat(), paint)

        // Shell tint (horizontal)
        val tint = if (shell.id == "love" || shell.isLove()) {
            intArrayOf(Color.parseColor("#33B01A55"), Color.parseColor("#3D43102B"))
        } else {
            intArrayOf(Color.parseColor("#331E5C8C"), Color.parseColor("#420B1C2E"))
        }
        paint.shader = LinearGradient(0f, 0f, W.toFloat(), 0f, tint, null, Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, W.toFloat(), H.toFloat(), paint)
        paint.shader = null

        // Type stack (centred)
        paint.textAlign = Paint.Align.CENTER

        paint.typeface = bodyMedium
        paint.color = Color.parseColor("#D8CFE2")
        paint.textSize = 26f
        c.drawText("F A S T   T V   P R E S E N T S   A   S T A R M E   O R I G I N A L", W / 2f, H - 395f, paint)

        paint.typeface = displayFace
        paint.color = Color.parseColor("#F2CD82")
        paint.textSize = 70f
        c.drawText(name.ifBlank { "You" }.uppercase(), W / 2f, H - 310f, paint)

        paint.typeface = bodyMedium
        paint.color = Color.parseColor("#CFC7DC")
        paint.textSize = 24f
        c.drawText("I N", W / 2f, H - 262f, paint)

        paint.typeface = displayFace
        paint.color = Color.WHITE
        paint.textSize = 150f
        c.drawText(shell.title.uppercase(), W / 2f, H - 130f, paint)

        paint.typeface = bodyMedium
        paint.color = Color.parseColor("#9C93AB")
        paint.textSize = 22f
        val epWord = if (episodeCount > 1) "EPISODES" else "EPISODE"
        c.drawText("${shell.kicker.uppercase()}  ·  $episodeCount $epWord  ·  AI PERSONALISED", W / 2f, H - 58f, paint)

        // Content credentials (left aligned)
        paint.textAlign = Paint.Align.LEFT
        paint.typeface = bodyMedium
        paint.color = Color.parseColor("#80FFFFFF")
        paint.textSize = 18f
        c.drawText("◈ Content credentials · $consentRef", 28f, H - 24f, paint)

        return bitmap
    }
}

private fun ShellDef.isLove(): Boolean =
    palette?.c2?.equals("#B01A55", ignoreCase = true) == true
