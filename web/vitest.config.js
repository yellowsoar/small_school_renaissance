import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.js: the tests target pure modules and do not
// need the React plugin or the GitHub Pages base path.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      reporter: ['text', 'html'],
    },
  },
});
