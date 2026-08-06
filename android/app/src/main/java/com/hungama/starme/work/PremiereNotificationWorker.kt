package com.hungama.starme.work

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.hungama.starme.MainActivity
import com.hungama.starme.R
import com.hungama.starme.util.Demo
import com.hungama.starme.util.Notifications
import java.util.concurrent.TimeUnit

/**
 * Posts the "Your premiere is ready" notification. Scheduled 60s out from the
 * Production screen to demonstrate the real 12-hour delivery push (spec §3.7).
 */
class PremiereNotificationWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val name = inputData.getString(KEY_NAME).orEmpty()

        // Respect the runtime notifications permission (Android 13+).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return Result.success()
        }

        val launch = Intent(applicationContext, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(
            applicationContext,
            0,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val text = if (name.isNotBlank()) {
            "$name, your StarME drama has premiered. Tap to watch."
        } else {
            "Your StarME drama has premiered. Tap to watch."
        }

        val notification = NotificationCompat.Builder(applicationContext, Notifications.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Your premiere is ready")
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        NotificationManagerCompat.from(applicationContext)
            .notify(Notifications.PREMIERE_NOTIFICATION_ID, notification)
        return Result.success()
    }

    companion object {
        private const val KEY_NAME = "name"
        private const val UNIQUE_WORK = "premiere_notification"

        fun schedule(context: Context, name: String) {
            val request = OneTimeWorkRequestBuilder<PremiereNotificationWorker>()
                .setInitialDelay(Demo.PREMIERE_NOTIFICATION_DELAY_SEC, TimeUnit.SECONDS)
                .setInputData(workDataOf(KEY_NAME to name))
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_WORK, androidx.work.ExistingWorkPolicy.REPLACE, request)
        }
    }
}
