import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Emit into the package-root `dist/ui` so the server's static route
    // and the published tarball both find it in one place.
    outDir: fileURLToPath(new URL('../dist/ui', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Group chunks under /assets so the static route's cache rules can
        // target them specifically later.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // During `npm --workspace @june1815/ui run dev`, proxy API calls to a
      // running `june1815 gogogo` so the UI dev server doesn't need the
      // bearer token in the address bar.
      '/v1': 'http://127.0.0.1:7150',
      '/healthz': 'http://127.0.0.1:7150',
    },
  },
});
