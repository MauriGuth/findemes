import { requireOptionalNativeModule } from 'expo';

import {
  type CapturedSample,
  type NotificationCaptureNative,
  type QueueStats,
} from './src/NotificationCapture.types';

export type { CapturedSample, QueueStats };

const native = requireOptionalNativeModule<NotificationCaptureNative>('NotificationCapture');

/** False on iOS, web and builds made before the module existed: every call is a no-op. */
export const isSupported = native !== null;

const EMPTY_STATS: QueueStats = {
  pending: 0,
  sent: 0,
  dropped: 0,
  lastUploadAt: null,
  lastCaptureAt: null,
  lastError: null,
  hasToken: false,
  whitelistSize: 0,
};

export function isEnabled(): boolean {
  return native?.isEnabled() ?? false;
}

export function openSettings(): void {
  native?.openSettings();
}

export function openAppDetails(): void {
  native?.openAppDetails();
}

export function setWhitelist(packages: string[]): void {
  native?.setWhitelist(packages);
}

export function setAuthToken(token: string, apiUrl: string): void {
  native?.setAuthToken(token, apiUrl);
}

export function clearAuthToken(): void {
  native?.clearAuthToken();
}

export function getQueueStats(): QueueStats {
  return native?.getQueueStats() ?? EMPTY_STATS;
}

export function flush(): void {
  native?.flush();
}

export function setCaptureMode(on: boolean): void {
  native?.setCaptureMode(on);
}

export function getCaptureMode(): boolean {
  return native?.getCaptureMode() ?? false;
}

export function getCapturedSamples(): CapturedSample[] {
  return native?.getCapturedSamples() ?? [];
}

export function clearCapturedSamples(): void {
  native?.clearCapturedSamples();
}
