import { formatArs, type MonthSummary, type Transaction } from '@findemes/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Button, Card, Chip, Muted, Row, Screen } from '@/components/ui';
import {
  calendarKey,
  currentMonthKey,
  dayLabel,
  isoToCalendar,
  monthName,
  shortDate,
} from '@/lib/format';
import {
  errorMessage,
  useCatalog,
  useCreateTransaction,
  usePayCommitment,
  useSummary,
  useTransactions,
  useUpdateTransaction,
  useUpsertPlan,
} from '@/lib/hooks';
import { MoneyInput } from '@/components/MoneyInput';

const METHOD_LABEL: Record<Transaction['method'], string> = {
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  TRANSFER: 'Transf.',
  WALLET: 'Billetera',
  CASH: 'Efectivo',
};

function Header({ summary }: { summary: MonthSummary }) {
  const over = summary.remaining.startsWith('-') || summary.remaining === '0.00';
  if (summary.income.source === 'none') {
    return (
      <View className="gap-1">
        <Text className="text-3xl font-bold text-white">Contanos cuánto esperás cobrar</Text>
        <Muted>Con eso calculamos cuánto te queda hasta el 1.</Muted>
      </View>
    );
  }
  if (over) {
    return (
      <View className="gap-1">
        <Text className="text-base text-slate-400">Te pasaste por</Text>
        <Text className="text-5xl font-bold tracking-tight text-danger">
          {formatArs(summary.remaining.replace('-', ''), { cents: false })}
        </Text>
        <Text className="text-base text-slate-300">faltan {summary.daysLeft} días para el 1</Text>
      </View>
    );
  }
  return (
    <View className="gap-1">
      <Text className="text-base text-slate-400">Te quedan</Text>
      <Text className="text-5xl font-bold tracking-tight text-white">
        {formatArs(summary.remaining, { cents: false })}
      </Text>
      <Text className="text-base text-slate-300">
        hasta el 1
        {summary.perDay ? ` · ${formatArs(summary.perDay, { cents: false })} por día` : ''}
      </Text>
    </View>
  );
}

function IncomeLine({ summary }: { summary: MonthSummary }) {
  const { income } = summary;
  if (income.source === 'confirmed' && income.salary)
    return <Muted>Sueldo cobrado {formatArs(income.salary, { cents: false })}</Muted>;
  if (income.source === 'expected' && income.expected)
    return (
      <Muted>
        Sueldo esperado {formatArs(income.expected, { cents: false })} · marcá cuando cobres
      </Muted>
    );
  if (income.source === 'carried')
    return (
      <Muted>
        Sueldo estimado {formatArs(income.total, { cents: false })} (igual al mes pasado) · confirmá
      </Muted>
    );
  return null;
}

