import { type EntryDraft, formatArs } from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Card, ErrorText, Muted, Screen, TextField, Title } from '@/components/ui';
import { errorMessage, useCatalog, useParseEntry, useSaveEntries } from '@/lib/hooks';

const METHOD_LABEL: Record<EntryDraft['method'], string> = {
  CASH: 'Efectivo',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  TRANSFER: 'Transferencia',
  WALLET: 'Billetera',
};

/** Typed (or dictated) expenses → drafts to review → movements (ADR 014). */
export default function NewEntryScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const parse = useParseEntry();
  const save = useSaveEntries();
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<EntryDraft[] | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const categoryName = (id: string | null) =>
    catalog.data?.categories.find((c) => c.id === id)?.name ?? 'Sin categoría';

  const read = () =>
    parse.mutate(text, {
      onSuccess: (result) => {
        setDrafts(result);
        setSkipped(new Set());
      },
    });

  const chosen = (drafts ?? []).filter((_, i) => !skipped.has(i));
  const submit = () =>
    save.mutate(chosen, {
      onSuccess: () => router.back(),
      onError: (e) => Alert.alert('No se pudo guardar', errorMessage(e)),
    });

  const toggle = (i: number) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-2 pb-16" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between">
          <Title>Contalo</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>
        <TextField
          multiline
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder="Gasté 50 lucas en el súper y ayer 20 en el taxi con Mercado Pago"
          className="min-h-28"
          textAlignVertical="top"
          maxLength={1000}
        />
        <Muted>Para dictarlo, tocá el micrófono del teclado.</Muted>
        <Button
          label={drafts ? 'Volver a leer' : 'Leer'}
          variant={drafts ? 'secondary' : 'primary'}
          onPress={read}
          loading={parse.isPending}
          disabled={text.trim().length < 2}
        />
        <ErrorText>{parse.isError ? errorMessage(parse.error) : null}</ErrorText>

        {drafts && drafts.length === 0 ? (
          <Card>
            <Muted>No encontramos montos. Probá así: “gasté 8 lucas en el kiosco”.</Muted>
          </Card>
        ) : null}

        {drafts?.map((draft, i) => {
          const off = skipped.has(i);
          return (
            <Pressable
              key={i}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !off }}
              onPress={() => toggle(i)}
            >
              <Card className={off ? 'opacity-40' : ''}>
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-base text-white">
                    {draft.merchantRaw ?? (draft.direction === 'IN' ? 'Ingreso' : 'Gasto')}
                  </Text>
                  <Text
                    className={`text-base font-semibold ${draft.direction === 'IN' ? 'text-accent' : 'text-white'}`}
                  >
                    {draft.direction === 'IN' ? '+' : ''}
                    {draft.currency === 'USD'
                      ? formatArs(draft.amount).replace('$', 'US$')
                      : formatArs(draft.amount)}
                  </Text>
                </View>
                <Muted>
                  {METHOD_LABEL[draft.method]} · {categoryName(draft.categoryId)}
                  {draft.occurredAt
                    ? ` · ${new Date(draft.occurredAt).toLocaleDateString('es-AR')}`
                    : ' · hoy'}
                  {off ? ' · no se guarda' : ''}
                </Muted>
              </Card>
            </Pressable>
          );
        })}

        {drafts && drafts.length > 0 ? (
          <>
            <Muted>Tocá uno para no guardarlo. Después podés corregir cada uno en Inicio.</Muted>
            <Button
              label={
                chosen.length === 1
                  ? 'Guardar 1 movimiento'
                  : `Guardar ${String(chosen.length)} movimientos`
              }
              onPress={submit}
              loading={save.isPending}
              disabled={chosen.length === 0}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
