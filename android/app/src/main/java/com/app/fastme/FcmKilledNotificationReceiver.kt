package com.app.fastme

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat


/**
 * Shows a notification when FCM data message is received while app is in background or killed.
 * RN Firebase's setBackgroundMessageHandler (JS) often does not run when app is killed due to
 * OEM restrictions; this native receiver runs when FCM delivers the message and displays the
 * notification so the user always sees it.
 */
class FcmKilledNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        val data = mutableMapOf<String, String>()
        for (key in extras.keySet()) {
            val value = extras.get(key)
            if (value != null) {
                data[key] = value.toString()
            }
        }

        // ✅ If the payload is from MoEngage, return and let the SDK handle it via CustomFirebaseMessagingService.
        // We do NOT abort the broadcast here for now to avoid blocking the service path.
        if (com.moengage.pushbase.MoEPushHelper.getInstance().isFromMoEngagePlatform(extras)) {
            android.util.Log.d("SHORTIFY", "FcmKilledNotificationReceiver: MoEngage payload detected. Letting SDK handle it natively.")
            return
        }

        if (AppState.isInForeground) {
            android.util.Log.d("SHORTIFY", "FcmKilledNotificationReceiver: App is in foreground, ignoring")
            return
        }

        
        val title = extras.getString("gcm.notification.title")
            ?: extras.getString("gcm_title")
            ?: extras.getString("title")
            ?: "Notification"
            
        val body = extras.getString("gcm.notification.body")
            ?: extras.getString("gcm_alert")
            ?: extras.getString("body")
            ?: extras.getString("gcm_subtext")
            ?: "New message"

        showNotification(context, title.toString(), body.toString(), data)
    }

    private fun showNotification(
        context: Context,
        title: String,
        body: String,
        data: Map<String, String>
    ) {
        val channelId = "foreground_push"
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Push Notifications",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                setShowBadge(true)
                enableVibration(true)
                enableLights(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pendingIntent = PendingIntent.getActivity(
            context,
            (System.currentTimeMillis() and 0xffff).toInt(),
            launchIntent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val smallIconId = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(if (smallIconId != 0) smallIconId else android.R.drawable.ic_dialog_info)
            .setColor(ContextCompat.getColor(context, R.color.notification_icon_color))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)

        val largeIconId = context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName)
        if (largeIconId != 0) {
            ContextCompat.getDrawable(context, largeIconId)?.let { drawable ->
                val size = (64 * context.resources.displayMetrics.density).toInt().coerceIn(48, 256)
                val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bitmap)
                drawable.setBounds(0, 0, size, size)
                drawable.draw(canvas)
                builder.setLargeIcon(bitmap)
            }
        }

        try {
            notificationManager.notify((System.currentTimeMillis() and 0x7fffffff).toInt(), builder.build())
        } catch (_: Exception) { }
    }
}
