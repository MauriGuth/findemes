import * as Notifications from 'expo-notifications';
import { type Href, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useMe } from '@/lib/hooks';
import { registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';

/** Keeps this phone's push token on the server and opens what an alert points to. */
export function PushSync() {
  const router = useRouter();
  const me = useMe();
  const alerts = useSession((s) => s.user?.pushAlerts ?? me.data?.pushAlerts ?? false);

  useEffect(() => {
    if (alerts) void registerForPush();
  }, [alerts]);

  // Also the tap that opened the app from closed: the hook keeps the last response.
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.['url'];
    if (typeof url === 'string' && url.startsWith('/(app)')) {
      router.push(url as Href);
      void Notifications.clearLastNotificationResponseAsync();
    }
  }, [response, router]);

  return null;
}
