import { formatArs, type MonthSummary, nextMonthKey, previousMonthKey } from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { KIND_LABEL } from '@/components/CommitmentForm';
import { MoneyInput } from '@/components/MoneyInput';
import { Button, Card, Chip, Muted, Row, Screen, Title } from '@/components/ui';
import { currentMonthKey, isoToCalendar, monthName, shortDate } from '@/lib/format';
import {
  errorMessage,
  useCommitments,
  useCreateTransaction,
  usePayCommitment,
  usePlan,
  useSummary,
  useTransaction,
  useTransactions,
  useUpdateTransaction,
  useUpsertPlan,
} from '@/lib/hooks';

type Item = MonthSummary['commitments']['items'][number];

function money(amount: string): string {
  return formatArs(amount, { cents: false });
}

function itemStatus(item: Item): { label: string; tone: 'success' | 'warn' | 'default' } {
  if (item.paid) return { label: 'Pagado ✓', tone: 'success' };
  if (item.paidAmount !== '0.00')
    return { label: `Parcial (${money(item.paidAmount)} de ${money(item.amount)})`, tone: 'warn' };
  if (item.method === 'CREDIT') return { label: 'Va al resumen', tone: 'default' };
  return { label: 'Pendiente', tone: 'warn' };
}

function itemWhen(item: Item): string {
  if (item.installmentNumber !== null) {
    const total = item.installmentNumber + (item.installmentsLeft ?? 0);
    return `Cuota ${String(item.installmentNumber)} de ${String(total)}`;
  }
  return `vence el ${String(Number(item.dueOn.slice(8, 10)))}`;
}

