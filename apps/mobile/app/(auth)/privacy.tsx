import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Button, Screen, Title } from '@/components/ui';

const PARAGRAPHS = [
  'Findemes guarda los movimientos, compromisos y planes que cargás para calcular cuánto te queda hasta el 1. Nada más.',
  'Tu mail se usa solamente para entrar (te mandamos un código) y para avisarte cosas de tu cuenta. No lo compartimos ni lo usamos para publicidad.',
  'Los mails de acceso salen por Resend, un proveedor de envío de correo que guarda el mensaje hasta 30 días en servidores fuera de Argentina.',
  'Podés borrar tu cuenta desde Ajustes. Se eliminan todos tus datos en el momento y no se puede deshacer.',
  'Tenés derecho a acceder, corregir y suprimir tus datos personales (Ley 25.326). Escribinos y lo resolvemos.',
];

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-6">
        <Title>Privacidad</Title>
        <View className="gap-3">
          {PARAGRAPHS.map((text) => (
            <Text key={text} className="text-base leading-6 text-slate-300">
              {text}
            </Text>
          ))}
        </View>
        <Button label="Volver" onPress={() => router.back()} variant="secondary" />
      </ScrollView>
    </Screen>
  );
}
