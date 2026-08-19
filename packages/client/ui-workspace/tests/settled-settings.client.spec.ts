import { Context } from '@monotykamary/cordis'
import { describe, expect, it, vi } from 'vitest'
import { settingsNamespace } from '@monotykamary/dsh-settings'
import { apply, Config, SHIPPED_WORKSPACE_SETTINGS } from '../src/index.ts'

describe('ui-workspace settled settings', () => {
  it('defaults to enabled at three days, accepts disable and bounds, and rejects invalid thresholds', () => {
    expect(Config({})).toEqual(SHIPPED_WORKSPACE_SETTINGS)
    expect(Config({ autoSettleInactive: false })).toEqual({
      autoSettleInactive: false, autoSettleAfterDays: 3,
    })
    expect(Config({ autoSettleAfterDays: 1 })).toEqual({ autoSettleInactive: true, autoSettleAfterDays: 1 })
    expect(Config({ autoSettleAfterDays: 90 })).toEqual({ autoSettleInactive: true, autoSettleAfterDays: 90 })
    for (const value of [0, 1.5, 91]) {
      expect(() => Config({ autoSettleAfterDays: value })).toThrow()
    }
  })

  it('registers the validated composition value as the settings base', async () => {
    const ctx = new Context()
    const dispose = vi.fn()
    const register = vi.fn(() => dispose)
    ctx.provide('settings', { register } as never)
    apply(ctx, Config({ autoSettleInactive: true, autoSettleAfterDays: 7 }))
    await vi.waitFor(() => {
      expect(register).toHaveBeenCalledWith(
        settingsNamespace('ui-workspace'),
        Config,
        { base: { autoSettleInactive: true, autoSettleAfterDays: 7 } },
      )
    })
  })
})
