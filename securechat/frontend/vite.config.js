import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://backend:3001', changeOrigin: true },
      '/ws': { target: 'ws://backend:3001', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
