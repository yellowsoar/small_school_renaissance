import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GOOGLE_FONTS_URL } from './src/config/fonts.js';

export default defineConfig(({ command, mode }) => {
  // Only load BASE_* vars from .env — avoid pulling in every variable,
  // which would bypass Vite's VITE_ security boundary and risk leaking
  // secrets added to .env in the future (see #4).
  const env = { ...loadEnv(mode, process.cwd(), 'BASE_'), ...process.env };

  // GitHub Pages serves yellowsoar/small_school_renaissance under /<repo-name>/.
  // Set BASE_PATH=/ for a custom domain or a differently named fork.
  const base = env.BASE_PATH || '/small_school_renaissance/';

  return {
    base: command === 'build' ? base : '/',
    plugins: [
      react(),
      {
        name: 'inject-google-fonts-url',
        transformIndexHtml(html) {
          return html.replaceAll('__GOOGLE_FONTS_URL__', GOOGLE_FONTS_URL);
        },
      },
    ],
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            leaflet: ['leaflet', 'leaflet.heat', 'react-leaflet'],
          },
        },
      },
    },
  };
});
