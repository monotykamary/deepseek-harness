import { defineConfig } from 'tsdown'

/** Emit every public Host runtime entry owned by the Web bundle. */
export default defineConfig({
  entry: [
    'lib/types/index.js',
    'lib/types/invariant.js',
    'lib/types/startup.js',
    'lib/types/portless.js',
  ],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
