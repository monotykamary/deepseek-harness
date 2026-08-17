import { describe, expect, it } from 'vitest'
import { Context } from '@monotykamary/cordis'
import * as SidebarInvariant from '@monotykamary/dsh-client-ui-sidebar/invariant'
import InvariantRegistry from '@monotykamary/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(SidebarInvariant).await()).resolves.toBeDefined()
  })

  it('node-half apply is a no-op host placeholder', async () => {
    const { apply } = await import('@monotykamary/dsh-client-ui-sidebar')
    apply()
    expect(true).toBe(true) // reaching here without throw is the contract
  })
})
