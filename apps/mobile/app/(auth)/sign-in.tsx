import { EmailSchema } from '@findemes/shared';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, ErrorText, Muted, Screen, Subtitle, TextField, Title } from '@/components/ui';
import { ApiError, GENERIC_ERROR } from '@/lib/api';
import { requestLoginCode } from '@/lib/auth-api';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Ese mail no parece válido');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await requestLoginCode(parsed.data);
      router.push({ pathname: '/(auth)/code', params: { email: parsed.data } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : GENERIC_ERROR);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center gap-6"
      >
        <View className="gap-2">
          <Title>Entrá con tu mail</Title>
          <Subtitle>Te mandamos un código de 6 números. Sin contraseña.</Subtitle>
        </View>
        <TextField
          label="Tu mail"
          value={email}
          onChangeText={setEmail}
          placeholder="vos@ejemplo.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          autoFocus
        />
        <ErrorText>{error}</ErrorText>
        <Button label="Mandame el código" onPress={() => void submit()} loading={sending} />
        <Muted>Solo usamos tu mail para entrar.</Muted>
        <Link href="/(auth)/privacy" asChild>
          <Text className="text-sm text-slate-400 underline">
            Al continuar aceptás la política de privacidad
          </Text>
        </Link>
      </KeyboardAvoidingView>
    </Screen>
  );
}
