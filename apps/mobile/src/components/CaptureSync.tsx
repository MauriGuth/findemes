import { useEffect } from 'react';
import { AppState } from 'react-native';

import { refreshCapture } from '@/lib/capture';

/** On open and on every return to the foreground: rotate an old ingest token and retry the queue. */
export function CaptureSync() {
  useEffect(() => {
    void refreshCapture().catch(() => undefined);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshCapture().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);
  return null;
}
