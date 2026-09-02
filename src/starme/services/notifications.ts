// src/starme/services/notifications.ts  (guide section 11, Premiere notification)
// The Android build fires 60s out to stand in for the real 12-hour push.
// Uses expo-notifications (the app already ships + patches it) instead of notifee.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const PREMIERE_CHANNEL = 'starme_premiere';
export const PREMIERE_DELAY_SEC = 60;
const PREMIERE_ID = 'premiere_notification'; // same id replaces, never stacks

export async function ensurePremiereChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PREMIERE_CHANNEL, {
      name: 'Premiere updates',
      importance: Notifications.AndroidImportance.HIGH,
      description: 'Notifies you the moment your StarME drama premieres.',
    });
  }
}

export async function schedulePremiereNotification(name: string) {
  const settings = await Notifications.requestPermissionsAsync();
  if (!settings.granted && settings.status !== 'granted') return; // respect a refusal silently
  await ensurePremiereChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: PREMIERE_ID,
    content: {
      title: 'Your premiere is ready',
      body: name.trim()
        ? `${name}, your StarME drama has premiered. Tap to watch.`
        : 'Your StarME drama has premiered. Tap to watch.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: PREMIERE_DELAY_SEC,
      channelId: PREMIERE_CHANNEL,
    },
  });
}
