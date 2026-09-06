import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // The '' prefix loads unprefixed vars from .env (see .env.example).
  // A real environment variable always wins over the file.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

  // GitHub Pages serves yellowsoar/small_school_renaissance under /<repo-name>/.
  // Set BASE_PATH=/ for a custom domain or a differently named fork.
  const base = env.BASE_PATH || '/small_school_renaissance/';

  return {
    base: command === 'build' ? base : '/',
    plugins: [react()],
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