export default function HomeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const month = currentMonthKey();
  const summary = useSummary(month);
  const transactions = useTransactions(month);
  const catalog = useCatalog();
  const upsertPlan = useUpsertPlan();
  const updateTx = useUpdateTransaction();
  const pay = usePayCommitment();
  const createTx = useCreateTransaction();
  const [expected, setExpected] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: ['summary'] });
    }, [qc]),
  );

  const refresh = () => Promise.all([summary.refetch(), transactions.refetch()]);
  const fail = (e: unknown) => Alert.alert('No se pudo guardar', errorMessage(e));

  const sourceName = (id: string | null) => catalog.data?.sources.find((s) => s.id === id)?.name;
  const groups = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const tx of transactions.data ?? []) {
      const key = calendarKey(isoToCalendar(tx.occurredAt));
      byDay.set(key, [...(byDay.get(key) ?? []), tx]);
    }
    return [...byDay.entries()];
  }, [transactions.data]);

  const s = summary.data;
  const candidates = (transactions.data ?? []).filter((t) =>
    s?.pending.salaryCandidateIds.includes(t.id),
  );
  const toReview =
    (s?.pending.reviewTransactionIds.length ?? 0) +
    (s?.pending.ownTransferPairs.length ?? 0) +
    (s?.pending.possibleDuplicatePairs.length ?? 0);
  const dueUnpaid = (s?.commitments.items ?? []).filter(
    (c) => s?.pending.unpaidDueCommitmentIds.includes(c.id) && !dismissed.includes(c.id),
  );

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-5 pb-28 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={summary.isFetching}
            onRefresh={() => void refresh()}
            tintColor="#22C55E"
          />
        }
      >
        {s ? (
          <Header summary={s} />
        ) : (
          <Muted>{summary.isError ? errorMessage(summary.error) : 'Cargando…'}</Muted>
        )}
        {s ? <IncomeLine summary={s} /> : null}

        {s ? (
          <Card>
            <Muted>Próximo resumen de tarjeta</Muted>
            <Text className="text-xl font-semibold text-white">{formatArs(s.statement.next)}</Text>
            <Muted>No sale del cash hasta el mes que viene.</Muted>
            {s.statement.previous.amount !== '0.00' ? (
              <Muted>
                Resumen anterior: {formatArs(s.statement.previous.amount, { cents: false })} ·{' '}
                {s.statement.previous.paid ? 'pagado' : 'pendiente de pago'}
              </Muted>
            ) : null}
          </Card>
        ) : null}

        {s &&
        (s.pending.needsPlan ||
          toReview > 0 ||
          candidates.length > 0 ||
          dueUnpaid.length > 0 ||
          s.pending.needsStatementPayment) ? (
          <Card className="border border-warn/40">
            <Text className="text-base font-semibold text-white">Pendientes</Text>

            {toReview > 0 ? (
              <View className="flex-row items-center justify-between gap-2">
                <Muted className="flex-1">
                  {toReview === 1
                    ? 'Detectamos 1 movimiento para revisar.'
                    : `Detectamos ${String(toReview)} movimientos para revisar.`}
                </Muted>
                <Chip label="Revisar" onPress={() => router.push('/(app)/pending')} />
              </View>
            ) : null}

            {s.pending.needsPlan ? (
              <View className="gap-2">
                <Muted>
                  {s.income.source === 'carried'
                    ? `Arrancó ${monthName(month)}: ¿seguís cobrando ${formatArs(s.income.total, { cents: false })}?`
                    : '¿Cuánto esperás cobrar este mes?'}
                </Muted>
                {s.income.source === 'carried' ? (
                  <Row>
                    <Chip
                      label="Sí, igual"
                      onPress={() =>
                        upsertPlan.mutate(
                          { month, expectedIncome: s.income.total },
                          { onError: fail },
                        )
                      }
                    />
                    <Chip label="Cambió" onPress={() => setExpected(' ')} />
                  </Row>
                ) : null}
                {s.income.source !== 'carried' || expected ? (
                  <View className="gap-2">
                    <MoneyInput value={expected.trim()} onChange={setExpected} />
                    <Button
                      label="Guardar"
                      disabled={!expected.trim()}
                      loading={upsertPlan.isPending}
                      onPress={() =>
                        upsertPlan.mutate(
                          { month, expectedIncome: expected.trim() },
                          { onError: fail, onSuccess: () => setExpected('') },
                        )
                      }
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {candidates.map((tx) => (
              <View key={tx.id} className="gap-2 border-t border-white/10 pt-2">
                <Muted>
                  ¿Este ingreso de {formatArs(tx.amount, { cents: false })} del{' '}
                  {shortDate(isoToCalendar(tx.occurredAt))} es tu sueldo?
                </Muted>
                <Row>
                  <Chip
                    label="Es mi sueldo"
                    onPress={() =>
                      upsertPlan.mutate(
                        {
                          month,
                          expectedIncome: s.income.expected ?? tx.amount,
                          salaryTransactionId: tx.id,
                        },
                        { onError: fail },
                      )
                    }
                  />
                  <Chip
                    label="Otro ingreso"
                    onPress={() =>
                      updateTx.mutate({ id: tx.id, status: 'CONFIRMED' }, { onError: fail })
                    }
                  />
                  <Chip
                    label="Entre mis cuentas"
                    onPress={() =>
                      updateTx.mutate(
                        { id: tx.id, isOwnTransfer: true, status: 'CONFIRMED' },
                        { onError: fail },
                      )
                    }
                  />
                </Row>
              </View>
            ))}

            {dueUnpaid.map((c) => (
              <View key={c.id} className="gap-2 border-t border-white/10 pt-2">
                <Muted>
                  ¿Ya pagaste {c.name}? {formatArs(c.unpaidAmount, { cents: false })} · vencía el{' '}
                  {Number(c.dueOn.slice(8, 10))}
                </Muted>
                <Row>
                  <Chip
                    label="Sí, pagué"
                    onPress={() =>
                      pay.mutate({ id: c.id, commitmentMonth: month }, { onError: fail })
                    }
                  />
                  <Chip label="Todavía no" onPress={() => setDismissed((d) => [...d, c.id])} />
                </Row>
              </View>
            ))}

            {s.pending.needsStatementPayment ? (
              <View className="gap-2 border-t border-white/10 pt-2">
                <Muted>
                  ¿Ya pagaste el resumen de{' '}
                  {formatArs(s.statement.previous.amount, { cents: false })}?
                </Muted>
                <Row>
                  <Chip
                    label="Sí, pagué"
                    onPress={() =>
                      createTx.mutate(
                        {
                          amount: s.statement.previous.amount,
                          method: 'DEBIT',
                          merchantRaw: 'Resumen de tarjeta',
                          isStatementPayment: true,
                        },
                        { onError: fail },
                      )
                    }
                  />
                </Row>
              </View>
            ) : null}
          </Card>
        ) : null}

        <View className="gap-3">
          {groups.length === 0 ? (
            <Muted>Todavía no cargaste movimientos este mes. Tocá + para empezar.</Muted>
          ) : null}
          {groups.map(([day, items]) => (
            <View key={day} className="gap-2">
              <Muted className="uppercase tracking-wide">
                {dayLabel(isoToCalendar(items[0]?.occurredAt ?? ''))}
              </Muted>
              {items.map((tx) => {
                const sign = tx.direction === 'IN' ? '+' : '−';
                const ignored = tx.status === 'IGNORED';
                const item = s?.commitments.items.find((c) => c.id === tx.commitmentId);
                return (
                  <Pressable
                    key={tx.id}
                    onPress={() =>
                      router.push({ pathname: '/(app)/transactions/[id]', params: { id: tx.id } })
                    }
                    className="flex-row items-center justify-between rounded-xl bg-white/5 px-4 py-3"
                  >
                    <View className="flex-1 gap-0.5">
                      <Text
                        className={`text-base text-white ${ignored ? 'line-through text-slate-500' : ''}`}
                      >
                        {tx.merchantRaw ??
                          tx.note ??
                          (tx.isOwnTransfer
                            ? 'Entre mis cuentas'
                            : tx.direction === 'IN'
                              ? 'Ingreso'
                              : 'Gasto')}
                      </Text>
                      <Muted>
                        {METHOD_LABEL[tx.method]}
                        {sourceName(tx.sourceId) ? ` · ${sourceName(tx.sourceId) ?? ''}` : ''}
                        {tx.isOwnTransfer ? ' · Entre mis cuentas' : ''}
                        {tx.origin !== 'MANUAL' ? ' · Detectado' : ''}
                        {tx.isSalary
                          ? ' · Sueldo'
                          : tx.status === 'PENDING'
                            ? tx.direction === 'OUT'
                              ? ' · Para revisar'
                              : ' · Sin clasificar'
                            : ''}
                        {item?.installmentNumber
                          ? ` · Cuota ${String(item.installmentNumber)}/${String(item.installmentNumber + (item.installmentsLeft ?? 0))}`
                          : ''}
                      </Muted>
                    </View>
                    <Text
                      className={`text-base font-semibold ${tx.isOwnTransfer || ignored ? 'text-slate-500' : tx.direction === 'IN' ? 'text-accent' : 'text-white'}`}
                    >
                      {sign}
                      {tx.currency === 'USD'
                        ? formatArs(tx.amount).replace('$', 'US$')
                        : formatArs(tx.amount)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {s && (s.usd.spent !== '0.00' || s.usd.income !== '0.00') ? (
            <Muted>Además: US${formatArs(s.usd.spent, { cents: false }).slice(1)} en dólares</Muted>
          ) : null}
          <Muted>Montos nominales, sin ajuste por inflación.</Muted>
        </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cargar un movimiento"
        onPress={() => router.push('/(app)/transactions/new')}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-accent"
      >
        <Text className="text-3xl font-bold text-ink">+</Text>
      </Pressable>
    </Screen>
  );
}
