import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Pre-bundle the explicit wasm entry so CJS default interop works in dev.
    include: ['sql.js/dist/sql-wasm.js'],
  },
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    headers: {
      // Fix Cross-Origin-Opener-Policy issues with Firebase Auth
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    allowedHosts: true,
  },
  esbuild: {
    // Remove console statements ONLY in production builds
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  define: {
    // Globally define __DEV__ for conditional console logging
    __DEV__: process.env.NODE_ENV !== 'production',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          ui: ['lucide-react', 'framer-motion'],
          maps: ['@vis.gl/react-google-maps'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
