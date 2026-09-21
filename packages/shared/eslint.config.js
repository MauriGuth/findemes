import { base } from '@findemes/config/eslint/base';

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  {
    // This package runs on the backend today and on-device tomorrow: no Node, no React Native.
    files: ['src/**/*.ts'],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'crypto', 'child_process'],
              message: 'shared must stay runtime-agnostic (no Node built-ins).',
            },
            {
              group: ['react-native', 'react-native/*', 'expo*'],
              message: 'shared must stay runtime-agnostic (no React Native).',
            },
          ],
        },
      ],
    },
  },
];
