package com.app.fastme
import android.util.Log


import com.google.firebase.messaging.RemoteMessage
import com.moengage.firebase.MoEFireBaseHelper
import com.moengage.pushbase.MoEPushHelper
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService

class CustomFirebaseMessagingService : ReactNativeFirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d("SHORTIFY", "CustomFirebaseMessagingService: onMessageReceived from ${remoteMessage.from}")
        if (MoEPushHelper.getInstance().isFromMoEngagePlatform(remoteMessage.data)) {
            Log.d("SHORTIFY", "CustomFirebaseMessagingService: Passing MoEngage payload to SDK: ${remoteMessage.data}")
            MoEFireBaseHelper.getInstance().passPushPayload(this, remoteMessage.data)
        } else {
            Log.d("SHORTIFY", "CustomFirebaseMessagingService: Non-MoEngage payload, passing to RNFirebase")
            super.onMessageReceived(remoteMessage)
        }
    }

    override fun onNewToken(token: String) {
        Log.d("SHORTIFY", "CustomFirebaseMessagingService: onNewToken received: $token")
        MoEFireBaseHelper.getInstance().passPushToken(applicationContext, token)
        super.onNewToken(token)
    }
}
