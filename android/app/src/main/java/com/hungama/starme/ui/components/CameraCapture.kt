package com.hungama.starme.ui.components

import android.net.Uri
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.File

private const val TAG = "StarMECamera"

/** Lifecycle-safe, inset-aware front-camera capture with visible failure states. */
@Composable
fun CameraCaptureView(
    onCaptured: (Uri) -> Unit,
    onCancel: () -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val imageCapture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }
    var provider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    var ready by remember { mutableStateOf(false) }
    var capturing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    DisposableEffect(lifecycleOwner) {
        onDispose {
            ready = false
            runCatching { provider?.unbindAll() }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    val future = ProcessCameraProvider.getInstance(ctx)
                    future.addListener({
                        runCatching {
                            val cameraProvider = future.get()
                            check(cameraProvider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) {
                                "No front camera is available on this device."
                            }
                            val preview = Preview.Builder().build().also {
                                it.setSurfaceProvider(surfaceProvider)
                            }
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_FRONT_CAMERA,
                                preview,
                                imageCapture,
                            )
                            provider = cameraProvider
                            ready = true
                            Log.i(TAG, "Front camera ready")
                        }.onFailure { cause ->
                            Log.e(TAG, "Unable to start front camera", cause)
                            error = cause.message ?: "Camera could not start."
                        }
                    }, ContextCompat.getMainExecutor(ctx))
                }
            },
        )

        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(width = 270.dp, height = 360.dp)
                .border(2.dp, Color.White.copy(alpha = 0.72f), RoundedCornerShape(140.dp)),
        )

        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(horizontal = 24.dp, vertical = 18.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Color.Black.copy(alpha = 0.58f))
                .padding(horizontal = 18.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Your close-up", color = Color.White)
            Text(
                "Face the light · remove glasses · hold still",
                color = Color.White.copy(alpha = 0.74f),
            )
        }

        Text(
            text = "Cancel",
            color = Color.White,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(18.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.55f))
                .clickable(onClick = onCancel)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        )

        error?.let { message ->
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color(0xE622151B))
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Camera unavailable", color = Color.White)
                Text(message, color = Color.White.copy(alpha = 0.72f), modifier = Modifier.padding(top = 6.dp))
                Text(
                    "Go back",
                    color = Color(0xFFFFC56E),
                    modifier = Modifier.clickable { onError(message) }.padding(14.dp),
                )
            }
        }

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                // Some OEM full-screen Dialog windows report zero navigation-bar insets.
                // Keep the complete touch target above gesture/three-button navigation regardless.
                .padding(bottom = 96.dp)
                .size(80.dp)
                .semantics { contentDescription = "Take photo" }
                .clip(CircleShape)
                .background(if (ready && !capturing) Color.White else Color.White.copy(alpha = 0.45f))
                .border(5.dp, Color.Black.copy(alpha = 0.32f), CircleShape)
                .clickable(enabled = ready && !capturing && error == null) {
                    capturing = true
                    val file = File(context.cacheDir, "selfie_${System.currentTimeMillis()}.jpg")
                    val output = ImageCapture.OutputFileOptions.Builder(file).build()
                    imageCapture.takePicture(
                        output,
                        ContextCompat.getMainExecutor(context),
                        object : ImageCapture.OnImageSavedCallback {
                            override fun onImageSaved(results: ImageCapture.OutputFileResults) {
                                Log.i(TAG, "Selfie captured")
                                onCaptured(Uri.fromFile(file))
                            }

                            override fun onError(exception: ImageCaptureException) {
                                capturing = false
                                Log.e(TAG, "Selfie capture failed (${exception.imageCaptureError})", exception)
                                error = "We couldn't take that photo. Please hold still and try again."
                            }
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            if (!ready || capturing) CircularProgressIndicator(color = Color.Black, modifier = Modifier.size(28.dp))
        }
    }
}
