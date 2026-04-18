import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port in dev mode
  server: {
    port: 5173,
    strictPort: true,
  },
  // Env variables starting with TAURI_ are passed to the frontend
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    // Tauri uses ES modules — use a modern target
    target: ['es2021', 'chrome109', 'safari13'],
    // Don't minify for easier debugging in dev
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for Tauri debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
