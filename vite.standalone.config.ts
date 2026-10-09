/**
 * Standalone build: one UMD script (React included) for pages that are not
 * React apps. Exposes `window.RadChat` with `mount`, `createMockDataSource`
 * and `createFetchDataSource`. Load dist/standalone/radchat.css alongside it.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/standalone',
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/standalone.ts'),
      name: 'RadChat',
      formats: ['umd'],
      fileName: () => 'radchat.umd.js',
      cssFileName: 'radchat',
    },
  },
});
