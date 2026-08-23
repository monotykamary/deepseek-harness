import { defineConfig } from 'tsdown'

/** Build the plugin, pure ledger, and invariant companion as independent bundles. */
export default defineConfig([
  {
    entry: ['lib/types/index.js', 'lib/types/ledger.js', 'lib/types/invariant.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
