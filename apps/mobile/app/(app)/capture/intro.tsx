import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Card, ErrorText, Muted, Screen, Title } from '@/components/ui';
import { Capture, enableCapture, useCaptureState } from '@/lib/capture';
import { errorMessage, useCatalog } from '@/lib/hooks';

function Point({ title, children }: { title: string; children: string }) {
  return (
    <View className="gap-1">
      <Text className="text-base font-semibold text-white">{title}</Text>
      <Text className="text-base leading-6 text-slate-300">{children}</Text>
    </View>
  );
}

/**
 * Prominent disclosure (Google Play User Data policy): shown in the app, right before the
 * permission, with an explicit "Acepto" and nothing pre-checked. Leaving is a no.
 */
export default function CaptureIntroScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const { state, refresh } = useCaptureState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apps = (catalog.data?.sources ?? []).filter((s) => s.captureEnabled).map((s) => s.name);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableCapture();
      refresh();
      Capture.openSettings();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'unsupported') {
    return (
      <Screen className="justify-center gap-4">
        <Title>Captura automática</Title>
        <Muted>Esta versión de la app todavía no la trae. Instalá la última versión.</Muted>
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (state.kind !== 'off') {
    const granted = state.kind === 'on';
    return (
      <Screen>
        <ScrollView contentContainerClassName="gap-5 py-6">
          <Title>{granted ? 'Listo, ya está activa' : 'Falta un permiso'}</Title>
          {granted ? (
            <Muted>
              Cuando llegue una notificación de tus apps de plata, el movimiento aparece solo en
              Inicio. Si necesita que lo confirmes, lo vas a ver en Pendientes.
            </Muted>
          ) : (
            <View className="gap-4">
              <Muted>
                Android tiene que darle a Findemes acceso a las notificaciones. En la pantalla que
                se abre, buscá Findemes y activalo.
              </Muted>
              <Button label="Abrir el permiso" onPress={() => Capture.openSettings()} />
              <Card>
                <Text className="text-base font-semibold text-white">
                  ¿Dice “Configuración restringida”?
                </Text>
                <Muted>
                  Pasa con apps instaladas por fuera de Play Store. Tocá el botón de abajo, abrí el
                  menú ⋮ de arriba a la derecha, elegí “Permitir configuración restringida” y volvé
                  a activar el permiso.
                </Muted>
                <Button
                  label="Abrir la info de la app"
                  variant="secondary"
                  onPress={() => Capture.openAppDetails()}
                />
              </Card>
            </View>
          )}
          <Button label="Listo" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 py-6 pb-10">
        <Title>Captura automática</Title>
        <Muted>
          Para cargar tus gastos solos, Findemes necesita leer algunas notificaciones. Antes de
          activarlo, esto es exactamente lo que hace:
        </Muted>

        <Card className="gap-4">
          <Point title="Qué leemos">
            {apps.length > 0
              ? `Solo las notificaciones de: ${apps.join(', ')}.`
              : 'Solo las notificaciones de bancos y billeteras de nuestra lista. Por ahora la lista está vacía.'}
          </Point>
          <Point title="Qué no leemos">
            Nada más. Ni WhatsApp, ni mensajes, ni mails, ni ninguna otra app: el teléfono las
            descarta antes de mirarlas.
          </Point>
          <Point title="Qué hacemos con eso">
            El texto de la notificación viaja cifrado a nuestro servidor, que saca el monto, el
            comercio y la fecha. Si no reconocemos el formato, se lo pasamos a Claude, la IA de
            Anthropic, solo para leer ese texto.
          </Point>
          <Point title="Cuánto lo guardamos">
            El texto original se borra a los 30 días. El movimiento queda en tu cuenta hasta que lo
            borres o borres la cuenta.
          </Point>
          <Point title="Podés apagarlo cuando quieras">
            Desde Ajustes, o sacándole el permiso a Findemes en Android.
          </Point>
        </Card>

        <ErrorText>{error}</ErrorText>
        <Button label="Acepto y activo" onPress={() => void accept()} loading={busy} />
        <Button
          label="Ahora no"
          variant="ghost"
          onPress={() => {
            if (busy) return;
            router.back();
          }}
        />
        <Button
          label="Leer la política de privacidad"
          variant="ghost"
          onPress={() => router.push('/(app)/privacy')}
        />
      </ScrollView>
    </Screen>
  );
}
