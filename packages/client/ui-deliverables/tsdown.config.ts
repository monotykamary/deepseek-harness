import type { UserConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

const ledgerBundle = {
  name: '@monotykamary/dsh-client-ui-deliverables/ledger',
  entry: ['lib/types/ledger.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} satisfies UserConfig

export default clientBundle(
  '@monotykamary/dsh-client-ui-deliverables',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { companions: [ledgerBundle] },
)
