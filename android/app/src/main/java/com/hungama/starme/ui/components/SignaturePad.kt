package com.hungama.starme.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize

/**
 * Holds the finger-drawn strokes and can rasterise them to a PNG bitmap for the
 * consent record. Hoisted so the consent screen can read [hasInk] and export.
 */
@Stable
class SignatureController {
    val strokes: SnapshotStateList<SnapshotStateList<Offset>> = mutableStateListOf()
    var canvasSize by mutableStateOf(IntSize.Zero)

    val hasInk: Boolean get() = strokes.any { it.size > 1 }

    fun startStroke(point: Offset) {
        strokes.add(mutableStateListOf(point))
    }

    fun appendPoint(point: Offset) {
        strokes.lastOrNull()?.add(point)
    }

    fun clear() {
        strokes.clear()
    }

    /** Renders the strokes to a transparent PNG-ready bitmap, or null if empty. */
    fun toBitmap(): Bitmap? {
        val size = canvasSize
        if (!hasInk || size.width == 0 || size.height == 0) return null
        val bitmap = Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
        val canvas = AndroidCanvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = SIGNATURE_ARGB
            style = Paint.Style.STROKE
            strokeWidth = 5f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        strokes.forEach { pts ->
            if (pts.size > 1) {
                val path = AndroidPath().apply {
                    moveTo(pts[0].x, pts[0].y)
                    for (i in 1..pts.lastIndex) lineTo(pts[i].x, pts[i].y)
                }
                canvas.drawPath(path, paint)
            }
        }
        return bitmap
    }

    private companion object {
        // Gold ink (#F2CD82) matching the demo signature stroke.
        const val SIGNATURE_ARGB = 0xFFF2CD82.toInt()
    }
}

@Composable
fun rememberSignatureController(): SignatureController = remember { SignatureController() }

/** The signature drawing surface. */
@Composable
fun SignaturePad(
    controller: SignatureController,
    modifier: Modifier = Modifier,
) {
    Canvas(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF100D17))
            .onSizeChanged { controller.canvasSize = it }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { controller.startStroke(it) },
                    onDrag = { change, _ ->
                        change.consume()
                        controller.appendPoint(change.position)
                    },
                )
            },
    ) {
        controller.strokes.forEach { pts ->
            if (pts.size > 1) {
                val path = Path().apply {
                    moveTo(pts[0].x, pts[0].y)
                    for (i in 1..pts.lastIndex) lineTo(pts[i].x, pts[i].y)
                }
                drawPath(
                    path = path,
                    color = Color(0xFFF2CD82),
                    style = Stroke(width = 5f, cap = StrokeCap.Round, join = StrokeJoin.Round),
                )
            }
        }
    }
}
