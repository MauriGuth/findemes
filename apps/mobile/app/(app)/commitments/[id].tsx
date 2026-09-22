import { monthKey, previousMonthKey, todayInArt } from '@findemes/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, View } from 'react-native';

import { CommitmentForm } from '@/components/CommitmentForm';
import { Button, Muted, Row, Screen, Title } from '@/components/ui';
import { monthName } from '@/lib/format';
import { errorMessage, useCommitment, useDeleteCommitment, useUpdateCommitment } from '@/lib/hooks';

export default function CommitmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const commitment = useCommitment(id ?? '');
  const update = useUpdateCommitment();
  const remove = useDeleteCommitment();
  const thisMonth = monthKey(todayInArt());

  const fail = (title: string) => (e: unknown) => Alert.alert(title, errorMessage(e));

  const confirmDelete = () => {
    Alert.alert(
      'Eliminar compromiso',
      'Los pagos que cargaste quedan como gastos sueltos. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            if (!id) return;
            remove.mutate(id, {
              onSuccess: () => router.back(),
              onError: fail('No se pudo borrar'),
            });
          },
        },
      ],
    );
  };

  /** Ends the commitment last month; if it started this month there is nothing to keep, so it pauses. */
  const endNow = () => {
    const c = commitment.data;
    if (!c) return;
    const startedThisMonth = c.startsOn >= thisMonth;
    Alert.alert(
      'Dar de baja',
      startedThisMonth
        ? 'Arrancó este mes, así que se pausa: no cuenta más hasta que lo reactives.'
        : `Deja de contar desde ${monthName(thisMonth)}. Los meses anteriores quedan como estaban.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: () =>
            update.mutate(
              startedThisMonth
                ? { id: c.id, active: false }
                : { id: c.id, endsOn: previousMonthKey(thisMonth) },
              { onSuccess: () => router.back(), onError: fail('No se pudo dar de baja') },
            ),
        },
      ],
    );
  };

  const toggleActive = () => {
    const c = commitment.data;
    if (!c) return;
    update.mutate({ id: c.id, active: !c.active }, { onError: fail('No se pudo cambiar') });
  };

  if (commitment.isPending) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#22C55E" />
      </Screen>
    );
  }
  const c = commitment.data;
  if (!c) {
    return (
      <Screen className="justify-center gap-4">
        <Muted>{errorMessage(commitment.error, 'No encontramos ese compromiso.')}</Muted>
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const ended = c.endsOn !== null && c.endsOn < thisMonth;

  return (
    <Screen>
      <View className="flex-row items-center justify-between py-2">
        <Title>{c.name}</Title>
        <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
      </View>
      <View className="gap-2 pb-3">
        {!c.active ? <Muted>Pausado: no cuenta hasta que lo reactives.</Muted> : null}
        {ended && c.endsOn ? (
          <Muted className="capitalize">Terminó en {monthName(c.endsOn)}.</Muted>
        ) : null}
        <Row>
          <Button
            label={c.active ? 'Pausar' : 'Reactivar'}
            variant="secondary"
            onPress={toggleActive}
            loading={update.isPending}
          />
          {c.active && !ended ? (
            <Button label="Dar de baja" variant="secondary" onPress={endNow} />
          ) : null}
          <Button
            label="Eliminar"
            variant="danger"
            onPress={confirmDelete}
            loading={remove.isPending}
          />
        </Row>
      </View>
      <CommitmentForm key={c.updatedAt} existing={c} />
    </Screen>
  );
}
