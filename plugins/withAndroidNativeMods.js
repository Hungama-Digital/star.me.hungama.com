const {
  withDangerousMod,
  withAndroidManifest,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// MoEngage: workspace ID and data center (1 = DC_01, same as iOS). Required for native init.
const MOENGAGE_WORKSPACE_ID = 'N1HHQFTNK11YN4GSI4XC904M';
const MOENGAGE_DATA_CENTER = 1; // DATA_CENTER_1 = dashboard-01.moengage.com

const MOENGAGE_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="com_moengage_core_workspace_id">${MOENGAGE_WORKSPACE_ID}</string>
    <integer name="com_moengage_core_data_center">${MOENGAGE_DATA_CENTER}</integer>
</resources>
`;

const APP_STATE_KT = `package {{package}}

/**
 * Tracks whether the app is in foreground. Set from MainActivity so that
 * FcmKilledNotificationReceiver can avoid showing a duplicate when app is in foreground.
 */
object AppState {
    @Volatile
    var isInForeground: Boolean = false
        private set

    fun setForeground(value: Boolean) {
        isInForeground = value
    }
}
`;

const FCM_RECEIVER_KT = `package {{package}}

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
import com.google.firebase.messaging.RemoteMessage

/**
 * Shows a notification when FCM data message is received while app is in background or killed.
 * RN Firebase's setBackgroundMessageHandler (JS) often does not run when app is killed due to
 * OEM restrictions; this native receiver runs when FCM delivers the message and displays the
 * notification so the user always sees it.
 */
class FcmKilledNotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.extras == null) return
        if (AppState.isInForeground) return

        val remoteMessage = RemoteMessage(intent.extras!!)
        val notification = remoteMessage.notification
        val data = remoteMessage.data

        val title = notification?.title
            ?: data["gcm_title"]
            ?: data["title"]
            ?: "Notification"
        val body = notification?.body
            ?: data["gcm_alert"]
            ?: data["body"]
            ?: data["gcm_subtext"]
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
                enableVibrate(true)
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
`;

const MAIN_ACTIVITY_OVERRIDES = `
  override fun onResume() {
    super.onResume()
    AppState.setForeground(true)
  }

  override fun onPause() {
    super.onPause()
    AppState.setForeground(false)
  }
`;

// MoEngage native init (must run in Application.onCreate). Data center set here; matches iOS Info.plist.
const MAIN_APPLICATION_MOENGAGE_IMPORTS = `import com.moengage.core.DataCenter
import com.moengage.core.MoEngage
import com.moengage.react.MoEInitializer
`;

const MAIN_APPLICATION_MOENGAGE_ONCREATE = `
    val moEngage = MoEngage.Builder(this, "${MOENGAGE_WORKSPACE_ID}", DataCenter.DATA_CENTER_1).build()
    MoEInitializer.initializeDefaultInstance(this, moEngage)
