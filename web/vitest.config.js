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
      // markerIcons only wires shapes.js into Leaflet, which needs a DOM.
      // Its geometry is covered by shapes.test.js.
      exclude: ['src/lib/markerIcons.js'],
      reporter: ['text', 'html'],
    },
  },
});
