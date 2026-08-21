import { Context } from '@monotykamary/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@monotykamary/dsh-invariants'
import * as DistributionUpdateInvariant from '../src/invariant.ts'

describe('distribution-update invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(DistributionUpdateInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(DistributionUpdateInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
