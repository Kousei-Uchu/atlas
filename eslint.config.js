import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]' }],
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Render user text as text only (I-08).' },
      ],
    },
  },
  {
    // Playwright fixtures use a callback named `use`, which is not a React hook.
    files: ['tests/e2e/**/*.js'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    // The domain layer is plain JS: no React, no browser storage (spec 4.3).
    files: ['src/domain/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', 'idb', '../storage/*', '../features/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB'],
    },
  },
];
