import {
  type Commitment,
  type CommitmentKind,
  type CreateCommitmentInput,
  installmentsEndsOn,
  monthKey,
  nextMonthKey,
  type PaymentMethod,
  previousMonthKey,
  todayInArt,
  type UpdateCommitmentInput,
} from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { MoneyInput } from '@/components/MoneyInput';
import { Button, Chip, ErrorText, Muted, Row, TextField } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { monthName } from '@/lib/format';
import { errorMessage, useCatalog, useCreateCommitment, useUpdateCommitment } from '@/lib/hooks';

export const KIND_LABEL: Record<CommitmentKind, string> = {
  RENT: 'Alquiler',
  SERVICE: 'Servicio',
  INSTALLMENT: 'Cuota',
  SUBSCRIPTION: 'Suscripción',
  DEBIT: 'Débito automático',
};

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'DEBIT', label: 'Débito' },
  { value: 'CREDIT', label: 'Crédito' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'WALLET', label: 'Billetera' },
  { value: 'CASH', label: 'Efectivo' },
];

/** "‹ septiembre 2026 ›" */
export function MonthStepper({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (month: string) => void;
  label: string;
}) {
  return (
    <View className="gap-1">
      <Muted>{label}</Muted>
      <View className="flex-row items-center justify-between rounded-xl bg-white/10 px-2 py-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          onPress={() => onChange(previousMonthKey(value))}
          className="px-3 py-2"
        >
          <Text className="text-xl text-slate-300">‹</Text>
        </Pressable>
        <Text className="text-base capitalize text-white">{monthName(value)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          onPress={() => onChange(nextMonthKey(value))}
          className="px-3 py-2"
        >
          <Text className="text-xl text-slate-300">›</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface Props {
  existing?: Commitment;
  onDone?: () => void;
}

/** Create and edit share one form; "dar de baja", pause and delete live on the detail screen. */
export function CommitmentForm({ existing, onDone }: Props) {
  const router = useRouter();
  const thisMonth = monthKey(todayInArt());
  const catalog = useCatalog().data;
  const create = useCreateCommitment();
  const update = useUpdateCommitment();

  const [kind, setKind] = useState<CommitmentKind>(existing?.kind ?? 'SERVICE');
  const [name, setName] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(existing?.amount ?? '');
  const [method, setMethod] = useState<PaymentMethod>(existing?.method ?? 'DEBIT');
  const [dayOfMonth, setDayOfMonth] = useState(existing ? String(existing.dayOfMonth) : '');
  const [startsOn, setStartsOn] = useState(existing?.startsOn ?? thisMonth);
  const [installments, setInstallments] = useState(
    existing?.installmentsTotal ? String(existing.installmentsTotal) : '',
  );
  const [hasEnd, setHasEnd] = useState(existing?.endsOn !== null && existing?.endsOn !== undefined);
  const [endsOn, setEndsOn] = useState(existing?.endsOn ?? thisMonth);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [sourceId, setSourceId] = useState<string | null>(existing?.sourceId ?? null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isInstallment = kind === 'INSTALLMENT';
  const installmentsTotal = Number.parseInt(installments, 10);
  const lastInstallment =
    isInstallment && installmentsTotal >= 1
      ? installmentsEndsOn(`${startsOn}-01`, installmentsTotal).slice(0, 7)
      : null;
  const busy = create.isPending || update.isPending;

  const submit = async () => {
    setError('');
    setFieldErrors({});
    const day = Number.parseInt(dayOfMonth, 10);
    const local: Record<string, string> = {};
    if (!name.trim()) local['name'] = 'Ponele un nombre';
    if (!amount) local['amount'] = 'Poné el monto';
    if (!Number.isInteger(day) || day < 1 || day > 31)
      local['dayOfMonth'] = 'El día tiene que estar entre 1 y 31';
    if (isInstallment && !(installmentsTotal >= 1))
      local['installmentsTotal'] = '¿Cuántas cuotas son?';
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }
    try {
      if (existing) {
        const input: UpdateCommitmentInput = {
          kind,
          name: name.trim(),
          amount,
          method,
          dayOfMonth: day,
          startsOn,
          installmentsTotal: isInstallment ? installmentsTotal : null,
          endsOn: isInstallment ? null : hasEnd ? endsOn : null,
          categoryId,
          sourceId,
        };
        await update.mutateAsync({ id: existing.id, ...input });
      } else {
        const input: CreateCommitmentInput = {
          kind,
          name: name.trim(),
          amount,
          method,
          dayOfMonth: day,
          startsOn,
          ...(isInstallment ? { installmentsTotal } : {}),
          ...(!isInstallment && hasEnd ? { endsOn } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(sourceId ? { sourceId } : {}),
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
      <ScrollView
        contentContainerClassName="gap-4 pb-32"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Row>
          {(Object.keys(KIND_LABEL) as CommitmentKind[]).map((k) => (
            <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Row>

        <TextField
          label="¿Qué es?"
          placeholder={isInstallment ? 'Heladera' : 'Alquiler, luz, Netflix…'}
          value={name}
          onChangeText={setName}
          error={fieldErrors['name']}
          autoCapitalize="sentences"
        />

        <View className="gap-1">
          <Muted>{isInstallment ? 'Monto de cada cuota' : 'Monto por mes'}</Muted>
          <MoneyInput value={amount} onChange={setAmount} error={fieldErrors['amount']} />
        </View>

        <View className="gap-2">
          <Muted>¿Cómo lo pagás?</Muted>
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
          {method === 'CREDIT' ? (
            <Muted>Va al resumen de la tarjeta, no sale del cash de este mes.</Muted>
          ) : null}
        </View>

        <TextField
          label="Vence el día"
          placeholder="10"
          keyboardType="number-pad"
          value={dayOfMonth}
          onChangeText={(t) => setDayOfMonth(t.replace(/\D/g, '').slice(0, 2))}
          error={fieldErrors['dayOfMonth']}
        />
        <Muted>En meses cortos cae el último día.</Muted>

        <MonthStepper
          label={isInstallment ? '¿Primera cuota?' : 'Empieza en'}
          value={startsOn}
          onChange={setStartsOn}
        />

        {isInstallment ? (
          <View className="gap-2">
            <TextField
              label="¿Cuántas cuotas?"
              placeholder="6"
              keyboardType="number-pad"
              value={installments}
              onChangeText={(t) => setInstallments(t.replace(/\D/g, '').slice(0, 3))}
              error={fieldErrors['installmentsTotal']}
            />
            {lastInstallment ? (
              <Muted className="capitalize">Última cuota: {monthName(lastInstallment)}</Muted>
            ) : null}
            <Muted>No cargues también la compra: cada cuota entra sola al resumen.</Muted>
          </View>
        ) : (
          <View className="gap-2">
            <Row>
              <Chip label="Sin fecha de fin" selected={!hasEnd} onPress={() => setHasEnd(false)} />
              <Chip label="Termina en…" selected={hasEnd} onPress={() => setHasEnd(true)} />
            </Row>
            {hasEnd ? (
              <MonthStepper label="Último mes" value={endsOn} onChange={setEndsOn} />
            ) : null}
            <ErrorText>{fieldErrors['endsOn']}</ErrorText>
          </View>
        )}

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
