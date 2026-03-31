import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: {
    compilerOptions: {
      incremental: false, // Override base tsconfig to avoid conflict with DTS generation
    },
  },
  clean: true,
  bundle: true,
  // SDK and zod are peer/external deps
  external: ['@modelcontextprotocol/sdk', 'zod'],
  // Bundle core into the output (it's private, not published)
  noExternal: ['@codemcp/workflows-core'],
  target: 'node20',
  sourcemap: false,
});