export default function PlanScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonthKey());
  const summary = useSummary(month);
  const plan = usePlan(month);
  const transactions = useTransactions(month);
  const allCommitments = useCommitments(true);
  const salaryTx = useTransaction(plan.data?.salaryTransactionId ?? '');
  const upsertPlan = useUpsertPlan();
  const pay = usePayCommitment();
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();

  const [editingIncome, setEditingIncome] = useState(false);
  const [expected, setExpected] = useState('');
  const [managing, setManaging] = useState(false);

  const fail = (e: unknown) => Alert.alert('No se pudo guardar', errorMessage(e));
  const refresh = () => Promise.all([summary.refetch(), plan.refetch(), transactions.refetch()]);

  const s = summary.data;
  const candidates = (transactions.data ?? []).filter((t) =>
    s?.pending.salaryCandidateIds.includes(t.id),
  );

  const saveIncome = () => {
    upsertPlan.mutate(
      { month, expectedIncome: expected.trim() },
      {
        onError: fail,
        onSuccess: () => {
          setEditingIncome(false);
          setExpected('');
        },
      },
    );
  };

  const payItem = (item: Item) => {
    const amount = item.paidAmount === '0.00' ? undefined : item.unpaidAmount;
    pay.mutate(
      { id: item.id, commitmentMonth: month, ...(amount ? { amount } : {}) },
      { onError: fail },
    );
  };

  const payStatement = () => {
    if (!s) return;
    const owed =
      s.statement.previous.paidAmount === '0.00'
        ? s.statement.previous.amount
        : (Number(s.statement.previous.amount) - Number(s.statement.previous.paidAmount)).toFixed(
            2,
          );
    createTx.mutate(
      {
        amount: owed,
        method: 'DEBIT',
        merchantRaw: 'Resumen de tarjeta',
        isStatementPayment: true,
      },
      { onError: fail },
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-5 pb-16 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={summary.isFetching}
            onRefresh={() => void refresh()}
            tintColor="#22C55E"
          />
        }
      >
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes anterior"
            onPress={() => setMonth(previousMonthKey(month))}
            className="px-3 py-2"
          >
            <Text className="text-2xl text-slate-300">‹</Text>
          </Pressable>
          <Title>
            <Text className="capitalize">{monthName(month)}</Text>
          </Title>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            onPress={() => setMonth(nextMonthKey(month))}
            className="px-3 py-2"
          >
            <Text className="text-2xl text-slate-300">›</Text>
          </Pressable>
        </View>

        {!s ? <Muted>{summary.isError ? errorMessage(summary.error) : 'Cargando…'}</Muted> : null}

        {s ? (
          <Card>
            <View className="flex-row items-center justify-between">
              <View className="gap-0.5">
                <Muted>Espero cobrar</Muted>
                <Text className="text-2xl font-semibold text-white">
                  {s.income.expected ? money(s.income.expected) : 'Sin definir'}
                </Text>
                {s.income.source === 'carried' ? (
                  <Muted>Igual al mes pasado, hasta que lo confirmes.</Muted>
                ) : null}
              </View>
              {!editingIncome ? (
                <Button
                  label={s.income.expected ? 'Editar' : 'Definir'}
                  variant="secondary"
                  onPress={() => {
                    setExpected(
                      s.income.expected ?? (s.income.source === 'carried' ? s.income.total : ''),
                    );
                    setEditingIncome(true);
                  }}
                />
              ) : null}
            </View>
            {editingIncome ? (
              <View className="gap-2">
                <MoneyInput value={expected} onChange={setExpected} autoFocus />
                <Row>
                  <Button
                    label="Guardar"
                    disabled={!expected}
                    loading={upsertPlan.isPending}
                    onPress={saveIncome}
                  />
                  <Button
                    label="Cancelar"
                    variant="ghost"
                    onPress={() => setEditingIncome(false)}
                  />
                </Row>
              </View>
            ) : null}
          </Card>
        ) : null}

        {s ? (
          <Card>
            <Muted>Sueldo</Muted>
            {s.income.salary && plan.data?.salaryTransactionId ? (
              <View className="gap-2">
                <Text className="text-xl font-semibold text-white">
                  Cobrado {money(s.income.salary)}
                  {salaryTx.data ? ` el ${shortDate(isoToCalendar(salaryTx.data.occurredAt))}` : ''}
                </Text>
                <Row>
                  <Chip
                    label="No era el sueldo"
                    onPress={() =>
                      upsertPlan.mutate(
                        {
                          month,
                          expectedIncome: s.income.expected ?? s.income.salary ?? '0.00',
                          salaryTransactionId: null,
                        },
                        { onError: fail },
                      )
                    }
                  />
                </Row>
              </View>
            ) : (
              <View className="gap-2">
                <Text className="text-base text-slate-300">
                  Todavía no lo marcaste. Cuando lo cobres, cargalo con “Cobré” y elegí “Mi sueldo”.
                </Text>
                {candidates.map((tx) => (
                  <View key={tx.id} className="gap-2 border-t border-white/10 pt-2">
                    <Muted>
                      ¿El ingreso de {money(tx.amount)} del{' '}
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
                    </Row>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ) : null}

        {s && s.statement.previous.amount !== '0.00' ? (
          <Card>
            <Muted className="capitalize">
              Resumen de tarjeta de {monthName(previousMonthKey(month))}
            </Muted>
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-semibold text-white">
                {money(s.statement.previous.amount)}
              </Text>
              {s.statement.previous.paid ? (
                <Chip label="Pagado ✓" tone="success" />
              ) : (
                <Button label="Pagué" onPress={payStatement} loading={createTx.isPending} />
              )}
            </View>
            {!s.statement.previous.paid && s.statement.previous.paidAmount !== '0.00' ? (
              <Muted>Ya pagaste {money(s.statement.previous.paidAmount)}.</Muted>
            ) : null}
          </Card>
        ) : null}

        {s ? (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-white">Compromisos</Text>
              <Button
                label="+ Compromiso"
                variant="secondary"
                onPress={() => router.push('/(app)/commitments/new')}
              />
            </View>
            {s.commitments.items.length === 0 ? (
              <Muted>
                Alquiler, servicios, cuotas, suscripciones: cargalos y los restamos antes de que los
                pagues.
              </Muted>
            ) : null}
            {s.commitments.items.map((item) => {
              const status = itemStatus(item);
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    router.push({ pathname: '/(app)/commitments/[id]', params: { id: item.id } })
                  }
                  className="gap-2 rounded-xl bg-white/5 px-4 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 gap-0.5">
                      <Text className="text-base text-white">{item.name}</Text>
                      <Muted>
                        {KIND_LABEL[item.kind]} · {itemWhen(item)}
                      </Muted>
                    </View>
                    <Text className="text-base font-semibold text-white">{money(item.amount)}</Text>
                  </View>
                  <Row className="justify-between">
                    <Chip label={status.label} tone={status.tone} />
                    {!item.paid ? (
                      <Button
                        label="Pagué"
                        variant="secondary"
                        onPress={() => payItem(item)}
                        loading={pay.isPending && pay.variables?.id === item.id}
                      />
                    ) : null}
                  </Row>
                </Pressable>
              );
            })}
            <Muted>
              Te falta pagar {money(s.commitments.unpaidCash)} · en tarjeta{' '}
              {money(s.commitments.unpaidCredit)}
            </Muted>
          </View>
        ) : null}

        <View className="gap-3">
          <Button
            label={managing ? 'Ocultar todos' : 'Administrar'}
            variant="ghost"
            onPress={() => setManaging((m) => !m)}
          />
          {managing
            ? (allCommitments.data ?? []).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() =>
                    router.push({ pathname: '/(app)/commitments/[id]', params: { id: c.id } })
                  }
                  className="flex-row items-center justify-between rounded-xl bg-white/5 px-4 py-3"
                >
                  <View className="flex-1 gap-0.5">
                    <Text className={`text-base ${c.active ? 'text-white' : 'text-slate-500'}`}>
                      {c.name}
                    </Text>
                    <Muted>
                      {KIND_LABEL[c.kind]} · desde {monthName(c.startsOn)}
                      {c.endsOn ? ` hasta ${monthName(c.endsOn)}` : ''}
                    </Muted>
                  </View>
                  {!c.active ? <Chip label="Pausado" /> : null}
                </Pressable>
              ))
            : null}
          {managing && (allCommitments.data ?? []).length === 0 ? (
            <Muted>No tenés compromisos cargados.</Muted>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
