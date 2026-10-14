import { type ConfigContext, type ExpoConfig } from 'expo/config';

const APP_ID = 'ar.com.novasolutions.findemes';

/**
 * Firebase config for push on Android (ADR 015): the path in GOOGLE_SERVICES_JSON, an EAS
 * "file" environment variable. Without it the build works and push stays off.
 */
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Findemes',
  slug: 'findemes',
  scheme: 'findemes',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
    // Only standard HTTPS: no export-compliance paperwork for TestFlight (ADR 016).
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSFaceIDUsageDescription: 'Findemes usa Face ID para desbloquear la app si lo activás.',
    },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: '#0F172A',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    // Ticket photos (ADR 014): camera and gallery, never the microphone.
    [
      'expo-image-picker',
      {
        photosPermission: 'Findemes usa tus fotos solo para leer los tickets que elegís.',
        cameraPermission: 'Findemes usa la cámara para sacarle foto a tus tickets.',
        microphonePermission: false,
      },
    ],
    // Local notifications only. No defaultChannel here: that option is for FCM push.
    ['expo-notifications', { icon: './assets/android-icon-monochrome.png', color: '#22C55E' }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#0F172A',
      },
    ],
    [
      'expo-build-properties',
      {
        android: { usesCleartextTraffic: false },
      },
    ],
  ],
  // OTA updates (ADR 012): JS changes reach installed builds without a rebuild. The
  // fingerprint policy only delivers an update to builds with the same native code.
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/116b28aa-b3d8-4d21-a3dd-bfa722d8de1f',
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: { projectId: '116b28aa-b3d8-4d21-a3dd-bfa722d8de1f' },
  },
});
