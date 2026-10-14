import { Stack } from 'expo-router';

import { BiometricGate } from '@/components/BiometricGate';
import { CaptureSync } from '@/components/CaptureSync';
import { PushSync } from '@/components/PushSync';
import { ReminderSync } from '@/components/ReminderSync';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  return (
    <BiometricGate>
      <ReminderSync />
      <CaptureSync />
      <PushSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="transactions/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transactions/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="commitments/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="commitments/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pending" options={{ presentation: 'modal' }} />
        <Stack.Screen name="capture/intro" options={{ presentation: 'modal' }} />
        <Stack.Screen name="capture/samples" options={{ presentation: 'modal' }} />
        <Stack.Screen name="email" options={{ presentation: 'modal' }} />
        <Stack.Screen name="bills/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="entries/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="receipts/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chats" options={{ presentation: 'modal' }} />
        <Stack.Screen name="budgets" options={{ presentation: 'modal' }} />
        <Stack.Screen name="stats" options={{ presentation: 'modal' }} />
      </Stack>
    </BiometricGate>
  );
}
