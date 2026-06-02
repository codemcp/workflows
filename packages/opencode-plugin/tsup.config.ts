import { defineConfig } from 'tsup';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  esbuildOptions(options) {
    // Resolve @codemcp/workflows-server from its source entry point so that
    // esbuild can deduplicate @codemcp/workflows-core across both the server
    // and the direct imports in this package. Without this, the pre-built
    // dist/index.js of @codemcp/workflows-server already contains an inlined
    // copy of @codemcp/workflows-core, and esbuild bundles a second copy for
    // the direct imports here — resulting in two separate logSinkInstance
    // globals that prevent the OpenCode log sink from being shared.
    options.alias = {
      ...options.alias,
      '@codemcp/workflows-server': path.resolve(
        __dirname,
        '../mcp-server/src/index.ts'
      ),
    };
  },
});
