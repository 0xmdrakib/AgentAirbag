import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@airbag/core': r('./packages/core/src/index.ts'),
      '@airbag/guard': r('./packages/guard/src/index.ts'),
      '@airbag/agents': r('./packages/agents/src/index.ts'),
      '@airbag/server': r('./packages/server/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30_000,
  },
});
