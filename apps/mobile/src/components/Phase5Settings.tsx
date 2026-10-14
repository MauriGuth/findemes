import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Platform, Switch, Text, View } from 'react-native';

import { Button, Card, Muted } from '@/components/ui';
import { canUseBiometrics, isBiometricLockOn, setBiometricLock, unlock } from '@/lib/biometrics';
import { errorMessage, useUpdateMe } from '@/lib/hooks';
import { registerForPush, unregisterPush } from '@/lib/push';
import { requestReminderPermission } from '@/lib/reminder';
import { useSession } from '@/lib/session';

/** Ajustes: payday, server alerts and the fingerprint lock (Phase 5). */
export function Phase5Settings() {
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const updateMe = useUpdateMe();
  const [payday, setPayday] = useState(user?.payday ?? 1);
  const [lock, setLock] = useState(false);
  const [biometrics, setBiometrics] = useState(false);

  useEffect(() => {
    void isBiometricLockOn().then(setLock);
    void canUseBiometrics().then(setBiometrics);
  }, []);

  const fail = (title: string) => (e: unknown) => Alert.alert(title, errorMessage(e));

  const savePayday = (value: number) =>
    updateMe.mutate(
      { payday: value },
      {
        // Every month-based screen changes: refetch them all.
        onSuccess: () => void qc.invalidateQueries(),
        onError: fail('No se pudo guardar'),
      },
    );

  const toggleAlerts = async (on: boolean) => {
    if (on) {
      const result = await requestReminderPermission();
      if (!result.granted) {
        Alert.alert(
          'Sin permiso',
          'Activá las notificaciones de Findemes en los ajustes del teléfono.',
        );
        return;
      }
    }
    updateMe.mutate(
      { pushAlerts: on },
      {
        onSuccess: () => void (on ? registerForPush() : unregisterPush()),
        onError: fail('No se pudo cambiar'),
      },
    );
  };

  const toggleLock = async (on: boolean) => {
    // Ask for the fingerprint before turning it on, so nobody locks themselves out.
    if (on && (await unlock()) !== 'ok') return;
    await setBiometricLock(on);
    setLock(on);
  };

  return (
    <>
      <Card>
        <Text className="text-base text-white">Tu día de cobro</Text>
        <Muted>
          Tu mes va de cobro a cobro: “Te quedan” cuenta hasta el próximo día {payday}. Si cobrás el
          1, queda igual que el mes calendario.
        </Muted>
        <View className="flex-row items-center justify-between">
          <Button
            label="−"
            variant="secondary"
            disabled={payday <= 1}
            onPress={() => setPayday((p) => Math.max(1, p - 1))}
          />
          <Text className="text-2xl font-bold text-white">Día {payday}</Text>
          <Button
            label="+"
            variant="secondary"
            disabled={payday >= 28}
            onPress={() => setPayday((p) => Math.min(28, p + 1))}
          />
        </View>
        {payday !== (user?.payday ?? 1) ? (
          <Button label="Guardar" onPress={() => savePayday(payday)} loading={updateMe.isPending} />
        ) : null}
        <Muted>Si cobrás el 29, 30 o 31, elegí el 28.</Muted>
      </Card>

      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base text-white">Alertas al momento</Text>
            <Muted>
              Te avisamos cuando detectamos un gasto o un ingreso, y cuando llegás al 80% de un
              presupuesto.
            </Muted>
          </View>
          <Switch value={user?.pushAlerts ?? false} onValueChange={(on) => void toggleAlerts(on)} />
        </View>
      </Card>

      {biometrics ? (
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base text-white">
                {Platform.OS === 'ios' ? 'Bloqueo con Face ID o huella' : 'Bloqueo con huella'}
              </Text>
              <Muted>Te la pide al abrir la app y al volver después de un minuto.</Muted>
            </View>
            <Switch value={lock} onValueChange={(on) => void toggleLock(on)} />
          </View>
        </Card>
      ) : null}
    </>
  );
}
