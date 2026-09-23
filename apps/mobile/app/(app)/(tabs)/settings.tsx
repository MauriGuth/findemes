import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';

import { CaptureCard } from '@/components/CaptureCard';
import { Button, Card, Chip, Muted, Row, Screen, TextField, Title } from '@/components/ui';
import { errorMessage, useDeleteMe, useMe, useUpdateMe } from '@/lib/hooks';
import {
  cancelDailyReminder,
  hasReminderPermission,
  requestReminderPermission,
} from '@/lib/reminder';
import { useSession } from '@/lib/session';

const DEFAULT_TIME = '20:00';
const STEP_MINUTES = 15;

function shiftTime(time: string, minutes: number): string {
  const [h = 20, m = 0] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Remounted (via `key`) when the server value changes, so no effect is needed to reset it. */
function NameField({ initial, onSave }: { initial: string; onSave: (value: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <TextField
      label="Nombre"
      placeholder="¿Cómo te llamás?"
      value={name}
      onChangeText={setName}
      onBlur={() => onSave(name)}
      onSubmitEditing={() => onSave(name)}
      returnKeyType="done"
      autoCapitalize="words"
    />
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const me = useMe();
  const updateMe = useUpdateMe();
  const deleteMe = useDeleteMe();
  const signOut = useSession((s) => s.signOut);
  const forget = useSession((s) => s.forget);
  const user = useSession((s) => s.user) ?? me.data ?? null;

  const [permission, setPermission] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    void hasReminderPermission().then(setPermission);
  }, []);

  const fail = (title: string) => (e: unknown) => Alert.alert(title, errorMessage(e));
  const reminderOn = !!user?.dailyReminderTime;
  const time = user?.dailyReminderTime ?? DEFAULT_TIME;

  const toggleReminder = async (on: boolean) => {
    if (!on) {
      updateMe.mutate({ dailyReminderTime: null }, { onError: fail('No se pudo apagar') });
      await cancelDailyReminder();
      return;
    }
    const result = await requestReminderPermission();
    setPermission(result.granted);
    if (!result.granted) {
      setDenied(!result.canAskAgain);
      return;
    }
    updateMe.mutate({ dailyReminderTime: time }, { onError: fail('No se pudo prender') });
  };

  const saveName = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === (user?.name ?? '')) return;
    updateMe.mutate({ name: trimmed || null }, { onError: fail('No se pudo guardar') });
  };

  const confirmDelete = () => {
    Alert.alert(
      'Eliminar mi cuenta',
      'Se borran todos tus movimientos, compromisos y tu cuenta. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar todo',
          style: 'destructive',
          onPress: () =>
            deleteMe.mutate(undefined, {
              onSuccess: async () => {
                await cancelDailyReminder();
                await forget();
              },
              onError: fail('No se pudo borrar'),
            }),
        },
      ],
    );
  };

  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 pb-16 pt-2">
        <Title>Ajustes</Title>

        <Card>
          <Muted>Mail</Muted>
          <Text className="text-base text-white">{user?.email ?? '…'}</Text>
          <NameField key={user?.name ?? ''} initial={user?.name ?? ''} onSave={saveName} />
        </Card>

        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 gap-0.5 pr-3">
              <Text className="text-base text-white">Recordatorio diario</Text>
              <Muted>Te avisamos cerca de las {time} cuánto te queda.</Muted>
            </View>
            <Switch
              value={reminderOn}
              onValueChange={(on) => void toggleReminder(on)}
              trackColor={{ true: '#22C55E', false: '#334155' }}
              thumbColor="#F8FAFC"
              accessibilityLabel="Recordatorio diario"
            />
          </View>
          {reminderOn ? (
            <Row>
              <Chip
                label="− 15 min"
                onPress={() =>
                  updateMe.mutate(
                    { dailyReminderTime: shiftTime(time, -STEP_MINUTES) },
                    { onError: fail('No se pudo cambiar') },
                  )
                }
              />
              <Text className="text-xl font-semibold text-white">{time}</Text>
              <Chip
                label="+ 15 min"
                onPress={() =>
                  updateMe.mutate(
                    { dailyReminderTime: shiftTime(time, STEP_MINUTES) },
                    { onError: fail('No se pudo cambiar') },
                  )
                }
              />
            </Row>
          ) : null}
          {reminderOn && permission === false ? (
            <View className="gap-2">
              <Muted>Las notificaciones están apagadas en el sistema.</Muted>
              <Button
                label="Abrir ajustes del teléfono"
                variant="secondary"
                onPress={() => void Linking.openSettings()}
              />
            </View>
          ) : null}
          {denied && !reminderOn ? (
            <View className="gap-2">
              <Muted>Para avisarte, activá las notificaciones de Findemes en el teléfono.</Muted>
              <Button
                label="Abrir ajustes del teléfono"
                variant="secondary"
                onPress={() => void Linking.openSettings()}
              />
            </View>
          ) : null}
          <Muted>La hora es aproximada: Android puede correrla unos minutos.</Muted>
        </Card>

        <CaptureCard />

        <Card>
          <Button
            label="Privacidad"
            variant="secondary"
            onPress={() => router.push('/(app)/privacy')}
          />
          <Button
            label="Cerrar sesión"
            variant="secondary"
            onPress={() => {
              void cancelDailyReminder();
              void signOut();
            }}
          />
        </Card>

        <Card className="border border-danger/40">
          <Text className="text-base font-semibold text-white">Zona peligrosa</Text>
          <Muted>Borra todos tus datos de Findemes. No se puede deshacer.</Muted>
          <Button
            label="Eliminar mi cuenta"
            variant="danger"
            onPress={confirmDelete}
            loading={deleteMe.isPending}
          />
        </Card>

        <Muted className="text-center">Findemes {version}</Muted>
      </ScrollView>
    </Screen>
  );
}
