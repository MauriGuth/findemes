import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiPut } from './api';

/** Server alerts: their own channel, separate from the daily summary (ADR 015). */
export const ALERTS_CHANNEL_ID = 'alerts';

async function ensureAlertsChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
    name: 'Alertas de movimientos',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * Registers this phone for server alerts when notifications are already allowed (the
 * permission is only asked from a toggle). Without FCM set up in EAS there is no token:
 * the alerts simply never arrive and nothing breaks.
 */
export async function registerForPush(): Promise<boolean> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return false;
    await ensureAlertsChannel();
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
    await apiPut<void>('/devices/current/push-token', { token: data });
    return true;
  } catch {
    return false;
  }
}

export async function unregisterPush(): Promise<void> {
  try {
    await apiPut<void>('/devices/current/push-token', { token: null });
  } catch {
    // Best effort: the server stops anyway when alerts are turned off.
  }
}
