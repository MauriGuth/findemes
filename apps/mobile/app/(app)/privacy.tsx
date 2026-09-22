import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { PrivacyText } from '@/components/PrivacyText';
import { Button, Screen, Title } from '@/components/ui';

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-6">
        <Title>Privacidad</Title>
        <PrivacyText />
        <Button label="Volver" onPress={() => router.back()} variant="secondary" />
      </ScrollView>
    </Screen>
  );
}
