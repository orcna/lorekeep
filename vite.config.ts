import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    //EXE içindeki file:// protokolünün dosyaları bulmasını sağlar.
    base: './', 
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.OLLAMA_URL': JSON.stringify(env.VITE_OLLAMA_URL || 'http://localhost:11434'),
      'process.env.OLLAMA_MODEL': JSON.stringify(env.VITE_OLLAMA_MODEL || 'mistral'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});