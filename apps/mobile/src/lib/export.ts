import { type MonthKey } from '@findemes/shared';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { ApiError, apiGet } from './api';

/** Downloads the CSV of the movements and opens the share sheet (Phase 7). */
export async function exportMovements(from: MonthKey, to: MonthKey): Promise<void> {
  const csv = await apiGet<string>(`/exports/transactions.csv?from=${from}&to=${to}`, {
    text: true,
  });
  const file = new File(Paths.cache, `findemes-${from}-a-${to}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError(0, 'Este teléfono no permite compartir archivos.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Tus movimientos',
    UTI: 'public.comma-separated-values-text',
  });
}
