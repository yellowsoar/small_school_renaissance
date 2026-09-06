import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const shared = {
  languageOptions: {
    ecmaVersion: 2023,
    parserOptions: {
      ecmaFeatures: { jsx: true },
      sourceType: 'module',
    },
  },
  rules: {
    ...js.configs.recommended.rules,
    // '^[A-Z_]' would have excused every unused component import, which in a
    // codebase of PascalCase components is where the rule earns its keep.
    'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
  },
};

export default [
  { ignores: ['coverage', 'dist', 'public/data'] },

  // Browser code. Node globals are deliberately absent here so a stray
  // `process.env` in the app fails lint instead of failing at runtime.
  {
    ...shared,
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { ...shared.languageOptions, globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...shared.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Build tooling and scripts run in Node.
  {
    ...shared,
    files: ['*.config.js', 'scripts/**/*.js'],
    languageOptions: { ...shared.languageOptions, globals: globals.node },
  },
];
