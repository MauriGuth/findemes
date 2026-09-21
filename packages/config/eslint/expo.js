import prettier from 'eslint-config-prettier';
import expoConfig from 'eslint-config-expo/flat.js';
import { defineConfig } from 'eslint/config';

import { ignores } from './base.js';

/**
 * Expo preset: the official eslint-config-expo flat config plus prettier.
 */
export function expo() {
  return defineConfig([
    { ignores: [...ignores, 'android/**', 'ios/**', 'expo-env.d.ts'] },
    ...expoConfig,
    {
      rules: {
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },
    prettier,
  ]);
}
