import { daysLeftInMonth, divideMoney, formatArs, todayInArt } from '@findemes/shared';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiStatusChip } from '@/components/ApiStatusChip';

// Phase 0 placeholder: fixed numbers, real formula shape. Phase 1 replaces them with
// income − unpaid commitments − cash spent this month.
const REMAINING = '187450.00';

export default function HomeScreen() {
  const today = todayInArt();
  const daysLeft = daysLeftInMonth(today);
  const perDay = divideMoney(REMAINING, daysLeft);

  return (
    <SafeAreaView className="flex-1 bg-ink px-6">
      <View className="flex-1 justify-center gap-6">
        <View className="gap-1">
          <Text className="text-base text-slate-400">Te quedan</Text>
          <Text className="text-5xl font-bold tracking-tight text-white">
            {formatArs(REMAINING, { cents: false })}
          </Text>
          <Text className="text-base text-slate-300">
            hasta el 1 · {formatArs(perDay, { cents: false })} por día
          </Text>
        </View>

        <View className="gap-1 rounded-2xl bg-white/5 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">
            Próximo resumen de tarjeta
          </Text>
          <Text className="text-xl font-semibold text-white">{formatArs('0')}</Text>
        </View>

        <Text className="text-sm text-slate-500">
          {daysLeft === 1 ? 'Último día del mes.' : `Faltan ${daysLeft} días para el 1.`} Todavía no
          registramos movimientos: esta pantalla es el esqueleto de la Fase 0.
        </Text>

        <ApiStatusChip />
      </View>
    </SafeAreaView>
  );
}
