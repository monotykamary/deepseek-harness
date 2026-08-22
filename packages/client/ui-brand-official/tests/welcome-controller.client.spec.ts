// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { SettingsScopeSnapshot } from '@monotykamary/dsh-client-runtime/client'
import { WelcomeController } from '../src/client/welcome-controller.ts'

interface WelcomeSettings {
  welcomeNoticeVersion?: string
}

function scope(status: 'ready' | 'unavailable', version?: string) {
  let snapshot: SettingsScopeSnapshot<WelcomeSettings> = {
    status,
    value: version === undefined ? {} : { welcomeNoticeVersion: version },
    base: undefined,
    user: undefined,
    revision: status === 'ready' ? 0 : undefined,
    writable: status === 'ready',
    mode: status === 'ready' ? 'host' : 'memory',
  }
  const set = vi.fn(async (_field: string, value: unknown) => {
    snapshot = { ...snapshot, value: { welcomeNoticeVersion: String(value) }, revision: 1 }
  })
  return {
    getSnapshot: () => snapshot,
    subscribe: vi.fn(() => () => {}),
    set,
    unset: vi.fn(async () => {}),
  }
}

describe('WelcomeController', () => {
  it('persists and recognizes only the current welcome version on eligible settings transport', async () => {
    const current = new WelcomeController(scope('ready', '2026-08-22.1'))
    await expect(current.acknowledged()).resolves.toBe(true)

    const stale = scope('ready', '2026-08-11.1')
    const controller = new WelcomeController(stale)
    await expect(controller.acknowledged()).resolves.toBe(false)
    await controller.acknowledge()
    expect(stale.set).toHaveBeenCalledWith('welcomeNoticeVersion', '2026-08-22.1')
    await expect(controller.acknowledged()).resolves.toBe(true)
  })

  it('keeps acknowledgement process-local when settings transport is unavailable', async () => {
    const unavailable = scope('unavailable')
    const controller = new WelcomeController(unavailable)
    await expect(controller.acknowledged()).resolves.toBe(false)
    await controller.acknowledge()
    await expect(controller.acknowledged()).resolves.toBe(true)
    expect(unavailable.set).not.toHaveBeenCalled()
  })
})
