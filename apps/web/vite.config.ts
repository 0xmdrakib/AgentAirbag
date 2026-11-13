import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@airbag/core': r('../../packages/core/src/index.ts'),
      '@airbag/guard': r('../../packages/guard/src/index.ts'),
      '@airbag/agents': r('../../packages/agents/src/index.ts'),
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
