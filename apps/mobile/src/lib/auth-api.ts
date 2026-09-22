import { type AuthSession, type AuthTokens, type DeviceInfo } from '@findemes/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { apiPost } from './api';

export function currentDeviceInfo(deviceId: string | null): DeviceInfo {
  return {
    ...(deviceId ? { id: deviceId } : {}),
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    appVersion: Constants.expoConfig?.version ?? undefined,
    name: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 80),
  };
}

export function requestLoginCode(email: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>('/auth/request-code', { email }, { auth: false });
}

export function verifyLoginCode(
  email: string,
  code: string,
  device: DeviceInfo,
): Promise<AuthSession> {
  return apiPost<AuthSession>('/auth/verify-code', { email, code, device }, { auth: false });
}

export function refreshSession(refreshToken: string): Promise<AuthTokens> {
  return apiPost<AuthTokens>('/auth/refresh', { refreshToken }, { auth: false });
}

export function logoutSession(refreshToken: string): Promise<void> {
  return apiPost<void>('/auth/logout', { refreshToken }, { auth: false });
}
