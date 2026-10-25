import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cspPlugin } from './config/security.js';

export default defineConfig({
  plugins: [react(), cspPlugin()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js', 'tests/**/*.test.jsx'],
  },
});
