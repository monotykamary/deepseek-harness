import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('coverage policy', () => {
  it('uses aggregate 80% thresholds without a custom per-file reporter', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8')

    expect(config).not.toContain('perFile: true')
    expect(config).not.toContain('coverage-uncovered-locations')
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      expect(config).toContain(`${metric}: 80`)
    }
  })

  it('contains no coverage suppression directives in owned executable code', () => {
    const files = [
      ...globSync('packages/**/*.{ts,tsx}', { cwd: root }),
      ...globSync('apps/**/*.{ts,tsx}', { cwd: root }),
      'vitest.shared.ts',
    ]
    const suppressed = files.filter(file => readFileSync(resolve(root, file), 'utf8').includes('v8 ignore'))

    expect(suppressed).toEqual([])
  })
})
