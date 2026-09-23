import { maskNotificationText, notificationText } from '@findemes/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { Button, Card, Muted, Row, Screen, Title } from '@/components/ui';
import { Capture } from '@/lib/capture';

interface Draft {
  packageName: string;
  postedAt: string;
  text: string;
}

function load(): Draft[] {
  return Capture.getCapturedSamples().map((s) => ({
    packageName: s.packageName,
    postedAt: s.postedAt,
    text: maskNotificationText(notificationText(s)),
  }));
}

/**
 * Dev-only: the notifications captured in capture mode, masked, editable, and shared by
 * hand so they can become fixtures. Nothing here is uploaded.
 */
export default function CaptureSamplesScreen() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(load);

  const share = () => {
    const body = drafts.map((d) => `### ${d.packageName} · ${d.postedAt}\n${d.text}`).join('\n\n');
    void Share.share({ message: body });
  };

  const clear = () =>
    Alert.alert('Borrar muestras', 'Se borran del teléfono.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          Capture.clearCapturedSamples();
          setDrafts([]);
        },
      },
    ]);

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-6 pb-16">
        <Title>Muestras</Title>
        <Muted>
          Ya ocultamos CBU, alias, DNI y nombres que reconocimos. Revisá cada una y corregí lo que
          falte antes de compartir: montos y comercios pueden quedar; nombres de personas, CBU,
          alias y números de cuenta, nunca.
        </Muted>
        {drafts.length === 0 ? (
          <Muted>
            No hay muestras. Prendé el modo captura en Ajustes y esperá notificaciones de tus apps.
          </Muted>
        ) : null}
        {drafts.map((draft, index) => (
          <Card key={`${draft.postedAt}-${String(index)}`}>
            <Muted>
              {draft.packageName} · {draft.postedAt.slice(0, 16).replace('T', ' ')}
            </Muted>
            <TextInput
              multiline
              value={draft.text}
              onChangeText={(text) =>
                setDrafts((all) => all.map((d, i) => (i === index ? { ...d, text } : d)))
              }
              className="rounded-xl bg-white/10 px-3 py-2 text-base text-white"
            />
            <Button
              label="Quitar esta"
              variant="ghost"
              onPress={() => setDrafts((all) => all.filter((_, i) => i !== index))}
            />
          </Card>
        ))}
        <Row>
          <Button label="Compartir" onPress={share} disabled={drafts.length === 0} />
          <Button label="Borrar todo" variant="danger" onPress={clear} />
          <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
        </Row>
        <View />
        <Text className="text-xs text-slate-600">Solo en desarrollo.</Text>
      </ScrollView>
    </Screen>
  );
}
