package com.hungama.starme.face

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * On-device face detection — the demo stand-in for liveness (spec §1). Reports
 * how many faces are present and whether eyes are open, so the verification
 * sequence can enforce "exactly one face" (spec §8).
 */
class FaceChecker {

    private val detector by lazy {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                .build()
        )
    }

    data class Result(
        val faceCount: Int,
        val eyesOpen: Boolean,
    ) {
        val singleFace: Boolean get() = faceCount == 1
    }

    suspend fun analyze(imageFile: File): Result = withContext(Dispatchers.IO) {
        val bitmap = BitmapFactory.decodeFile(imageFile.absolutePath)
            ?: return@withContext Result(0, eyesOpen = false)
        analyze(bitmap)
    }

    suspend fun analyze(bitmap: Bitmap): Result {
        val input = InputImage.fromBitmap(bitmap, 0)
        val faces = suspendCancellableCoroutine { cont ->
            detector.process(input)
                .addOnSuccessListener { cont.resume(it) }
                .addOnFailureListener { cont.resumeWithException(it) }
        }
        val eyesOpen = faces.firstOrNull()?.let { face ->
            val l = face.leftEyeOpenProbability ?: 1f
            val r = face.rightEyeOpenProbability ?: 1f
            l > 0.4f && r > 0.4f
        } ?: false
        return Result(faceCount = faces.size, eyesOpen = eyesOpen)
    }
}
