import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Alert, ScrollView, Share, Text, View } from 'react-native';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { errorMessage, useInboundAddress, useRotateInbound } from '@/lib/hooks';

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${String(minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${String(hours)} h`;
  return `hace ${String(Math.round(hours / 24))} días`;
}

function Step({ n, children }: { n: number; children: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="w-5 text-base font-semibold text-accent">{n}</Text>
      <Text className="flex-1 text-base leading-6 text-slate-300">{children}</Text>
    </View>
  );
}

/** Your forwarding address and how to set Gmail up to use it (ADR 013). */
export default function EmailScreen() {
  const router = useRouter();
  const inbound = useInboundAddress();
  const data = inbound.data;
  const rotate = useRotateInbound();

  const confirmRotate = () =>
    Alert.alert(
      'Cambiar la dirección',
      'La dirección actual deja de recibir correos. Vas a tener que cambiarla en el filtro de Gmail.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          style: 'destructive',
          onPress: () =>
            rotate.mutate(undefined, {
              onError: (e) => Alert.alert('No se pudo cambiar', errorMessage(e)),
            }),
        },
      ],
    );

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 py-6 pb-16">
        <View className="flex-row items-center justify-between">
          <Title>Tus correos</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>
        <Muted>
          Reenviá a tu dirección de Findemes los correos de tus bancos, tarjetas y servicios. Leemos
          los consumos, los resúmenes y las facturas, y te avisamos antes de cada vencimiento.
        </Muted>

        {inbound.isPending ? <Muted>Cargando…</Muted> : null}
        {inbound.isError ? <Muted>{errorMessage(inbound.error)}</Muted> : null}

        {data && !data.address ? (
          <Card>
            <Muted>Todavía no está disponible. Te avisamos cuando lo activemos.</Muted>
          </Card>
        ) : null}

        {data?.address ? (
          <Card>
            <Muted>Tu dirección</Muted>
            <Text selectable className="text-base font-semibold text-white">
              {data.address}
            </Text>
            <Button
              label="Compartir o copiar"
              variant="secondary"
              onPress={() => void Share.share({ message: data.address ?? '' })}
            />
            <Muted>
              {data.lastEmailAt
                ? `Último correo recibido: ${ago(data.lastEmailAt)}.`
                : 'Todavía no recibimos ningún correo.'}
            </Muted>
          </Card>
        ) : null}

        {data?.gmailConfirmation ? (
          <Card className="border border-accent/40">
            <Text className="text-base font-semibold text-white">Gmail pidió confirmar</Text>
            {data.gmailConfirmation.code ? (
              <>
                <Muted>Poné este código en Gmail:</Muted>
                <Text selectable className="text-3xl font-bold tracking-widest text-white">
                  {data.gmailConfirmation.code}
                </Text>
              </>
            ) : null}
            {data.gmailConfirmation.link ? (
              <Button
                label="O confirmalo con el link"
                variant="secondary"
                onPress={() => void Linking.openURL(data.gmailConfirmation?.link ?? '')}
              />
            ) : null}
            {!data.gmailConfirmation.code && !data.gmailConfirmation.link ? (
              <Muted>Te llegó un correo de Google para confirmar. Abrilo en Gmail.</Muted>
            ) : null}
          </Card>
        ) : null}

        {data?.address ? (
          <Card className="gap-3">
            <Text className="text-base font-semibold text-white">Cómo armarlo en Gmail</Text>
            <Muted>Una sola vez, desde la compu (la app de Gmail no tiene estas opciones).</Muted>
            <Step n={1}>
              Entrá a Gmail → ⚙️ Configuración → Ver toda la configuración → Reenvío y correo
              POP/IMAP.
            </Step>
            <Step n={2}>
              Tocá “Agregar una dirección de reenvío”, pegá tu dirección de Findemes y aceptá. Gmail
              nos manda un código: en un minuto lo ves acá arriba.
            </Step>
            <Step n={3}>
              Poné el código en Gmail y confirmá. No actives el reenvío de todo tu correo: solo el
              del paso 4.
            </Step>
            <Step n={4}>
              Creá un filtro: en la búsqueda de Gmail tocá el ícono de opciones y en “De” poné las
              direcciones de tus bancos, tarjetas y servicios, separadas por OR (abrí un correo de
              cada uno para ver desde dónde te escriben). Tocá “Crear filtro”, marcá “Reenviarlo a”
              con tu dirección de Findemes y guardá.
            </Step>
            <Muted>
              En Outlook: Configuración → Correo → Reglas → Agregar regla: si el remitente es tu
              banco, reenviar a tu dirección de Findemes.
            </Muted>
          </Card>
        ) : null}

        <Muted>
          Solo nos llega lo que vos reenviás. Guardamos el texto cifrado, lo borramos a los 30 días,
          y si no reconocemos el formato lo lee Claude, la IA de Anthropic. Nada de lo que llega por
          correo se confirma solo: lo vas a ver en Pendientes.
        </Muted>

        {data?.address ? (
          <Button
            label="Cambiar mi dirección"
            variant="ghost"
            onPress={confirmRotate}
            loading={rotate.isPending}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
