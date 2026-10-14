import { formatArs } from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { MoneyInput } from '@/components/MoneyInput';
import { Button, Card, Chip, Muted, Row, Screen, Title } from '@/components/ui';
import {
  errorMessage,
  useBudgets,
  useCatalog,
  useDeleteBudget,
  useUpsertBudget,
} from '@/lib/hooks';

/** Spending categories (not income, transfers or the card payment). */
const NOT_BUDGETABLE = new Set(['ingresos', 'transferencias', 'tarjeta']);

/** Monthly limits by category and how they are going (Phase 5). */
export default function BudgetsScreen() {
  const router = useRouter();
  const budgets = useBudgets();
  const catalog = useCatalog();
  const upsert = useUpsertBudget();
  const remove = useDeleteBudget();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const categories = (catalog.data?.categories ?? []).filter((c) => !NOT_BUDGETABLE.has(c.slug));
  const nameOf = (id: string) => {
    const c = catalog.data?.categories.find((x) => x.id === id);
    return c ? `${c.icon ?? ''} ${c.name}`.trim() : '';
  };

  const save = () => {
    if (!categoryId || !amount) return;
    upsert.mutate(
      { categoryId, amount },
      {
        onSuccess: () => {
          setCategoryId(null);
          setAmount('');
        },
        onError: (e) => Alert.alert('No se pudo guardar', errorMessage(e)),
      },
    );
  };

  const confirmRemove = (id: string) =>
    Alert.alert('Borrar el presupuesto', nameOf(id), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, { onError: (e) => Alert.alert('No se pudo', errorMessage(e)) }),
      },
    ]);

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-2 pb-16" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between">
          <Title>Presupuestos</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>
        <Muted>
          Un tope por categoría para este mes (de cobro a cobro). Cuenta débito y crédito: lo que
          comprás, no cuándo lo pagás.
        </Muted>

        {budgets.isError ? <Muted>{errorMessage(budgets.error)}</Muted> : null}
        {budgets.data?.length === 0 ? <Muted>Todavía no armaste ninguno.</Muted> : null}

        {budgets.data?.map((b) => {
          const pct = Math.min(1, b.ratio);
          const tone = b.ratio >= 1 ? 'bg-danger' : b.ratio >= 0.8 ? 'bg-warn' : 'bg-accent';
          return (
            <Pressable
              key={b.id}
              onPress={() => {
                setCategoryId(b.categoryId);
                setAmount(b.amount);
              }}
              onLongPress={() => confirmRemove(b.id)}
            >
              <Card>
                <View className="flex-row justify-between">
                  <Text className="text-base text-white">{nameOf(b.categoryId)}</Text>
                  <Text className="text-base text-white">
                    {formatArs(b.spent, { cents: false })} / {formatArs(b.amount, { cents: false })}
                  </Text>
                </View>
                <View className="h-2 overflow-hidden rounded-full bg-white/10">
                  <View className={`h-2 rounded-full ${tone}`} style={{ width: `${pct * 100}%` }} />
                </View>
                <Muted>
                  {b.remaining.startsWith('-')
                    ? `Te pasaste por ${formatArs(b.remaining.slice(1), { cents: false })}`
                    : `Te quedan ${formatArs(b.remaining, { cents: false })}`}
                </Muted>
              </Card>
            </Pressable>
          );
        })}
        {budgets.data && budgets.data.length > 0 ? (
          <Muted>Tocá uno para cambiarlo; mantenelo apretado para borrarlo.</Muted>
        ) : null}

        <Card className="gap-3">
          <Text className="text-base font-semibold text-white">
            {categoryId && budgets.data?.some((b) => b.categoryId === categoryId)
              ? 'Cambiar presupuesto'
              : 'Nuevo presupuesto'}
          </Text>
          <Row>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={`${c.icon ?? ''} ${c.name}`.trim()}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </Row>
          <MoneyInput value={amount} onChange={setAmount} />
          <Button
            label="Guardar"
            onPress={save}
            loading={upsert.isPending}
            disabled={!categoryId || !amount || amount === '0.00'}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
