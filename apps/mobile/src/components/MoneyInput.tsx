import { formatArs, parseArs } from '@findemes/shared';
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

/** Big amount field: the user types "1234,5", we keep "1234.50" and show "$1.234,50" while idle. */
export function MoneyInput({ value, onChange, currency = 'ARS', error, autoFocus }: Props) {
  const [raw, setRaw] = useState(
    value ? formatArs(value, { cents: false }).replace(/^\$/, '') : '',
  );
  const [focused, setFocused] = useState(false);

  const onChangeText = (text: string) => {
    setRaw(text);
    onChange(parseArs(text) ?? '');
  };

  const display = focused || !value ? raw : formatArs(value).replace(/^-?\$/, '');

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2 rounded-2xl bg-white/10 px-4 py-3">
        <Text className="text-3xl font-bold text-slate-400">
          {currency === 'USD' ? 'US$' : '$'}
        </Text>
        <TextInput
          value={display}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
