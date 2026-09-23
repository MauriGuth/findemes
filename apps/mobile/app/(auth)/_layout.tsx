import { Stack } from 'expo-router';

/** No `index` in this group: without this, expo-router would open the alphabetically first route (`code`). */
export const unstable_settings = { initialRouteName: 'sign-in' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' } }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="code" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
