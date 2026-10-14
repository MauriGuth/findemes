import { formatArs } from '@findemes/shared';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { errorMessage, useCatalog, useStats } from '@/lib/hooks';

const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** How this month is going (Phase 5). Nominal amounts. */
export default function StatsScreen() {
  const router = useRouter();
  const stats = useStats();
  const catalog = useCatalog();
  const s = stats.data;
  const nameOf = (id: string | null) => {
    if (!id) return 'Sin categoría';
    const c = catalog.data?.categories.find((x) => x.id === id);
    return c ? `${c.icon ?? ''} ${c.name}`.trim() : '';
  };
  const change = s?.previous.change ?? null;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-2 pb-16">
        <View className="flex-row items-center justify-between">
          <Title>Tu mes en números</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>
        {stats.isPending ? <Muted>Cargando…</Muted> : null}
        {stats.isError ? <Muted>{errorMessage(stats.error)}</Muted> : null}

        {s ? (
          <>
            <Card>
              <Muted>Gastaste</Muted>
              <Text className="text-4xl font-bold text-white">
                {formatArs(s.spent, { cents: false })}
              </Text>
              <Muted>{formatArs(s.dailyAverage, { cents: false })} por día en promedio</Muted>
            </Card>

            <Card>
              <Muted>Contra el mes pasado, a esta altura</Muted>
              <Text className="text-2xl font-bold text-white">
                {change === null
                  ? 'Sin datos del mes pasado'
                  : change === 0
                    ? 'Igual que el mes pasado'
                    : `${change > 0 ? '+' : ''}${String(Math.round(change * 100))}%`}
              </Text>
              <Muted>
                El mes pasado llevabas {formatArs(s.previous.sameDays, { cents: false })}. Es el
                monto nominal: con inflación, comparar meses engaña un poco.
              </Muted>
            </Card>

            {s.topWeekday ? (
              <Card>
                <Muted>El día que más gastás</Muted>
                <Text className="text-2xl font-bold capitalize text-white">
                  {WEEKDAYS[s.topWeekday.weekday]}
                </Text>
                <Muted>{formatArs(s.topWeekday.amount, { cents: false })} este mes</Muted>
              </Card>
            ) : null}

            {s.byCategory.length > 0 ? (
              <Card>
                <Text className="text-base font-semibold text-white">Por categoría</Text>
                {s.byCategory.map((c) => (
                  <View key={c.categoryId ?? 'none'} className="gap-1">
                    <View className="flex-row justify-between">
                      <Text className="text-sm text-slate-200">{nameOf(c.categoryId)}</Text>
                      <Text className="text-sm text-slate-200">
                        {formatArs(c.amount, { cents: false })} · {Math.round(c.share * 100)}%
                      </Text>
                    </View>
                    <View className="h-1.5 rounded-full bg-white/10">
                      <View
                        className="h-1.5 rounded-full bg-accent"
                        style={{ width: `${c.share * 100}%` }}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            ) : (
              <Muted>Todavía no hay gastos este mes.</Muted>
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
