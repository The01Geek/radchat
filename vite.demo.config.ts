/**
 * Demo app: a fake host page with the widget mounted on a mock data source.
 * `npm run demo` serves it; `npm run build:demo` writes demo-dist/.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'demo'),
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: resolve(__dirname, 'demo-dist'),
    emptyOutDir: true,
    // Plotly is loaded lazily in its own chunk the first time a chart appears.
    chunkSizeWarningLimit: 1500,
  },
});
