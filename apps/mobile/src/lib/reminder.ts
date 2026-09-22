import { buildReminderSchedule, type MonthSummary, todayInArt } from '@findemes/shared';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** One channel, PRIVATE on the lock screen so amounts stay hidden (ADR 008). */
export const REMINDER_CHANNEL_ID = 'daily-summary';

/** Show the reminder even if the app is in the foreground (the user asked for it). */
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
});

/**
 * Android 13+ shows no permission prompt without a channel, and a notification
 * without `channelId` lands in "Miscellaneous" where PRIVATE does not apply.
 * Idempotent: call it before asking and before scheduling.
 */
export async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Resumen diario',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: null,
  });
}

export async function hasReminderPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

/** Only from a user gesture (toggle or card): never on app start. */
export async function requestReminderPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  await ensureReminderChannel();
  const { granted, canAskAgain } = await Notifications.requestPermissionsAsync();
  return { granted, canAskAgain };
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Replaces every scheduled reminder with the next week computed from a fresh
 * summary. `time` null (reminder off) or no permission → just cancels.
 */
export async function syncDailyReminder(
  summary: MonthSummary | undefined,
  time: string | null,
): Promise<void> {
  await cancelDailyReminder();
  if (!summary || !time) return;
  if (!(await hasReminderPermission())) return;
  await ensureReminderChannel();

  const entries = buildReminderSchedule(summary, todayInArt(), time, new Date());
  await Promise.all(
    entries.map((entry) =>
      Notifications.scheduleNotificationAsync({
        content: { title: entry.title, body: entry.body, sound: false },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: entry.at,
          channelId: REMINDER_CHANNEL_ID,
        },
      }),
    ),
  );
}
