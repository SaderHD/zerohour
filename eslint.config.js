import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**', '**/*.cjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', require: 'readonly', __dirname: 'readonly', fetch: 'readonly', setTimeout: 'readonly', window: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
