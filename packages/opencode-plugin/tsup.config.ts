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
  // Bundle core, server, and effect — not guaranteed to be available in standalone plugin installs
  noExternal: [
    '@codemcp/workflows-core',
    '@codemcp/workflows-server',
    'effect',
  ],
  target: 'node20',
  sourcemap: false,
});
