// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { WelcomeController } from '../src/client/welcome-controller.ts'

function api(version?: string) {
  return {
    settings: {
      describe: vi.fn(async () => ({ result: { ok: true as const, value: {
        namespaces: [{ ns: 'ui-onboarding', value: version === undefined ? {} : { welcomeNoticeVersion: version } }],
      } } })),
      mutate: vi.fn(async () => ({ result: { ok: true as const, value: {} } })),
    },
  }
}

describe('WelcomeController', () => {
  it('persists and recognizes only the current welcome version on loopback', async () => {
    const host = api('2026-08-22.1')
    const current = new WelcomeController(host as never, 'host')
    await expect(current.acknowledged()).resolves.toBe(true)

    const stale = api('2026-08-11.1')
    const controller = new WelcomeController(stale as never, 'host')
    await expect(controller.acknowledged()).resolves.toBe(false)
    await controller.acknowledge()
    expect(stale.settings.mutate).toHaveBeenCalledWith({
      ns: 'ui-onboarding',
      ops: [{ op: 'set', path: ['welcomeNoticeVersion'], value: '2026-08-22.1' }],
    })
  })

  it('keeps acknowledgement process-local when Host settings are ineligible', async () => {
    const remote = api()
    const controller = new WelcomeController(remote as never, 'memory')
    await expect(controller.acknowledged()).resolves.toBe(false)
    await controller.acknowledge()
    await expect(controller.acknowledged()).resolves.toBe(true)
    expect(remote.settings.describe).not.toHaveBeenCalled()
    expect(remote.settings.mutate).not.toHaveBeenCalled()
  })
})
