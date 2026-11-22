import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: true, port: 3000, strictPort: true },
  preview: { host: true, port: 3000, strictPort: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/mapbox-gl/')) return 'mapbox';
          if (/\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('/@supabase/')) return 'supabase';
        },
      },
    },
  },
});
