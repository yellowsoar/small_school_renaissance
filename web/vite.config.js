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
          let result = html.replaceAll('__GOOGLE_FONTS_URL__', GOOGLE_FONTS_URL);

          // Vite dev server injects <style> elements for CSS HMR (Hot Module
          // Replacement). The production CSP blocks inline <style> elements
          // via style-src-elem. Relax this during development by adding
          // 'unsafe-inline' to style-src-elem so HMR works correctly (#277).
          if (command === 'serve') {
            result = result.replace(
              "style-src-elem 'self'",
              "style-src-elem 'self' 'unsafe-inline'",
            );
          }

          return result;
        },
      },
    ],
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            leaflet: ['leaflet', '@linkurious/leaflet-heat', 'react-leaflet'],
          },
        },
      },
    },
  };
});
