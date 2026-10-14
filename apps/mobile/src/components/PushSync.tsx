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

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.['url'];
      if (typeof url === 'string' && url.startsWith('/(app)')) router.push(url as Href);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}
