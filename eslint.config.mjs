import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['.migration/**', '**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  { files: ['**/*.{ts,tsx}'], rules: { 'no-undef': 'off' } },
  // Preserve the source's existing allowances only for the imported UI. New infrastructure stays strict.
  { files: ['apps/web/src/components/**/*', 'apps/web/src/content/**/*', 'apps/web/src/hooks/**/*', 'apps/web/src/lib/**/*'], rules: { '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-non-null-assertion': 'off', '@typescript-eslint/ban-ts-comment': 'off', 'no-empty': 'off' } },
);
