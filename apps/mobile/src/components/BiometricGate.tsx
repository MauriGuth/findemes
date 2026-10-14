import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { isBiometricLockOn, unlock } from '@/lib/biometrics';

/** Away longer than this, the app locks again. */
const RELOCK_MS = 60_000;

/** Covers the app with a lock when the fingerprint lock is on (Phase 5). */
export function BiometricGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const leftAt = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    if (await unlock()) setLocked(false);
  }, []);

  useEffect(() => {
    void isBiometricLockOn().then((on) => {
      setLocked(on);
      if (on) void tryUnlock();
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current && Date.now() - leftAt.current > RELOCK_MS) {
        leftAt.current = null;
        void isBiometricLockOn().then((on) => {
          if (!on) return;
          setLocked(true);
          void tryUnlock();
        });
      }
    });
    return () => sub.remove();
  }, [tryUnlock]);

  if (locked === null) return null;
  if (!locked) return <>{children}</>;
  return (
    <Screen className="items-center justify-center gap-6">
      <Text className="text-5xl">🔒</Text>
      <View className="items-center gap-2">
        <Text className="text-2xl font-bold text-white">Findemes está bloqueado</Text>
        <Text className="text-base text-slate-400">Usá tu huella para entrar.</Text>
      </View>
      <Button label="Desbloquear" onPress={() => void tryUnlock()} />
    </Screen>
  );
}
