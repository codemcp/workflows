import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['../../test/setup.ts'],
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    typecheck: {
      tsconfig: './tsconfig.build.json',
    },
    env: {
      LOG_LEVEL: 'ERROR',
      NODE_ENV: 'test',
      VITEST: 'true',
    },
  },
});
