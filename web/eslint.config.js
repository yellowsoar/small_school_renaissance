import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
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
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...shared.rules,
      ...reactHooks.configs.recommended.rules,
      // Base no-unused-vars cannot see that <Foo /> uses `Foo`, so without this
      // every component import reads as dead. This marks JSX references as
      // usage, which is what lets varsIgnorePattern stay strict ('^_') instead
      // of blanket-excusing anything PascalCase.
      'react/jsx-uses-vars': 'error',
      // Unnecessary under the automatic JSX runtime.
      'react/jsx-uses-react': 'off',
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
