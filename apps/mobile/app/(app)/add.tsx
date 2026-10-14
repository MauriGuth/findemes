import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Muted, Screen, Title } from '@/components/ui';
import { errorMessage, useFeatures } from '@/lib/hooks';
import { pickPhoto, type PhotoSource, uploadReceipt } from '@/lib/receipts';

function Option({
  icon,
  title,
  detail,
  onPress,
  disabled,
}: {
  icon: string;
  title: string;
  detail: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center gap-4 rounded-2xl bg-white/5 p-4 ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className="text-3xl">{icon}</Text>
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-white">{title}</Text>
        <Muted>{detail}</Muted>
      </View>
    </Pressable>
  );
}

/** "+" on Inicio: by hand, by writing it, or with a photo of the ticket (ADR 014). */
export default function AddScreen() {
  const router = useRouter();
  const features = useFeatures();
  const [uploading, setUploading] = useState(false);
  const receipts = features.data?.receipts ?? false;
  const ai = features.data?.aiEntries ?? false;

  const photo = async (source: PhotoSource) => {
    try {
      const asset = await pickPhoto(source);
      if (!asset) return;
      setUploading(true);
      const receipt = await uploadReceipt(asset);
      router.replace({ pathname: '/(app)/receipts/[id]', params: { id: receipt.id } });
    } catch (error) {
      Alert.alert('No se pudo subir el ticket', errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen>
      <View className="flex-row items-center justify-between py-2">
        <Title>Cargar</Title>
        <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
      </View>
      <View className="gap-3 py-4">
        <Option
          icon="✍️"
          title="Contalo con tus palabras"
          detail={
            ai
              ? '“Gasté 8 lucas en el kiosco y 20 en el taxi”. También podés dictarlo con el micrófono del teclado.'
              : 'Todavía no está disponible.'
          }
          disabled={!ai}
          onPress={() => router.replace('/(app)/entries/new')}
        />
        <Option
          icon="📸"
          title="Sacale foto al ticket"
          detail={
            receipts
              ? 'Leemos el total y lo que compraste, y lo juntamos con el pago si ya lo tenemos.'
              : 'Todavía no está disponible.'
          }
          disabled={!receipts || uploading}
          onPress={() => void photo('camera')}
        />
        {receipts ? (
          <Button
            label="Elegir una foto de la galería"
            variant="ghost"
            disabled={uploading}
            onPress={() => void photo('library')}
          />
        ) : null}
        <Option
          icon="⌨️"
          title="A mano"
          detail="Monto, medio de pago y dónde fue."
          onPress={() => router.replace('/(app)/transactions/new')}
        />
        {uploading ? <Muted>Subiendo la foto…</Muted> : null}
      </View>
    </Screen>
  );
}
