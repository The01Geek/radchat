/**
 * Library build: ES module for React hosts.
 *
 * React, ReactDOM and every runtime dependency stay external so the host's
 * bundler deduplicates them. CSS (including react-chatbot-kit's base styles)
 * is extracted into dist/radchat.css.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';
import pkg from './package.json' with { type: 'json' };

const externalPackages = [
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.dependencies ?? {}),
];

const isExternal = (id: string) =>
  !id.endsWith('.css') &&
  externalPackages.some((name) => id === name || id.startsWith(`${name}/`));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'radchat.js',
      cssFileName: 'radchat',
    },
    rollupOptions: {
      external: isExternal,
    },
  },
});
