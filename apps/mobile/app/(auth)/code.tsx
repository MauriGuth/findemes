import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Button, ErrorText, Muted, Screen, Subtitle, Title } from '@/components/ui';
import { ApiError, GENERIC_ERROR } from '@/lib/api';
import { currentDeviceInfo, requestLoginCode, verifyLoginCode } from '@/lib/auth-api';
import { useSession } from '@/lib/session';

const RESEND_COOLDOWN_SECONDS = 60;

export default function CodeScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const signIn = useSession((s) => s.signIn);
  const deviceId = useSession((s) => s.deviceId);
  const input = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async (value: string) => {
    if (!email || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const session = await verifyLoginCode(email, value, currentDeviceInfo(deviceId));
      await signIn(session);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : GENERIC_ERROR);
      setCode('');
      input.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const onChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  };

  const resend = async () => {
    if (!email || cooldown > 0) return;
    setError(null);
    try {
      await requestLoginCode(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : GENERIC_ERROR);
    }
  };

  const cells = Array.from({ length: 6 }, (_, i) => code[i] ?? '');

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center gap-6"
      >
        <View className="gap-2">
          <Title>Revisá tu mail</Title>
          <Subtitle>Te mandamos un código a {email}</Subtitle>
        </View>

        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Código de 6 números">
          <View className="flex-row justify-between">
            {cells.map((digit, i) => (
              <View
                key={i}
                className={`h-14 w-12 items-center justify-center rounded-xl bg-white/10 ${i === code.length ? 'border border-accent' : ''}`}
              >
                <Text className="text-2xl font-bold text-white">{digit}</Text>
              </View>
            ))}
          </View>
          <TextInput
            ref={input}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            className="absolute h-0 w-0 opacity-0"
          />
        </Pressable>

        <ErrorText>{error}</ErrorText>
        <Button
          label="Entrar"
          onPress={() => void verify(code)}
          loading={verifying}
          disabled={code.length < 6}
        />
        <Button
          label={cooldown > 0 ? `Reenviar código (${String(cooldown)})` : 'Reenviar código'}
          onPress={() => void resend()}
          variant="ghost"
          disabled={cooldown > 0}
        />
        <Button label="Cambiar mail" onPress={() => router.back()} variant="ghost" />
        <Muted>El código vence en 10 minutos.</Muted>
      </KeyboardAvoidingView>
    </Screen>
  );
}
