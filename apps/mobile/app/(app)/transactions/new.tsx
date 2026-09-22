import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { TransactionForm } from '@/components/TransactionForm';
import { Button, Screen, Title } from '@/components/ui';

export default function NewTransactionScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View className="flex-row items-center justify-between py-2">
        <Title>Cargar</Title>
        <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
      </View>
      <TransactionForm />
    </Screen>
  );
}
