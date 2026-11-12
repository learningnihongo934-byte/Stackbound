import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
  worker: { format: 'es' },
  server: { port: 8820, proxy: { '/api': { target: 'http://localhost:8787', ws: true, changeOrigin: true } } },
});
