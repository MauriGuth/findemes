import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transactions/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="transactions/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="commitments/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="commitments/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