`;

/**
 * Android native mods that must survive prebuild:
 * - FCM killed-state notifications (AppState, FcmKilledNotificationReceiver, MainActivity, manifest)
 * - MoEngage (moengage.xml, MainApplication init)
 * - Deep-link intent-filter (hmini + exp+hungama)
 */
function withAndroidNativeMods(config) {
  const packageName = config.android?.package ?? 'com.app.hmini';
  const packagePath = packageName.replace(/\./g, '/');

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      const javaDir = path.join(platformRoot, 'app', 'src', 'main', 'java', packagePath);
      const resValuesDir = path.join(platformRoot, 'app', 'src', 'main', 'res', 'values');

      await fs.promises.mkdir(javaDir, { recursive: true });
      await fs.promises.mkdir(resValuesDir, { recursive: true });

      await fs.promises.writeFile(
        path.join(javaDir, 'AppState.kt'),
        APP_STATE_KT.replace(/\{\{package\}\}/g, packageName)
      );
      await fs.promises.writeFile(
        path.join(javaDir, 'FcmKilledNotificationReceiver.kt'),
        FCM_RECEIVER_KT.replace(/\{\{package\}\}/g, packageName)
      );

      await fs.promises.writeFile(path.join(resValuesDir, 'moengage.xml'), MOENGAGE_XML);

      const mainActivityPath = path.join(javaDir, 'MainActivity.kt');
      let mainActivityContent = await fs.promises.readFile(mainActivityPath, 'utf8');
      if (!mainActivityContent.includes('AppState.setForeground')) {
        const insertBefore = 'override fun getMainComponentName()';
        const idx = mainActivityContent.indexOf(insertBefore);
        if (idx !== -1) {
          mainActivityContent =
            mainActivityContent.slice(0, idx) +
            MAIN_ACTIVITY_OVERRIDES +
            '\n  ' +
            mainActivityContent.slice(idx);
          await fs.promises.writeFile(mainActivityPath, mainActivityContent);
        }
      }

      const mainApplicationPath = path.join(javaDir, 'MainApplication.kt');
      let mainAppContent = await fs.promises.readFile(mainApplicationPath, 'utf8');
      if (!mainAppContent.includes('MoEInitializer.initializeDefaultInstance')) {
        if (!mainAppContent.includes('import com.moengage')) {
          const lastImportIdx = mainAppContent.lastIndexOf('import ');
          const endOfLastImport = mainAppContent.indexOf('\n', lastImportIdx) + 1;
          mainAppContent =
            mainAppContent.slice(0, endOfLastImport) +
            MAIN_APPLICATION_MOENGAGE_IMPORTS +
            mainAppContent.slice(endOfLastImport);
        }
        const onCreateSuper = 'super.onCreate()';
        const insertAfterSuper = mainAppContent.indexOf(onCreateSuper);
        if (insertAfterSuper !== -1) {
          const endOfLine = mainAppContent.indexOf('\n', insertAfterSuper) + 1;
          mainAppContent =
            mainAppContent.slice(0, endOfLine) +
            MAIN_APPLICATION_MOENGAGE_ONCREATE +
            mainAppContent.slice(endOfLine);
          await fs.promises.writeFile(mainApplicationPath, mainAppContent);
        }
      }

      return config;
    },
  ]);

  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest?.application?.[0];
    if (!application) return config;

    // Safety net: allow larger heap so app doesn't OOM when repeating Subscribe → WebView → close (see docs/OOM_FLOW_ANALYSIS.md)
    if (application.$) {
      application.$['android:largeHeap'] = 'true';
      // After uninstall/reinstall user must see login; do not restore auth/guest from Android Auto Backup
      application.$['android:allowBackup'] = 'false';
    }

    const hasReceiver = Array.isArray(application.receiver) &&
      application.receiver.some((r) => r.$?.['android:name'] === '.FcmKilledNotificationReceiver');
    if (!hasReceiver) {
      const receiver = {
        $: {
          'android:name': '.FcmKilledNotificationReceiver',
          'android:exported': 'true',
          'android:permission': 'com.google.android.c2dm.permission.SEND',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' },
            action: [{ $: { 'android:name': 'com.google.android.c2dm.intent.RECEIVE' } }],
          },
        ],
      };
      if (!application.receiver) application.receiver = [];
      application.receiver.push(receiver);
    }

    const activities = application.activity;
    const activityList = Array.isArray(activities) ? activities : activities ? [activities] : [];
    const mainActivity = activityList.find((a) => a?.$?.['android:name'] === '.MainActivity');
    if (mainActivity) {
      const intentFilters = mainActivity['intent-filter'];
      const list = Array.isArray(intentFilters) ? intentFilters : [];
      let filtersToAdd = [];

      const hasDeepLink = list.some((intentFilter) => {
        const actions = (intentFilter.action || []).map((a) => a?.$?.['android:name']).filter(Boolean);
        const data = (intentFilter.data || []).map((d) => d?.$?.['android:scheme']).filter(Boolean);
        return (
          actions.includes('android.intent.action.VIEW') &&
          !actions.includes('android.intent.action.MAIN') &&
          data.includes('hmini') &&
          data.includes('exp+hungama')
        );
      });
      if (!hasDeepLink) {
        filtersToAdd.push({
          action: [
            { $: { 'android:name': 'android.intent.action.VIEW' } },
          ],
          category: [
            { $: { 'android:name': 'android.intent.category.DEFAULT' } },
            { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
          ],
          data: [
            { $: { 'android:scheme': 'hmini' } },
            { $: { 'android:scheme': 'exp+hungama' } },
          ],
        });
      }

      const hasAppLinks = list.some((intentFilter) => {
        const data = intentFilter.data || [];
        return data.some(
          (d) => d?.$?.['android:scheme'] === 'https' && d?.$?.['android:host'] === 'fasttv.app'
        );
      });
      if (!hasAppLinks) {
        filtersToAdd.push({
          $: { 'android:autoVerify': 'true' },
          action: [
            { $: { 'android:name': 'android.intent.action.VIEW' } },
          ],
          category: [
            { $: { 'android:name': 'android.intent.category.DEFAULT' } },
            { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
          ],
          data: [
            { $: { 'android:scheme': 'https', 'android:host': 'fasttv.app', 'android:pathPrefix': '/' } },
          ],
        });
      }

      if (filtersToAdd.length > 0) {
        mainActivity['intent-filter'] = list.concat(filtersToAdd);
      }
    }

    return config;
  });

  return config;
}

module.exports = withAndroidNativeMods;
