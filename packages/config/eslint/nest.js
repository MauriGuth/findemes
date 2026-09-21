import { defineConfig } from 'eslint/config';

import { base } from './base.js';

/**
 * NestJS preset: base rules plus the relaxations decorators and DI need.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function nest({ tsconfigRootDir }) {
  return defineConfig([
    ...base({ tsconfigRootDir }),
    {
      rules: {
        // Nest modules are empty classes decorated with @Module().
        '@typescript-eslint/no-extraneous-class': 'off',
        // Controllers are registered by reference, never instantiated by hand.
        '@typescript-eslint/no-unsafe-call': 'off',
      },
    },
    {
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
      rules: {
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
  ]);
}
