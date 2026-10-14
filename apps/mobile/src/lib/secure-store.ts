import * as SecureStore from 'expo-secure-store';

import { type Tokens } from './auth-tokens';

const KEYS = {
  access: 'findemes.accessToken',
  refresh: 'findemes.refreshToken',
  device: 'findemes.deviceId',
  payday: 'findemes.payday',
} as const;

/** The user's payday, kept so the right month shows before /me answers (or offline). */
export async function loadStoredPayday(): Promise<number> {
  const value = Number(await SecureStore.getItemAsync(KEYS.payday));
  return Number.isInteger(value) && value >= 1 && value <= 28 ? value : 1;
}

export async function storePayday(payday: number): Promise<void> {
  await SecureStore.setItemAsync(KEYS.payday, String(payday));
}

export async function loadStoredSession(): Promise<{
  tokens: Tokens | null;
  deviceId: string | null;
}> {
  const [accessToken, refreshToken, deviceId] = await Promise.all([
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.device),
  ]);
  return {
    tokens: accessToken && refreshToken ? { accessToken, refreshToken } : null,
    deviceId,
  };
}

export async function storeTokens(tokens: Tokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, tokens.accessToken),
    SecureStore.setItemAsync(KEYS.refresh, tokens.refreshToken),
  ]);
}

export async function storeDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.device, deviceId);
}

/** Tokens go; the device id stays so the next login reuses the same Device row. */
export async function clearStoredTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
  ]);
}
