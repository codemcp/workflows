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
  // Zod is external (it's a true peer dependency)
  external: ['zod'],
  // Bundle core and server packages (they're private, not published)
  noExternal: ['@codemcp/workflows-core', '@codemcp/workflows-server'],
  target: 'node20',
  sourcemap: false,
});
