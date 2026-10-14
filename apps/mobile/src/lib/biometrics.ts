import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY = 'findemes.biometricLock';

/** The lock lives only on this phone (Phase 5): nothing about it goes to the server. */
export async function isBiometricLockOn(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricLock(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(KEY, '1');
  else await SecureStore.deleteItemAsync(KEY);
}

/** Fingerprint or face set up on the phone. */
export async function canUseBiometrics(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

export type UnlockResult = 'ok' | 'failed' | 'unavailable';

/**
 * The system prompt; the phone's PIN works as a fallback. 'unavailable' means the phone no
 * longer has a fingerprint, face or screen lock: nothing could ever unlock the app.
 */
export async function unlock(): Promise<UnlockResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloqueá Findemes',
      cancelLabel: 'Cancelar',
    });
    if (result.success) return 'ok';
    return ['not_enrolled', 'not_available', 'passcode_not_set'].includes(result.error)
      ? 'unavailable'
      : 'failed';
  } catch {
    return 'failed';
  }
}
