import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, View } from 'react-native';

import { TransactionForm } from '@/components/TransactionForm';
import { Button, Muted, Row, Screen, Title } from '@/components/ui';
import {
  errorMessage,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/lib/hooks';

export default function TransactionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useTransaction(id ?? '');
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  const confirmDelete = () => {
    Alert.alert('Eliminar movimiento', 'Se borra y no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          if (!id) return;
          remove.mutate(id, {
            onSuccess: () => router.back(),
            onError: (e) => Alert.alert('No se pudo borrar', errorMessage(e)),
          });
        },
      },
    ]);
  };

  const toggleIgnored = () => {
    if (!tx.data) return;
    update.mutate(
      { id: tx.data.id, status: tx.data.status === 'IGNORED' ? 'CONFIRMED' : 'IGNORED' },
      { onError: (e) => Alert.alert('No se pudo cambiar', errorMessage(e)) },
    );
  };

  if (tx.isPending) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#22C55E" />
      </Screen>
    );
  }
  if (!tx.data) {
    return (
      <Screen className="justify-center gap-4">
        <Muted>{errorMessage(tx.error, 'No encontramos ese movimiento.')}</Muted>
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-row items-center justify-between py-2">
        <Title>Movimiento</Title>
        <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
      </View>
      <Row className="pb-3">
        <Button
          label={tx.data.status === 'IGNORED' ? 'Volver a contarlo' : 'Ignorar'}
          variant="secondary"
          onPress={toggleIgnored}
          loading={update.isPending}
        />
        <Button
          label="Eliminar"
          variant="danger"
          onPress={confirmDelete}
          loading={remove.isPending}
        />
      </Row>
      <TransactionForm key={tx.data.updatedAt} existing={tx.data} />
    </Screen>
  );
}
