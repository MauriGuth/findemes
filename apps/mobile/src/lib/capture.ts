import { type IngestToken } from '@findemes/shared';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import * as Capture from '../../modules/notification-capture';
import { apiBaseUrl, apiDelete, apiPost } from './api';

const ISSUED_AT_KEY = 'findemes.ingestIssuedAt';
const ROTATE_DAYS_KEY = 'findemes.ingestRotateDays';

export const captureSupported = Capture.isSupported;

/**
 * Turns automatic capture on for this phone: a fresh device ingest token (ADR 009) and the
 * whitelist go to the native module, which keeps them encrypted and uploads on its own.
 */
export async function enableCapture(): Promise<void> {
  const issued = await apiPost<IngestToken>('/devices/current/ingest-token');
  Capture.setWhitelist(issued.packages);
  Capture.setAuthToken(issued.token, apiBaseUrl());
  await SecureStore.setItemAsync(ISSUED_AT_KEY, issued.issuedAt);
  await SecureStore.setItemAsync(ROTATE_DAYS_KEY, String(issued.rotateAfterDays));
}

/** Local wipe only (logout and account deletion already revoke the token on the server). */
export async function forgetCapture(): Promise<void> {
  Capture.clearAuthToken();
  await SecureStore.deleteItemAsync(ISSUED_AT_KEY);
  await SecureStore.deleteItemAsync(ROTATE_DAYS_KEY);
}

export async function disableCapture(): Promise<void> {
  try {
    await apiDelete<void>('/devices/current/ingest-token');
  } finally {
    await forgetCapture();
  }
}

/** When the app opens: replace a token older than the rotation period, then retry the queue. */
export async function refreshCapture(): Promise<void> {
  if (!Capture.getQueueStats().hasToken) return;
  const issuedAt = await SecureStore.getItemAsync(ISSUED_AT_KEY);
  const rotateDays = Number((await SecureStore.getItemAsync(ROTATE_DAYS_KEY)) ?? '30');
  const age = issuedAt ? Date.now() - new Date(issuedAt).getTime() : Infinity;
  if (age > rotateDays * 86_400_000) await enableCapture();
  Capture.flush();
}

export type CaptureState =
  | { kind: 'unsupported' }
  | { kind: 'off' }
  | { kind: 'needsPermission'; stats: Capture.QueueStats }
  | { kind: 'on'; stats: Capture.QueueStats };

function readState(): CaptureState {
  if (!Capture.isSupported) return { kind: 'unsupported' };
  const stats = Capture.getQueueStats();
  if (!stats.hasToken) return { kind: 'off' };
  return Capture.isEnabled() ? { kind: 'on', stats } : { kind: 'needsPermission', stats };
}

/** Native state, re-read when the app comes back (the user may have just granted access). */
export function useCaptureState(): { state: CaptureState; refresh: () => void } {
  const [state, setState] = useState<CaptureState>(readState);
  const refresh = useCallback(() => setState(readState()), []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return { state, refresh };
}

const ERRORS: Record<string, string> = {
  offline: 'Sin conexión: lo mandamos cuando vuelva internet.',
  unavailable: 'El servidor no está recibiendo todavía. Reintentamos solos.',
  unauthorized: 'La captura se desactivó. Activala de nuevo.',
  rejected: 'Algunas notificaciones no se pudieron procesar.',
};

export function captureErrorText(error: string | null): string | null {
  if (!error) return null;
  return ERRORS[error] ?? 'Hubo un problema al subir. Reintentamos solos.';
}

export { Capture };
