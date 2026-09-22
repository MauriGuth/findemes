import {
  type Commitment,
  type CreateTransactionInput,
  formatArs,
  monthKey,
  type MonthSummary,
  nextMonthKey,
  type PaymentMethod,
  previousMonthKey,
  todayInArt,
  type Transaction,
  type UpdateTransactionInput,
} from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { MoneyInput } from '@/components/MoneyInput';
import { Button, Chip, ErrorText, Muted, Row, TextField } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { calendarKey, dayLabel, isoToCalendar, noonOf, recentDays } from '@/lib/format';
import {
  errorMessage,
  useCatalog,
  useCommitments,
  useCreateInstallmentPurchase,
  useCreateTransaction,
  useSummary,
  useUpdateTransaction,
} from '@/lib/hooks';

type Mode = 'expense' | 'income' | 'own';
type IncomeKind = 'salary' | 'other' | null;

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'DEBIT', label: 'Débito' },
  { value: 'CREDIT', label: 'Crédito' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'WALLET', label: 'Billetera' },
  { value: 'CASH', label: 'Efectivo' },
];

interface Props {
  existing?: Transaction;
  onDone?: () => void;
}

function initialMode(existing?: Transaction): Mode {
  if (!existing) return 'expense';
  if (existing.isOwnTransfer) return 'own';
  return existing.direction === 'IN' ? 'income' : 'expense';
}

