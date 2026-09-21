import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.expo/**',
  '**/src/generated/**',
  '**/*.config.js',
  '**/*.config.cjs',
  '**/*.config.mjs',
  '**/*.config.ts',
  '**/*.config.mts',
];

/**
 * Type-aware TypeScript preset shared by every package.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function base({ tsconfigRootDir }) {
  return defineConfig([
    { ignores },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
        globals: {
          ...globals.es2023,
          ...globals.node,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        // Escaped non-breaking spaces inside regexes are intentional (bank apps print them).
        'no-irregular-whitespace': ['error', { skipRegExps: true }],
      },
    },
    prettier,
  ]);
}
