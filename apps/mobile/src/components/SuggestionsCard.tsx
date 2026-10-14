import { formatArs } from '@findemes/shared';
import { Alert, Text, View } from 'react-native';

import { Button, Card, Muted, Row } from '@/components/ui';
import {
  errorMessage,
  useAcceptSuggestion,
  useDismissSuggestion,
  useRecurringSuggestions,
} from '@/lib/hooks';

/** "¿Es un gasto fijo?": monthly payments not loaded as commitments yet (Phase 7). */
export function SuggestionsCard() {
  const suggestions = useRecurringSuggestions();
  const accept = useAcceptSuggestion();
  const dismiss = useDismissSuggestion();
  const items = suggestions.data ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="border border-accent/30">
      <Text className="text-base font-semibold text-white">¿Son gastos fijos?</Text>
      <Muted>Los pagaste todos los meses. Si los sumás como fijos, te los descontamos antes.</Muted>
      {items.map((s) => (
        <View key={s.key} className="gap-2 border-t border-white/10 pt-3">
          <Text className="text-base text-white">
            {s.name} · {formatArs(s.amount, { cents: false })}
          </Text>
          <Muted>
            Cerca del día {s.dayOfMonth} · {s.months} meses seguidos
          </Muted>
          <Row>
            <Button
              label="Sumar como fijo"
              variant="secondary"
              loading={accept.isPending}
              onPress={() =>
                accept.mutate(s, {
                  onError: (e) => Alert.alert('No se pudo', errorMessage(e)),
                })
              }
            />
            <Button
              label="No es fijo"
              variant="ghost"
              onPress={() =>
                dismiss.mutate(s.key, {
                  onError: (e) => Alert.alert('No se pudo', errorMessage(e)),
                })
              }
            />
          </Row>
        </View>
      ))}
    </Card>
  );
}
