import { type ConfigContext, type ExpoConfig } from 'expo/config';

const APP_ID = 'ar.com.novasolutions.findemes';

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
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
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
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Filled by `eas init` (see README). Kept out of git on purpose until then.
    eas: {},
  },
});
