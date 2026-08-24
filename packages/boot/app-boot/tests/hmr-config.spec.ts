import { mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootHmr } from './hmr-config-harness.ts'

describe('HMR exact config paths', () => {
  it('collapses filesystem aliases before registering an exact watch', async () => {
    const target = mkdtempSync(join(tmpdir(), 'dsh-hmr-canonical-'))
    const alias = `${target}-alias`
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const ctx = await bootHmr(alias)
    try {
      await ctx.hmr.registerConfig('plugins.yml', () => {})
      await expect(ctx.hmr.registerConfig(join(await realpath(target), 'plugins.yml'), () => {}))
        .rejects.toThrow('config path already registered')
    } finally {
      await ctx.fiber.dispose()
      unlinkSync(alias)
      rmSync(target, { recursive: true, force: true })
    }
  })
})
