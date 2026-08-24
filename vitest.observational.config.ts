import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

const pathsPlugin = (): ReturnType<typeof tsconfigPaths> => tsconfigPaths({ projects: ['./tsconfig.base.json'] })

export default defineConfig({
  plugins: [pathsPlugin(), standardDecoratorPlugin()],
  test: {
    name: 'observational',
    execArgv: vitestExecArgv,
    pool: 'forks',
    setupFiles: ['./scripts/test-invariants.ts'],
    include: [
      'packages/*/*/tests/**/*.observational.spec.{ts,tsx}',
      'apps/*/tests/**/*.observational.spec.ts',
      'scripts/**/*.observational.spec.ts',
    ],
  },
})
