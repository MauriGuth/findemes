import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, Share, Text, View } from 'react-native';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { errorMessage, useChats, useUnlinkChat } from '@/lib/hooks';

/** Link Telegram or WhatsApp to send tickets and expenses by chat (ADR 014). */
export default function ChatsScreen() {
  const router = useRouter();
  const chats = useChats();
  const unlink = useUnlinkChat();
  const data = chats.data;

  const confirmUnlink = (channel: 'TELEGRAM' | 'WHATSAPP', name: string) =>
    Alert.alert(`Desvincular ${name}`, 'Ese chat deja de cargar movimientos en tu cuenta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular',
        style: 'destructive',
        onPress: () =>
          unlink.mutate(channel, {
            onError: (e) => Alert.alert('No se pudo', errorMessage(e)),
          }),
      },
    ]);

  const none = data && !data.telegram.available && !data.whatsapp.available;
  const whatsappUrl =
    data?.whatsapp.number && data.whatsapp.message
      ? `https://wa.me/${data.whatsapp.number.replace(/\D/g, '')}?text=${encodeURIComponent(data.whatsapp.message)}`
      : null;

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 py-6 pb-16">
        <View className="flex-row items-center justify-between">
          <Title>Chats</Title>
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </View>
        <Muted>
          Mandale a Findemes una foto del ticket o escribile lo que gastaste (“8 lucas en el
          kiosco”) y se carga solo. Solo leemos lo que vos le mandás a ese chat.
        </Muted>

        {chats.isPending ? <Muted>Cargando…</Muted> : null}
        {chats.isError ? <Muted>{errorMessage(chats.error)}</Muted> : null}
        {none ? (
          <Card>
            <Muted>Todavía no está disponible. Te avisamos cuando lo activemos.</Muted>
          </Card>
        ) : null}

        {data?.telegram.available ? (
          <Card>
            <Text className="text-base font-semibold text-white">Telegram</Text>
            {data.telegram.linked ? (
              <>
                <Muted>Vinculado. Escribile al bot cuando quieras.</Muted>
                <Button
                  label="Desvincular"
                  variant="ghost"
                  onPress={() => confirmUnlink('TELEGRAM', 'Telegram')}
                />
              </>
            ) : (
              <>
                <Muted>Abrí el bot y tocá “Iniciar”: queda vinculado solo.</Muted>
                <Button
                  label="Abrir Telegram"
                  onPress={() => void Linking.openURL(data.telegram.url ?? '')}
                  disabled={!data.telegram.url}
                />
              </>
            )}
          </Card>
        ) : null}

        {data?.whatsapp.available ? (
          <Card>
            <Text className="text-base font-semibold text-white">WhatsApp</Text>
            {data.whatsapp.linked ? (
              <>
                <Muted>Vinculado. Escribile a {data.whatsapp.number} cuando quieras.</Muted>
                <Button
                  label="Desvincular"
                  variant="ghost"
                  onPress={() => confirmUnlink('WHATSAPP', 'WhatsApp')}
                />
              </>
            ) : (
              <>
                <Muted>Mandá este mensaje a {data.whatsapp.number} desde tu WhatsApp:</Muted>
                <Text selectable className="text-xl font-bold tracking-widest text-white">
                  {data.whatsapp.message}
                </Text>
                <Button
                  label="Abrir WhatsApp"
                  onPress={() => void Linking.openURL(whatsappUrl ?? '')}
                  disabled={!whatsappUrl}
                />
                <Button
                  label="Compartir el mensaje"
                  variant="ghost"
                  onPress={() => void Share.share({ message: data.whatsapp.message ?? '' })}
                />
              </>
            )}
          </Card>
        ) : null}

        <Muted>
          El código vence a los 30 minutos y sirve una sola vez. Las fotos y los textos los lee
          Claude, la IA de Anthropic. Por ahora no escuchamos audios.
        </Muted>
      </ScrollView>
    </Screen>
  );
}
