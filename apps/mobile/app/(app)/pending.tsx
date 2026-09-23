import { formatArs, type Transaction } from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Button, Card, Chip, Muted, Row, Screen, Title } from '@/components/ui';
import { currentMonthKey, dayLabel, isoToCalendar } from '@/lib/format';
import {
  errorMessage,
  useCatalog,
  useSummary,
  useTransactions,
  useUpdateTransaction,
} from '@/lib/hooks';

const METHOD: Record<Transaction['method'], string> = {
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  TRANSFER: 'Transferencia',
  WALLET: 'Billetera',
  CASH: 'Efectivo',
};

function Line({ tx, source }: { tx: Transaction; source: string | undefined }) {
  const time = new Date(tx.occurredAt).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 gap-0.5 pr-2">
        <Text className="text-base text-white">{tx.merchantRaw ?? METHOD[tx.method]}</Text>
        <Muted>
          {source ?? 'Cargado a mano'} · {dayLabel(isoToCalendar(tx.occurredAt))} {time}
        </Muted>
      </View>
      <Text
        className={`text-base font-semibold ${tx.direction === 'IN' ? 'text-accent' : 'text-white'}`}
      >
        {tx.direction === 'IN' ? '+' : '−'}
        {formatArs(tx.amount)}
      </Text>
    </View>
  );
}

/** What automatic capture needs the user to decide (Phase 2). Phase 1 questions stay on Inicio. */
export default function PendingScreen() {
  const router = useRouter();
  const month = currentMonthKey();
  const summary = useSummary(month);
  const transactions = useTransactions(month);
  const catalog = useCatalog();
  const update = useUpdateTransaction();

  const byId = useMemo(
    () => new Map((transactions.data ?? []).map((t) => [t.id, t])),
    [transactions.data],
  );
  const sourceName = (id: string | null) =>
    catalog.data?.sources.find((s) => s.id === id)?.name ?? undefined;

  const run = async (
    changes: { id: string; status?: 'CONFIRMED' | 'IGNORED'; isOwnTransfer?: boolean }[],
  ) => {
    try {
      for (const change of changes) await update.mutateAsync(change);
    } catch (e) {
      Alert.alert('No se pudo guardar', errorMessage(e));
    }
  };

  const pending = summary.data?.pending;
  const review = (pending?.reviewTransactionIds ?? []).flatMap((id) => byId.get(id) ?? []);
  const transfers = (pending?.ownTransferPairs ?? []).flatMap((p) => {
    const out = byId.get(p.outId);
    const incoming = byId.get(p.inId);
    return out && incoming ? [{ out, incoming }] : [];
  });
  const duplicates = (pending?.possibleDuplicatePairs ?? []).flatMap((p) => {
    const auto = byId.get(p.autoId);
    const manual = byId.get(p.manualId);
    return auto && manual ? [{ auto, manual }] : [];
  });
  const empty = review.length + transfers.length + duplicates.length === 0;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 py-6 pb-16">
        <View className="flex-row items-center justify-between">
          <Title>Pendientes</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>

        {empty && !summary.isPending ? <Muted>No hay nada para revisar. 🎉</Muted> : null}

        {transfers.length > 0 ? (
          <View className="gap-3">
            <Text className="text-lg font-semibold text-white">¿Fue entre tus cuentas?</Text>
            {transfers.map(({ out, incoming }) => (
              <Card key={out.id}>
                <Line tx={out} source={sourceName(out.sourceId)} />
                <Line tx={incoming} source={sourceName(incoming.sourceId)} />
                <Muted>Si fue entre tus cuentas, no es ni gasto ni ingreso.</Muted>
                <Row>
                  <Chip
                    label="Sí, entre mis cuentas"
                    onPress={() =>
                      void run([
                        { id: out.id, isOwnTransfer: true, status: 'CONFIRMED' },
                        { id: incoming.id, isOwnTransfer: true, status: 'CONFIRMED' },
                      ])
                    }
                  />
                  <Chip
                    label="No"
                    onPress={() => void run([{ id: incoming.id, status: 'CONFIRMED' }])}
                  />
                </Row>
              </Card>
            ))}
          </View>
        ) : null}

        {duplicates.length > 0 ? (
          <View className="gap-3">
            <Text className="text-lg font-semibold text-white">¿Es el mismo pago?</Text>
            {duplicates.map(({ auto, manual }) => (
              <Card key={auto.id}>
                <Line tx={auto} source={sourceName(auto.sourceId)} />
                <Line tx={manual} source={undefined} />
                <Muted>Lo detectamos y también lo cargaste a mano.</Muted>
                <Row>
                  <Chip
                    label="Es el mismo"
                    onPress={() =>
                      void run([
                        { id: manual.id, status: 'IGNORED' },
                        { id: auto.id, status: 'CONFIRMED' },
                      ])
                    }
                  />
                  <Chip
                    label="Son distintos"
                    onPress={() => void run([{ id: auto.id, status: 'CONFIRMED' }])}
                  />
                </Row>
              </Card>
            ))}
          </View>
        ) : null}

        {review.length > 0 ? (
          <View className="gap-3">
            <Text className="text-lg font-semibold text-white">Detectamos estos gastos</Text>
            <Muted>Ya se restan de lo que te queda. Confirmalos o corregilos.</Muted>
            {review.map((tx) => (
              <Card key={tx.id}>
                <Line tx={tx} source={sourceName(tx.sourceId)} />
                <Row>
                  <Chip
                    label="Está bien"
                    onPress={() => void run([{ id: tx.id, status: 'CONFIRMED' }])}
                  />
                  <Chip
                    label="Corregir"
                    onPress={() =>
                      router.push({ pathname: '/(app)/transactions/[id]', params: { id: tx.id } })
                    }
                  />
                  <Chip
                    label="No es un gasto"
                    onPress={() => void run([{ id: tx.id, status: 'IGNORED' }])}
                  />
                </Row>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