/** One form for the quick add modal and the edit screen. */
export function TransactionForm({ existing, onDone }: Props) {
  const router = useRouter();
  const today = todayInArt();
  const thisMonth = monthKey(today);
  const summary = useSummary(thisMonth).data;
  const catalog = useCatalog().data;
  const commitments = useCommitments().data ?? [];
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const installments = useCreateInstallmentPurchase();

  const [mode, setMode] = useState<Mode>(initialMode(existing));
  const [amount, setAmount] = useState(existing?.amount ?? '');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>(existing?.currency ?? 'ARS');
  const [method, setMethod] = useState<PaymentMethod>(existing?.method ?? 'DEBIT');
  const [merchant, setMerchant] = useState(existing?.merchantRaw ?? '');
  const [dayKey, setDayKey] = useState(
    existing ? calendarKey(isoToCalendar(existing.occurredAt)) : calendarKey(today),
  );
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [sourceId, setSourceId] = useState<string | null>(existing?.sourceId ?? null);
  const [commitmentId, setCommitmentId] = useState<string | null>(existing?.commitmentId ?? null);
  const [commitmentMonth, setCommitmentMonth] = useState(existing?.commitmentMonth ?? thisMonth);
  const [statementPayment, setStatementPayment] = useState(existing?.isStatementPayment ?? false);
  const [inInstallments, setInInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState('6');
  const [incomeKind, setIncomeKind] = useState<IncomeKind>(
    existing?.isSalary ? 'salary' : existing?.direction === 'IN' ? 'other' : null,
  );
  const [salaryMonth, setSalaryMonth] = useState(thisMonth);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const days = useMemo(() => recentDays(31, today), [today]);
  const unpaid = useMemo(
    () => (summary?.commitments.items ?? []).filter((item) => !item.paid),
    [summary],
  );
  const busy = create.isPending || update.isPending || installments.isPending;

  const occurredAt = (): string | undefined => {
    if (dayKey === calendarKey(today)) return existing ? existing.occurredAt : undefined;
    const [y, m, d] = dayKey.split('-').map(Number);
    return noonOf({ year: y ?? today.year, month: m ?? today.month, day: d ?? today.day });
  };

  const submit = async () => {
    setError(null);
    setFieldErrors({});
    if (!amount) {
      setFieldErrors({ amount: 'Poné el monto' });
      return;
    }
    if (mode === 'income' && currency === 'ARS' && incomeKind === null) {
      setError('Contanos qué es: tu sueldo u otro ingreso.');
      return;
    }
    try {
      if (!existing && mode === 'expense' && method === 'CREDIT' && inInstallments) {
        const n = Number(installmentCount);
        await installments.mutateAsync({
          total: amount,
          installments: Number.isFinite(n) ? n : 0,
          name: merchant.trim() || 'Compra en cuotas',
          occurredAt: occurredAt(),
          ...(sourceId ? { sourceId } : {}),
          ...(categoryId ? { categoryId } : {}),
        });
      } else if (existing) {
        const input: UpdateTransactionInput = {
          amount,
          currency,
          direction: mode === 'income' ? 'IN' : mode === 'own' ? existing.direction : 'OUT',
          method,
          merchantRaw: merchant.trim() || null,
          categoryId,
          sourceId,
          ...(occurredAt() ? { occurredAt: occurredAt() } : {}),
          isOwnTransfer: mode === 'own',
          commitmentId: mode === 'expense' ? commitmentId : null,
          ...(mode === 'expense' && commitmentId ? { commitmentMonth } : {}),
          isStatementPayment: mode === 'expense' && statementPayment,
        };
        await update.mutateAsync({ id: existing.id, ...input });
      } else {
        const input: CreateTransactionInput = {
          amount,
          currency,
          direction: mode === 'income' ? 'IN' : mode === 'own' ? 'OUT' : 'OUT',
          method,
          ...(merchant.trim() ? { merchantRaw: merchant.trim() } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(sourceId ? { sourceId } : {}),
          ...(occurredAt() ? { occurredAt: occurredAt() } : {}),
          isOwnTransfer: mode === 'own',
          ...(mode === 'expense' && commitmentId ? { commitmentId, commitmentMonth } : {}),
          isStatementPayment: mode === 'expense' && statementPayment,
          markAsSalary: mode === 'income' && incomeKind === 'salary' && currency === 'ARS',
          ...(mode === 'income' && incomeKind === 'salary' ? { salaryMonth } : {}),
          ...(mode === 'income' && incomeKind === 'other' ? { status: 'CONFIRMED' as const } : {}),
        };
        await create.mutateAsync(input);
      }
      if (onDone) onDone();
      else router.back();
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0) {
        setFieldErrors(Object.fromEntries(e.issues.map((issue) => [issue.path, issue.message])));
      }
      setError(errorMessage(e));
    }
  };

  const commitmentLabel = (c: Commitment | MonthSummary['commitments']['items'][number]) =>
    `${c.name} · ${formatArs(c.amount, { cents: false })}`;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
      <ScrollView contentContainerClassName="gap-5 pb-32" keyboardShouldPersistTaps="handled">
        <Row>
          <Chip label="Gasté" selected={mode === 'expense'} onPress={() => setMode('expense')} />
          <Chip label="Cobré" selected={mode === 'income'} onPress={() => setMode('income')} />
          <Chip
            label="Entre mis cuentas"
            selected={mode === 'own'}
            onPress={() => setMode('own')}
          />
        </Row>

        <MoneyInput
          value={amount}
          onChange={setAmount}
          currency={currency}
          error={fieldErrors.amount}
          autoFocus={!existing}
        />

        <Row>
          <Chip label="Pesos" selected={currency === 'ARS'} onPress={() => setCurrency('ARS')} />
          <Chip label="Dólares" selected={currency === 'USD'} onPress={() => setCurrency('USD')} />
          {currency === 'USD' ? <Muted>USD no entra en la cuenta hasta el 1.</Muted> : null}
        </Row>

        <View className="gap-2">
          <Muted>¿Con qué?</Muted>
          <Row>
            {METHODS.map((m) => (
              <Chip
                key={m.value}
                label={m.label}
                selected={method === m.value}
                onPress={() => setMethod(m.value)}
              />
            ))}
          </Row>
          {mode === 'expense' && method === 'CREDIT' ? (
            <Muted>Va al resumen de la tarjeta, no sale del cash de este mes.</Muted>
          ) : null}
        </View>

        {!existing && mode === 'expense' && method === 'CREDIT' ? (
          <View className="gap-2">
            <Row>
              <Chip
                label="¿En cuotas?"
                selected={inInstallments}
                onPress={() => setInInstallments((v) => !v)}
              />
              {inInstallments
                ? ['3', '6', '12', '18'].map((n) => (
                    <Chip
                      key={n}
                      label={`${n} cuotas`}
                      selected={installmentCount === n}
                      onPress={() => setInstallmentCount(n)}
                    />
                  ))
                : null}
            </Row>
            {inInstallments ? (
              <Muted>
                Se crea un compromiso por cuota. No cargues también la compra: cada cuota entra sola
                al resumen.
              </Muted>
            ) : null}
          </View>
        ) : null}

        <TextField
          label="¿Dónde?"
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Súper, Netflix, alquiler…"
          error={fieldErrors.merchantRaw}
        />

        <View className="gap-2">
          <Muted>¿Cuándo?</Muted>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {days.map((d) => {
              const key = calendarKey(d);
              return (
                <Chip
                  key={key}
                  label={dayLabel(d, today)}
                  selected={dayKey === key}
                  onPress={() => setDayKey(key)}
                />
              );
            })}
          </ScrollView>
        </View>

        {mode === 'income' && currency === 'ARS' ? (
          <View className="gap-2">
            <Muted>¿Qué es?</Muted>
            <Row>
              <Chip
                label="Mi sueldo"
                selected={incomeKind === 'salary'}
                onPress={() => setIncomeKind('salary')}
              />
              <Chip
                label="Otro ingreso"
                selected={incomeKind === 'other'}
                onPress={() => setIncomeKind('other')}
              />
            </Row>
            {incomeKind === 'salary' && !existing ? (
              <Row>
                <Muted>¿De qué mes?</Muted>
                <Chip
                  label="Este mes"
                  selected={salaryMonth === thisMonth}
                  onPress={() => setSalaryMonth(thisMonth)}
                />
                <Chip
                  label="El que viene"
                  selected={salaryMonth === nextMonthKey(thisMonth)}
                  onPress={() => setSalaryMonth(nextMonthKey(thisMonth))}
                />
              </Row>
            ) : null}
          </View>
        ) : null}

        {mode === 'expense' && (unpaid.length > 0 || commitmentId) ? (
          <View className="gap-2">
            <Muted>¿Es el pago de un compromiso?</Muted>
            <Row>
              <Chip
                label="No"
                selected={commitmentId === null}
                onPress={() => setCommitmentId(null)}
              />
              {(unpaid.length > 0 ? unpaid : commitments.filter((c) => c.id === commitmentId)).map(
                (c) => (
                  <Chip
                    key={c.id}
                    label={commitmentLabel(c)}
                    selected={commitmentId === c.id}
                    onPress={() => {
                      setCommitmentId(c.id);
                      if (!amount) setAmount(c.amount);
                      setMethod(c.method);
                      if (!merchant) setMerchant(c.name);
                    }}
                  />
                ),
              )}
            </Row>
            {commitmentId ? (
              <Row>
                <Muted>¿De qué mes?</Muted>
                <Chip
                  label="Este mes"
                  selected={commitmentMonth === thisMonth}
                  onPress={() => setCommitmentMonth(thisMonth)}
                />
                <Chip
                  label="Mes pasado"
                  selected={commitmentMonth === previousMonthKey(thisMonth)}
                  onPress={() => setCommitmentMonth(previousMonthKey(thisMonth))}
                />
              </Row>
            ) : null}
          </View>
        ) : null}

        {mode === 'expense' &&
        method !== 'CREDIT' &&
        (summary?.pending.needsStatementPayment || statementPayment) ? (
          <Row>
            <Chip
              label={`Es el pago del resumen (${formatArs(summary?.statement.previous.amount ?? '0', { cents: false })})`}
              selected={statementPayment}
              onPress={() => {
                setStatementPayment((v) => !v);
                if (!amount && summary) setAmount(summary.statement.previous.amount);
              }}
            />
          </Row>
        ) : null}

        {catalog ? (
          <View className="gap-2">
            <Muted>Categoría (opcional)</Muted>
            <Row>
              {catalog.categories.map((c) => (
                <Chip
                  key={c.id}
                  label={`${c.icon ?? ''} ${c.name}`}
                  selected={categoryId === c.id}
                  onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                />
              ))}
            </Row>
            <Muted>Desde (opcional)</Muted>
            <Row>
              {catalog.sources.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={sourceId === s.id}
                  onPress={() => setSourceId(sourceId === s.id ? null : s.id)}
                />
              ))}
            </Row>
          </View>
        ) : null}

        <ErrorText>{error}</ErrorText>
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 bg-ink px-6 pb-6 pt-2">
        <Button
          label={existing ? 'Guardar cambios' : 'Guardar'}
          onPress={() => void submit()}
          loading={busy}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
