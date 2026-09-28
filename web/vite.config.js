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
          const FONT_PLACEHOLDER = '__GOOGLE_FONTS_URL__';
          if (!html.includes(FONT_PLACEHOLDER)) {
            throw new Error(
              `index.html 中找不到 ${FONT_PLACEHOLDER} 佔位符，` +
              '請確認 index.html 的 <link> 標籤使用此佔位符',
            );
          }
          let result = html.replaceAll(FONT_PLACEHOLDER, GOOGLE_FONTS_URL);

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
            leaflet: ['leaflet', 'leaflet-heatmap-layer', 'react-leaflet'],
          },
        },
      },
    },
  };
});
