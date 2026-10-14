import { formatArs } from '@findemes/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, ScrollView, Text, View } from 'react-native';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import {
  errorMessage,
  useCatalog,
  useDeleteReceipt,
  useReceipt,
  useRetryReceipt,
} from '@/lib/hooks';

/** One ticket: what Claude read and the movement it belongs to (ADR 014). */
export default function ReceiptScreen() {
  const router = useRouter();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const receipt = useReceipt(id);
  const catalog = useCatalog();
  const retry = useRetryReceipt();
  const remove = useDeleteReceipt();
  const r = receipt.data;
  const money = (amount: string) =>
    r?.currency === 'USD' ? formatArs(amount).replace('$', 'US$') : formatArs(amount);
  const categoryName = (categoryId: string | null) =>
    catalog.data?.categories.find((c) => c.id === categoryId)?.name ?? '';

  const confirmDelete = () =>
    Alert.alert(
      'Borrar el ticket',
      'Se borra la foto y lo que leímos. Si el movimiento salió del ticket y no lo confirmaste, también se borra.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () =>
            remove.mutate(id, {
              onSuccess: () => router.back(),
              onError: (e) => Alert.alert('No se pudo borrar', errorMessage(e)),
            }),
        },
      ],
    );

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-2 pb-16">
        <View className="flex-row items-center justify-between">
          <Title>Ticket</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>

        {receipt.isError ? <Muted>{errorMessage(receipt.error)}</Muted> : null}
        {!r ? <ActivityIndicator color="#22C55E" /> : null}

        {r?.status === 'UPLOADED' ? (
          <Card className="flex-row items-center gap-3">
            <ActivityIndicator color="#22C55E" />
            <Muted>Leyendo el ticket… tarda unos segundos.</Muted>
          </Card>
        ) : null}

        {r?.status === 'FAILED' ? (
          <Card className="border border-danger/40">
            <Text className="text-base text-white">{r.error}</Text>
            <Button
              label="Probar de nuevo"
              variant="secondary"
              loading={retry.isPending}
              onPress={() =>
                retry.mutate(id, { onError: (e) => Alert.alert('No se pudo', errorMessage(e)) })
              }
            />
          </Card>
        ) : null}

        {r && r.total ? (
          <Card>
            <Text className="text-2xl font-bold text-white">{money(r.total)}</Text>
            {r.merchant ? <Text className="text-base text-white">{r.merchant}</Text> : null}
            <Muted>
              {r.issuedAt ? new Date(r.issuedAt).toLocaleString('es-AR') : 'Sin fecha en el ticket'}
              {r.cuit ? ` · CUIT ${r.cuit}` : ''}
            </Muted>
            <Muted>
              {r.status === 'MATCHED'
                ? 'Lo juntamos con el pago que ya tenías.'
                : 'No encontramos el pago: lo cargamos para que lo confirmes en Pendientes.'}
            </Muted>
            {r.transactionId ? (
              <Button
                label="Ver el movimiento"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/(app)/transactions/[id]',
                    params: { id: r.transactionId ?? '' },
                  })
                }
              />
            ) : null}
          </Card>
        ) : null}

        {r && r.items.length > 0 ? (
          <Card>
            <Text className="text-base font-semibold text-white">Lo que compraste</Text>
            {r.items.map((item, i) => (
              <View key={i} className="flex-row justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-sm text-slate-200">
                    {item.qty !== '1' ? `${item.qty} × ` : ''}
                    {item.name}
                  </Text>
                  {item.categoryId ? <Muted>{categoryName(item.categoryId)}</Muted> : null}
                </View>
                <Text className="text-sm text-slate-200">{money(item.total)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {r?.imageUrl ? (
          <Image
            source={{ uri: r.imageUrl }}
            accessibilityLabel="Foto del ticket"
            className="h-96 w-full rounded-2xl"
            resizeMode="contain"
          />
        ) : null}

        {r ? (
          <Button
            label="Borrar el ticket"
            variant="danger"
            onPress={confirmDelete}
            loading={remove.isPending}
          />
        ) : null}
        <Muted>
          La foto se guarda cifrada en un almacenamiento privado y la lee Claude, la IA de
          Anthropic. Se borra cuando borrás el ticket o tu cuenta.
        </Muted>
      </ScrollView>
    </Screen>
  );
}
