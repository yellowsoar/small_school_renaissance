import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Includes the React plugin and happy-dom so that Hook and Component tests
// can use renderHook / render with a simulated DOM.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    // Explicit setup replaces globals: true — auto-cleanup without polluting
    // the global namespace.  Every test file keeps its own vitest imports.
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.js'],
    // Build-time scripts stay in Node where process and fs are native.
    environmentMatchGlobs: [['scripts/**', 'node']],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // markerIcons only wires shapes.js into Leaflet, which needs a DOM.
      // Its geometry is covered by shapes.test.js.
      // main.jsx is the ReactDOM entry point (3-line boilerplate) that
      // cannot be meaningfully unit-tested in Vitest.
      exclude: ['src/lib/markerIcons.js', 'src/main.jsx', 'src/**/*.test.{js,jsx}'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
