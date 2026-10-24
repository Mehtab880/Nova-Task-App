import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';
import tseslint from 'typescript-eslint';

import nova from './tools/eslint-rules/index.mjs';

const nodeGlobals = {
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  module: 'writable',
  process: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

const reactNativeGlobals = {
  __DEV__: 'readonly',
  HermesInternal: 'readonly',
  console: 'readonly',
  global: 'readonly',
  process: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
};

const jestGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  jest: 'readonly',
  test: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/android/**',
      '**/build/**',
      '**/coverage/**',
      '**/.husky/**',
      'docs/**',
      '**/*.md',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...nodeGlobals, ...reactNativeGlobals },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-native': reactNative,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'error',

      'react-native/no-unused-styles': 'error',
      'react-native/no-color-literals': 'error',
      'react-native/no-inline-styles': 'off',

      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-undef': 'off',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: nodeGlobals,
      parserOptions: {
        project: false,
        projectService: false,
        program: null,
      },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    plugins: { nova },
    rules: {
      'nova/no-hardcoded-colors': 'error',
      'nova/no-literal-jsx-text': 'error',
    },
  },
  {
    files: ['apps/mobile/src/**/*.test.{ts,tsx}', 'packages/shared/**/*.test.ts'],
    languageOptions: {
      globals: jestGlobals,
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react-native', 'react-native-*', '@react-native/*'],
              message: '@nova/shared must not depend on React, React Native, or UI code.',
            },
            {
              group: ['@/*', '../../../apps/*'],
              message: '@nova/shared must remain independent of the mobile app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/jest.setup.ts'],
    languageOptions: {
      globals: jestGlobals,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier,
);
