import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <SafeAreaView className={`flex-1 bg-ink px-6 ${className}`}>{children}</SafeAreaView>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text className="text-3xl font-bold tracking-tight text-white">{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text className="text-base text-slate-300">{children}</Text>;
}

export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Text className={`text-sm text-slate-500 ${className}`}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text className="text-sm text-danger">{children}</Text>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`gap-2 rounded-2xl bg-white/5 p-4 ${className}`}>{children}</View>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  className = '',
}: ButtonProps) {
  const base = 'items-center justify-center rounded-xl px-4 py-3';
  const styles: Record<NonNullable<ButtonProps['variant']>, { box: string; text: string }> = {
    primary: { box: 'bg-accent', text: 'text-ink font-semibold' },
    secondary: { box: 'bg-white/10', text: 'text-white font-semibold' },
    danger: { box: 'bg-danger/20', text: 'text-danger font-semibold' },
    ghost: { box: '', text: 'text-slate-300' },
  };
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${styles[variant].box} ${isDisabled ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color="#0F172A" />
      ) : (
        <Text className={`text-base ${styles[variant].text}`}>{label}</Text>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, className = '', ...props }: FieldProps) {
  return (
    <View className="gap-1">
      {label ? <Text className="text-sm text-slate-400">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#64748B"
        className={`rounded-xl bg-white/10 px-4 py-3 text-base text-white ${error ? 'border border-danger' : ''} ${className}`}
        {...props}
      />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'success' | 'warn' | 'danger';
}

export function Chip({ label, selected, onPress, tone = 'default' }: ChipProps) {
  const tones: Record<NonNullable<ChipProps['tone']>, string> = {
    default: selected ? 'bg-accent' : 'bg-white/10',
    success: 'bg-accent/20',
    warn: 'bg-warn/20',
    danger: 'bg-danger/20',
  };
  const text: Record<NonNullable<ChipProps['tone']>, string> = {
    default: selected ? 'text-ink font-semibold' : 'text-slate-200',
    success: 'text-accent',
    warn: 'text-warn',
    danger: 'text-danger',
  };
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      disabled={!onPress}
      className={`rounded-full px-3 py-1.5 ${tones[tone]}`}
    >
      <Text className={`text-sm ${text[tone]}`}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`flex-row flex-wrap items-center gap-2 ${className}`}>{children}</View>;
}
