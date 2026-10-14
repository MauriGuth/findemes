import { type IngestToken } from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { apiBaseUrl, apiPost } from '@/lib/api';
import { errorMessage } from '@/lib/hooks';

function Step({ n, children }: { n: number; children: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="w-5 text-base font-semibold text-accent">{n}</Text>
      <Text className="flex-1 text-base leading-6 text-slate-300">{children}</Text>
    </View>
  );
}

/**
 * iPhone: iOS does not let apps read other apps' notifications, so a personal automation in
 * the Shortcuts app sends bank SMS and Apple Pay payments to Findemes (Phase 6, ADR 016).
 */
export default function ShortcutsScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `${apiBaseUrl()}/ingest/shortcut`;

  const generate = () =>
    Alert.alert(
      'Generar tu clave',
      'Si ya armaste los atajos con otra clave, van a dejar de funcionar hasta que pongas la nueva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Generar',
          onPress: async () => {
            setBusy(true);
            try {
              const issued = await apiPost<IngestToken>('/devices/current/ingest-token');
              setToken(issued.token);
            } catch (error) {
              Alert.alert('No se pudo', errorMessage(error));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 py-6 pb-16">
        <View className="flex-row items-center justify-between">
          <Title>Atajos del iPhone</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>
        <Muted>
          El iPhone no deja que otra app lea las notificaciones de tu banco. Con la app Atajos podés
          mandarnos los SMS de tu banco y tus pagos con Apple Pay apenas pasan. Se arma una sola
          vez.
        </Muted>

        <Card>
          <Text className="text-base font-semibold text-white">1. Tu clave</Text>
          {token ? (
            <>
              <Muted>Copiala ahora: no la vamos a volver a mostrar.</Muted>
              <Text selectable className="text-sm text-white">
                Bearer {token}
              </Text>
              <Button
                label="Copiar o compartir"
                variant="secondary"
                onPress={() => void Share.share({ message: `Bearer ${token}` })}
              />
            </>
          ) : (
            <Button label="Generar mi clave" onPress={generate} loading={busy} />
          )}
          <Muted>Dirección:</Muted>
          <Text selectable className="text-sm text-white">
            {url}
          </Text>
        </Card>

        <Card className="gap-3">
          <Text className="text-base font-semibold text-white">2. SMS de tu banco</Text>
          <Step n={1}>
            Abrí Atajos → Automatización → Nueva automatización → Mensaje. En “El remitente es”
            elegí tu banco (o en “El mensaje contiene” poné “$”). Marcá “Ejecutar inmediatamente”.
          </Step>
          <Step n={2}>
            Agregá la acción “Obtener contenido de URL” con la dirección de arriba. Método: POST.
          </Step>
          <Step n={3}>
            Encabezados: “Authorization” con tu clave (empieza con “Bearer”). Cuerpo: JSON, con
            “text” = Mensaje (variable “Entrada del atajo”) y “sender” = Remitente.
          </Step>
        </Card>

        <Card className="gap-3">
          <Text className="text-base font-semibold text-white">3. Pagos con Apple Pay</Text>
          <Step n={1}>
            Atajos → Automatización → Nueva → Transacción. Elegí tus tarjetas y marcá “Ejecutar
            inmediatamente”.
          </Step>
          <Step n={2}>
            “Obtener contenido de URL”, igual que arriba, con cuerpo JSON: “kind” = apple_pay,
            “amount” = Importe, “merchant” = Comercio, “card” = Tarjeta.
          </Step>
          <Muted>
            Apple Pay no dice si fue débito o crédito: si el nombre de la tarjeta dice “débito” lo
            tomamos así; si no, crédito. Lo confirmás en Pendientes.
          </Muted>
        </Card>

        <Muted>
          Las notificaciones de las apps de los bancos no se pueden automatizar en iPhone. Para eso
          está el reenvío de correos (Ajustes → Tus correos). Las claves de los atajos no vencen; se
          anulan al cerrar sesión o al generar una nueva.
        </Muted>
      </ScrollView>
    </Screen>
  );
}
