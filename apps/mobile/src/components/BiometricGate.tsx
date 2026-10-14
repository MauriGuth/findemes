import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { isBiometricLockOn, setBiometricLock, unlock } from '@/lib/biometrics';
import { useSession } from '@/lib/session';

/** Away longer than this, the app asks again. */
const RELOCK_MS = 60_000;

type Cover = 'none' | 'privacy' | 'locked';

/**
 * Fingerprint lock (Phase 5). The app stays mounted underneath (open forms, the camera
 * flow and navigation survive); the lock is a cover on top. Leaving the app covers the
 * screen at once so balances never show in the app switcher.
 */
export function BiometricGate({ children }: { children: ReactNode }) {
  const [cover, setCover] = useState<Cover>('locked');
  /** The stored setting was read: only then the lock screen shows its buttons. */
  const [ready, setReady] = useState(false);
  const lockOn = useRef<boolean | null>(null);
  const leftAt = useRef<number | null>(null);
  const signOut = useSession((s) => s.signOut);

  const tryUnlock = useCallback(async () => {
    const result = await unlock();
    if (result === 'ok') setCover('none');
    if (result === 'unavailable') {
      // The phone has no fingerprint or screen lock anymore: never lock the user out.
      await setBiometricLock(false);
      lockOn.current = false;
      setCover('none');
    }
  }, []);

  useEffect(() => {
    void isBiometricLockOn().then((on) => {
      lockOn.current = on;
      setReady(true);
      if (on) void tryUnlock();
      else setCover('none');
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (leftAt.current === null) leftAt.current = Date.now();
        // Read again each time: the switch in Ajustes may have changed it.
        void isBiometricLockOn().then((on) => {
          lockOn.current = on;
        });
        if (lockOn.current) setCover((c) => (c === 'locked' ? c : 'privacy'));
        return;
      }
      if (state === 'active') {
        const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
        leftAt.current = null;
        if (!lockOn.current) {
          setCover('none');
          return;
        }
        if (away > RELOCK_MS) {
          setCover('locked');
          void tryUnlock();
        } else {
          setCover((c) => (c === 'locked' ? c : 'none'));
        }
      }
    });
    return () => sub.remove();
  }, [tryUnlock]);

  const what = Platform.OS === 'ios' ? 'tu cara o tu huella' : 'tu huella';
  return (
    <View style={StyleSheet.absoluteFill}>
      {children}
      {cover !== 'none' ? (
        <View style={StyleSheet.absoluteFill}>
          <Screen className="items-center justify-center gap-6">
            {cover === 'locked' && ready ? (
              <>
                <Text className="text-5xl">🔒</Text>
                <View className="items-center gap-2">
                  <Text className="text-2xl font-bold text-white">Findemes está bloqueado</Text>
                  <Text className="text-base text-slate-400">Usá {what} para entrar.</Text>
                </View>
                <Button label="Desbloquear" onPress={() => void tryUnlock()} />
                <Button label="Cerrar sesión" variant="ghost" onPress={() => void signOut()} />
              </>
            ) : null}
          </Screen>
        </View>
      ) : null}
    </View>
  );
}
