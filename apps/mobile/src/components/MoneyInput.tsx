import { amountToTypedDisplay, compareMoney, formatTypedAmount } from '@findemes/shared';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ErrorText } from './ui';

interface Props {
  /** Canonical amount ("1234.56") or '' */
  value: string;
  onChange: (amount: string) => void;
  currency?: 'ARS' | 'USD';
  error?: string;
  autoFocus?: boolean;
}

function sameAmount(a: string, b: string): boolean {
  if (a === '' || b === '') return a === b;
  return compareMoney(a, b) === 0;
}

/** Big amount field that groups thousands while typing: "3000000" shows as "3.000.000". */
export function MoneyInput({ value, onChange, currency = 'ARS', error, autoFocus }: Props) {
  const [typed, setTyped] = useState(() => amountToTypedDisplay(value));

  // The parent may set the amount itself (a prefilled payment): follow it unless it is what we typed.
  const display = sameAmount(formatTypedAmount(typed).amount, value)
    ? typed
    : amountToTypedDisplay(value);

  const onChangeText = (text: string) => {
    const next = formatTypedAmount(text);
    setTyped(next.display);
    onChange(next.amount);
  };

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2 rounded-2xl bg-white/10 px-4 py-3">
        <Text className="text-3xl font-bold text-slate-400">
          {currency === 'USD' ? 'US$' : '$'}
        </Text>
        <TextInput
          value={display}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#64748B"
          autoFocus={autoFocus}
          accessibilityLabel="Monto"
          className="flex-1 text-4xl font-bold text-white"
        />
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
