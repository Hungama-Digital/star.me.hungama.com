package com.hungama.starme.ui.components

import android.net.Uri
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Full-screen CameraX front-camera capture (spec §3.3, "Take selfie"). On
 * capture, writes a JPEG to cache and returns its Uri; the caller runs the same
 * verification path as the Photo Picker.
 */
@Composable
fun CameraCaptureView(
    onCaptured: (Uri) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val imageCapture = remember { ImageCapture.Builder().build() }

    Box(modifier = Modifier
        .fillMaxSize()
        .background(Color.Black)) {

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }
                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                providerFuture.addListener({
                    val provider = providerFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    runCatching {
                        provider.unbindAll()
                        provider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_FRONT_CAMERA,
                            preview,
                            imageCapture,
                        )
                    }
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            },
        )

        // Oval framing guide.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 90.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            Text(
                "Face inside the ring · no sunglasses · no filters",
                color = Color.White.copy(alpha = 0.85f),
            )
        }

        Text(
            text = "Cancel",
            color = Color.White,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(18.dp)
                .clickableNoRipple(onCancel),
        )

        // Shutter.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 42.dp)
                .size(74.dp)
                .clip(CircleShape)
                .background(Color.White)
                .clickableNoRipple {
                    val file = File(context.cacheDir, "selfie_${System.currentTimeMillis()}.jpg")
                    val output = ImageCapture.OutputFileOptions.Builder(file).build()
                    imageCapture.takePicture(
                        output,
                        ContextCompat.getMainExecutor(context),
                        object : ImageCapture.OnImageSavedCallback {
                            override fun onImageSaved(results: ImageCapture.OutputFileResults) {
                                onCaptured(Uri.fromFile(file))
                            }

                            override fun onError(exception: ImageCaptureException) {
                                onCancel()
                            }
                        },
                    )
                },
        )
    }
}

/** Tap handler with no ripple (used on plain overlays). */
private fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier = this.then(
    Modifier.composed {
        val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
        clickable(
            interactionSource = interaction,
            indication = null,
            onClick = onClick,
        )
    }
)
