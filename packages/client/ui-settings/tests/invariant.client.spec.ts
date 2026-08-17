import { describe, expect, it } from 'vitest'
import { Context } from '@monotykamary/cordis'
import * as SettingsInvariant from '@monotykamary/dsh-client-ui-settings/invariant'
import InvariantRegistry from '@monotykamary/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(SettingsInvariant).await()).resolves.toBeDefined()
  })

  it('node-half apply is a no-op host placeholder', async () => {
    const { apply } = await import('@monotykamary/dsh-client-ui-settings')
    apply()
    expect(true).toBe(true) // reaching here without throw is the contract
  })
})
