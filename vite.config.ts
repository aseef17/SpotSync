import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
