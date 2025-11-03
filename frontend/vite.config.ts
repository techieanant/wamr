import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from project root
  // Vite will load .env.local for development automatically
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');

  // Get ports from environment with fallbacks
  const frontendPort = parseInt(env.VITE_PORT || '3000');
  const backendPort = parseInt(env.VITE_BACKEND_PORT || '4000');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Tell Vite to load .env files from project root
    envDir: path.resolve(__dirname, '..'),
    server: {
      port: frontendPort,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
        '/socket.io': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/tests/setup.ts',
    },
  };
});
