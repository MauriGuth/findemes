import { formatArs, formatIsoDate, todayInArt } from '@findemes/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Button, Card, Chip, Muted, Row, Screen, Title } from '@/components/ui';
import { BILL_KIND_LABEL, billStatus, dueLabel } from '@/lib/bills';
import { isoToCalendar, shortDate } from '@/lib/format';
import {
  errorMessage,
  useBillCandidates,
  useBills,
  useCommitments,
  usePayBill,
  useUpdateBill,
} from '@/lib/hooks';

/** One bill from "Por pagar": review it, link it to a commitment, mark it paid (ADR 013). */
export default function BillScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; month?: string }>();
  const id = params.id;
  const bills = useBills(params.month);
  const bill = bills.data?.find((b) => b.id === id);
  const candidates = useBillCandidates(bill && bill.status !== 'PAID' ? id : '');
  const commitments = useCommitments();
  const update = useUpdateBill();
  const pay = usePayBill();
  const fail = (e: unknown) => Alert.alert('No se pudo guardar', errorMessage(e));
  const today = formatIsoDate(todayInArt());

  if (!bill) {
    return (
      <Screen className="justify-center gap-4">
        <Muted>{bills.isPending ? 'Cargando…' : 'No encontramos esa factura.'}</Muted>
        <Button label="Volver" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const status = billStatus(bill, today);
  const statement = bill.kind === 'CARD_STATEMENT';
  const owed = bill.status === 'PENDING' || bill.status === 'UNPAID';
  const linkable = (commitments.data ?? []).filter(
    (c) => c.active && c.method !== 'CREDIT' && c.kind !== 'INSTALLMENT',
  );
  const linked = linkable.find((c) => c.id === bill.commitmentId);
  const payWith = (transactionId?: string) =>
    pay.mutate(
      { id: bill.id, ...(transactionId ? { transactionId } : {}) },
      { onError: fail, onSuccess: () => router.back() },
    );

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 py-6 pb-16">
        <View className="flex-row items-center justify-between">
          <Title>{bill.issuer}</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>

        <Card>
          <Muted>
            {BILL_KIND_LABEL[bill.kind]} · {dueLabel(bill.dueOn)}
          </Muted>
          <Text className="text-3xl font-bold text-white">{formatArs(bill.amount)}</Text>
          {bill.minimumAmount ? <Muted>Pago mínimo {formatArs(bill.minimumAmount)}</Muted> : null}
          {bill.currency === 'USD' ? (
            <Muted>Está en dólares: no la restamos de lo que te queda.</Muted>
          ) : null}
          <Row>
            <Chip label={status.label} tone={status.tone} />
          </Row>
        </Card>

        {bill.status === 'PENDING' ? (
          <Card>
            <Text className="text-base font-semibold text-white">¿Está bien?</Text>
            <Muted>
              {[
                bill.origin === 'EMAIL' ? 'La leímos de un correo que reenviaste.' : null,
                bill.currency === 'ARS' ? 'Ya se resta de lo que te queda.' : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Muted>
            <Row>
              <Chip
                label="Está bien"
                onPress={() => update.mutate({ id: bill.id, status: 'UNPAID' }, { onError: fail })}
              />
              <Chip
                label="No es mía"
                onPress={() =>
                  update.mutate(
                    { id: bill.id, status: 'IGNORED' },
                    { onError: fail, onSuccess: () => router.back() },
                  )
                }
              />
            </Row>
          </Card>
        ) : null}

        {owed && !statement ? (
          <Card>
            <Text className="text-base font-semibold text-white">¿Es de un compromiso?</Text>
            {linked ? (
              <>
                <Muted>
                  Es la de {linked.name}: este mes tu compromiso cuesta lo que dice la factura.
                </Muted>
                <Row>
                  <Chip
                    label="No es de ese compromiso"
                    onPress={() =>
                      update.mutate({ id: bill.id, commitmentId: null }, { onError: fail })
                    }
                  />
                </Row>
              </>
            ) : linkable.length > 0 ? (
              <>
                <Muted>Si ya lo tenías cargado, elegilo y no lo contamos dos veces.</Muted>
                <Row className="flex-wrap">
                  {linkable.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      onPress={() =>
                        update.mutate(
                          { id: bill.id, commitmentId: c.id, status: 'UNPAID' },
                          { onError: fail },
                        )
                      }
                    />
                  ))}
                </Row>
              </>
            ) : (
              <Muted>No tenés compromisos de débito para vincular.</Muted>
            )}
          </Card>
        ) : null}

        {owed ? (
          <Card>
            <Text className="text-base font-semibold text-white">¿Ya lo pagaste?</Text>
            {(candidates.data ?? []).length > 0 ? (
              <>
                <Muted>Si el pago ya está en tus movimientos, elegilo:</Muted>
                {(candidates.data ?? []).map((tx) => (
                  <View
                    key={tx.id}
                    className="flex-row items-center justify-between gap-2 border-t border-white/10 pt-2"
                  >
                    <View className="flex-1">
                      <Text className="text-base text-white">{tx.merchantRaw ?? 'Pago'}</Text>
                      <Muted>
                        {formatArs(tx.amount)} · {shortDate(isoToCalendar(tx.occurredAt))}
                      </Muted>
                    </View>
                    <Chip label="Es este" onPress={() => payWith(tx.id)} />
                  </View>
                ))}
              </>
            ) : null}
            <Button
              label="Pagué: registrar el pago"
              onPress={() => payWith()}
              loading={pay.isPending}
            />
            {statement ? <Muted>Lo registramos como pago del resumen, con débito.</Muted> : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
