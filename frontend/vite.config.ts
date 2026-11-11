import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
