import { useEffect } from 'react';
import { AppState } from 'react-native';

import { nextMonthKey } from '@findemes/shared';

import { useBills, useCurrentMonthKey, useMe, useSummary } from '@/lib/hooks';
import { syncDailyReminder } from '@/lib/reminder';
import { useSession } from '@/lib/session';

/**
 * Keeps the local reminders in sync with the latest summary and the user's
 * reminder time: on every summary refetch (mutations invalidate it), on the
 * time change, and when the app returns to the foreground.
 */
export function ReminderSync() {
  const month = useCurrentMonthKey();
  const summary = useSummary(month);
  const bills = useBills(month);
  // Bills due early next month fall inside the 14-day reminder window too.
  const nextBills = useBills(nextMonthKey(month));
  const me = useMe();
  const time = useSession((s) => s.user?.dailyReminderTime ?? me.data?.dailyReminderTime ?? null);

  useEffect(() => {
    void syncDailyReminder(summary.data, time, [...(bills.data ?? []), ...(nextBills.data ?? [])]);
  }, [summary.data, time, bills.data, nextBills.data]);

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
