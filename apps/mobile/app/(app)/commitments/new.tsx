import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { CommitmentForm } from '@/components/CommitmentForm';
import { Button, Screen, Title } from '@/components/ui';

export default function NewCommitmentScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View className="flex-row items-center justify-between py-2">
        <Title>Nuevo compromiso</Title>
        <Button label="Cerrar" variant="ghost" onPress={() => router.back()} />
      </View>
      <CommitmentForm />
    </Screen>
  );
}
