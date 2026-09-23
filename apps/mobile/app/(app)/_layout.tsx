import { Stack } from 'expo-router';

import { ReminderSync } from '@/components/ReminderSync';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  return (
    <>
      <ReminderSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="transactions/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transactions/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="commitments/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="commitments/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
