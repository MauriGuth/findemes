import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { Button, Card, Muted } from '@/components/ui';
import { Capture, captureErrorText, disableCapture, useCaptureState } from '@/lib/capture';
import { errorMessage } from '@/lib/hooks';

function ago(iso: string | null): string {
  if (!iso) return 'todavía nada';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${String(minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${String(hours)} h`;
  return `hace ${String(Math.round(hours / 24))} días`;
}

/** Ajustes → Captura automática: state, last upload, queue, and the way out. */
export function CaptureCard() {
  const router = useRouter();
  const { state, refresh } = useCaptureState();
  const [busy, setBusy] = useState(false);
  const [captureMode, setCaptureModeState] = useState(() => Capture.getCaptureMode());

  if (state.kind === 'unsupported') return null;

  const turnOff = () =>
    Alert.alert(
      'Apagar la captura automática',
      'Dejamos de leer notificaciones en este teléfono. Lo que ya se cargó queda.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            disableCapture()
              .catch((e: unknown) => Alert.alert('No se pudo apagar', errorMessage(e)))
              .finally(() => {
                setBusy(false);
                refresh();
              });
          },
        },
      ],
    );

  return (
    <Card>
      <Text className="text-base text-white">Captura automática</Text>
      {state.kind === 'off' ? (
        <View className="gap-2">
          <Muted>
            Cargamos solos tus gastos leyendo las notificaciones de tus bancos y billeteras.
          </Muted>
          <Button label="Activar" onPress={() => router.push('/(app)/capture/intro')} />
        </View>
      ) : state.kind === 'needsPermission' ? (
        <View className="gap-2">
          <Muted>Falta darle acceso a las notificaciones en Android.</Muted>
          <Button label="Terminar de activar" onPress={() => router.push('/(app)/capture/intro')} />
          <Button label="Apagar" variant="ghost" onPress={turnOff} loading={busy} />
        </View>
      ) : (
        <View className="gap-2">
          <Muted>
            Activa · última subida {ago(state.stats.lastUploadAt)}
            {state.stats.pending > 0 ? ` · ${String(state.stats.pending)} esperando` : ''}
          </Muted>
          {captureErrorText(state.stats.lastError) ? (
            <Muted>{captureErrorText(state.stats.lastError)}</Muted>
          ) : null}
          {state.stats.whitelistSize === 0 ? (
            <Muted>Todavía no hay apps habilitadas para leer.</Muted>
          ) : null}
          <Button label="Apagar" variant="ghost" onPress={turnOff} loading={busy} />
        </View>
      )}

      {__DEV__ ? (
        <View className="gap-2 border-t border-white/10 pt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm text-white">Modo captura (desarrollo)</Text>
              <Muted>Guarda en el teléfono las últimas 50 para armar parsers.</Muted>
            </View>
            <Switch
              value={captureMode}
              onValueChange={(on) => {
                Capture.setCaptureMode(on);
                setCaptureModeState(on);
              }}
              trackColor={{ true: '#22C55E', false: '#334155' }}
              thumbColor="#F8FAFC"
              accessibilityLabel="Modo captura"
            />
          </View>
          <Button
            label="Ver muestras"
            variant="secondary"
            onPress={() => router.push('/(app)/capture/samples')}
          />
        </View>
      ) : null}
    </Card>
  );
}
