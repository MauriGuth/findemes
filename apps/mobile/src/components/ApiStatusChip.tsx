import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { fetchHealth } from '@/lib/api';

/** Smoke test for phase 0: the app can reach the API and the API can reach its database. */
export function ApiStatusChip() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 15_000 });

  const state = health.isPending
    ? { label: 'Conectando con la API…', dot: 'bg-slate-400' }
    : health.isError || health.data?.status !== 'ok'
      ? { label: 'Sin conexión con la API', dot: 'bg-danger' }
      : { label: `API conectada · v${health.data.info?.app?.version ?? '?'}`, dot: 'bg-accent' };

  return (
    <View className="flex-row items-center gap-2 self-start rounded-full bg-white/10 px-3 py-1.5">
      <View className={`h-2 w-2 rounded-full ${state.dot}`} />
      <Text className="text-xs text-slate-200">{state.label}</Text>
    </View>
  );
}
