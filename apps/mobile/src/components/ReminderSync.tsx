import { useEffect } from 'react';
import { AppState } from 'react-native';

import { currentMonthKey } from '@/lib/format';
import { useMe, useSummary } from '@/lib/hooks';
import { syncDailyReminder } from '@/lib/reminder';
import { useSession } from '@/lib/session';

/**
 * Keeps the local reminders in sync with the latest summary and the user's
 * reminder time: on every summary refetch (mutations invalidate it), on the
 * time change, and when the app returns to the foreground.
 */
export function ReminderSync() {
  const summary = useSummary(currentMonthKey());
  const me = useMe();
  const time = useSession((s) => s.user?.dailyReminderTime ?? me.data?.dailyReminderTime ?? null);

  useEffect(() => {
    void syncDailyReminder(summary.data, time);
  }, [summary.data, time]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void summary.refetch();
      }
    });
    return () => sub.remove();
  }, [summary]);

  return null;
}
