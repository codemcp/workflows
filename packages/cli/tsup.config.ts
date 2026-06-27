import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: false,
  clean: true,
  bundle: true,
  external: ['@modelcontextprotocol/sdk'],
  noExternal: [
    '@codemcp/workflows-core',
    '@codemcp/workflows-server',
    // js-yaml is imported at runtime in the chunk (via the .vibe/config.yaml
    // YAML parser). It is declared in this package's `dependencies` but NOT
    // in the published root package.json, so `npx` does not install it and
    // the wizard fails with `ERR_MODULE_NOT_FOUND: js-yaml`. Bundling it
    // into the chunk makes the wizard self-contained.
    'js-yaml',
  ],
  target: 'node20',
  sourcemap: false,
});
