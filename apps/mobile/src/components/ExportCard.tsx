import { addMonths, monthKey, parseMonthKey } from '@findemes/shared';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Card, Chip, Muted, Row } from '@/components/ui';
import { exportMovements } from '@/lib/export';
import { currentMonthKey } from '@/lib/format';
import { errorMessage } from '@/lib/hooks';

const RANGES = [
  { label: 'Este mes', months: 1 },
  { label: 'Últimos 3 meses', months: 3 },
  { label: 'Último año', months: 12 },
];

/** Ajustes → "Descargar mis movimientos" as CSV (Phase 7). */
export function ExportCard() {
  const [busy, setBusy] = useState<number | null>(null);

  const run = async (months: number) => {
    const to = currentMonthKey();
    const from = monthKey(addMonths(parseMonthKey(to), -(months - 1)));
    setBusy(months);
    try {
      await exportMovements(from, to);
    } catch (error) {
      Alert.alert('No se pudo descargar', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Text className="text-base text-white">Descargar mis movimientos</Text>
      <Muted>Un archivo CSV que abre Excel o Google Sheets. Lo compartís a donde quieras.</Muted>
      <Row>
        {RANGES.map((r) => (
          <Chip
            key={r.months}
            label={busy === r.months ? 'Preparando…' : r.label}
            onPress={busy === null ? () => void run(r.months) : undefined}
          />
        ))}
      </Row>
    </Card>
  );
}
