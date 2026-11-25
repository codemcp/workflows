import { defineConfig } from 'vitest/config';

// Opt-in container E2E (needs `container` or `docker`): pnpm test:e2e:container
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/e2e-container/**/*.spec.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
