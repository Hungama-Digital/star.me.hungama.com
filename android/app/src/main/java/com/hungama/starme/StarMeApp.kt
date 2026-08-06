package com.hungama.starme

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.hungama.starme.util.Notifications

class StarMeApp : Application() {

    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        createPremiereChannel()
    }

    private fun createPremiereChannel() {
        val channel = NotificationChannel(
            Notifications.CHANNEL_ID,
            Notifications.CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Notifies you the moment your StarME drama premieres."
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
