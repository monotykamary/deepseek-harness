// @vitest-environment jsdom
import { Context, Service } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import { resolveSlotLabel } from '@monotykamary/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { InstallationReadiness, UpdateBadge, UpdateSettings, type UpdateInjected } from '../src/client/UpdateSettings.tsx'

afterEach(cleanup)

const snapshot = {
  channel: 'source' as const, checkedAt: 1, checking: false, error: null, updateAvailable: false,
  packages: [], updateCommand: null, diagnostics: [],
}
const launch = { started: false, message: 'manual', statusPath: null }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service { constructor(serviceCtx: Context) { super(serviceCtx, 'remote') } }
  new RemoteService(ctx)
  const remote = {
    snapshot: vi.fn(async () => ({ ok: true as const, value: snapshot })),
    check: vi.fn(async () => ({ ok: true as const, value: snapshot })),
    start: vi.fn(async () => ({ ok: true as const, value: launch })),
  }
  ctx.provide('remote.distributionUpdate', remote)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, remote }
}

function declare(slots: SlotRegistry): void {
  slots.register({ name: 'root', children: {
    'settings.section': { kind: 'list', scope: 'root' },
    'settings.onboarding': { kind: 'list', scope: 'root' },
    'settings.trigger.badge': { kind: 'single', scope: 'root' },
  } } as never, () => null)
}

describe('ui-settings-updates browser plugin', () => {
  it('uses shared themed button chrome for update actions', async () => {
    const unusedHook = (() => { throw new Error('unused by component') }) as never
    render(<UpdateSettings
      useSessions={unusedHook}
      useWorkspaces={unusedHook}
      snapshot={vi.fn(async () => snapshot)}
      check={vi.fn(async () => ({ ...snapshot, updateAvailable: true }))}
      start={vi.fn(async () => launch)}
      t={(key: string) => key}
      close={vi.fn()}
    />)
    const check = await screen.findByRole('button', { name: 'check' })
    const update = screen.getByRole('button', { name: 'update' })
    expect(check.className).not.toBe('')
    expect(update.className).not.toBe('')
    expect(check.className).not.toBe(update.className)
  })

  it('does not render non-upgrade targets as version transitions', async () => {
    const unusedHook = (() => { throw new Error('unused by component') }) as never
    render(<UpdateSettings
      useSessions={unusedHook}
      useWorkspaces={unusedHook}
      snapshot={vi.fn(async () => snapshot)}
      check={vi.fn(async () => ({
        ...snapshot, packages: [
          { name: '@monotykamary/dsh', installed: '0.1.0-rc.11', latest: '0.1.0-rc.8', updateAvailable: false },
          { name: 'dsh-fabric', installed: '0.1.0', latest: '^0.1.0', updateAvailable: false },
        ],
      }))}
      start={vi.fn(async () => launch)}
      t={(key: string) => key}
      close={vi.fn()}
    />)
    await screen.findByText('@monotykamary/dsh')
    expect(screen.queryByText('0.1.0-rc.8', { exact: false })).toBeNull()
    expect(screen.queryByText('^0.1.0', { exact: false })).toBeNull()
    expect(screen.queryByRole('button', { name: 'update' })).toBeNull()
  })

  it('provides a no-op node-half Loader seat', () => {
    applyNode()
  })

  it('registers a localized section and trigger badge with lazy Remote operations', async () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.distributionUpdate'])
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const onboarding = b.slots.entries('settings.onboarding')[0]!
    expect(onboarding.component).toBe(InstallationReadiness)
    expect(onboarding.options).toMatchObject({ id: 'installation-readiness', order: -50 })
    const onboardingInjected = (onboarding.inject as unknown as () => Pick<UpdateInjected, 'snapshot'>)()
    await expect(onboardingInjected.snapshot()).resolves.toEqual(snapshot)
    const section = b.slots.entries('settings.section')[0]!
    expect(section.component).toBe(UpdateSettings)
    expect(section.options).toMatchObject({ id: 'updates', order: 40 })
    expect(resolveSlotLabel(section.options.label)).toBe('Updates')
    const badge = b.slots.entries('settings.trigger.badge')[0]!
    expect(badge.component).toBe(UpdateBadge)
    const badgeInjected = (badge.inject as unknown as () => Pick<UpdateInjected, 'check'>)()
    await expect(badgeInjected.check()).resolves.toEqual(snapshot)
    expect(b.remote.check).toHaveBeenCalledOnce()
    const injected = (section.inject as unknown as () => UpdateInjected)()
    await expect(injected.snapshot()).resolves.toEqual(snapshot)
    await expect(injected.check()).resolves.toEqual(snapshot)
    await expect(injected.start()).resolves.toEqual(launch)
    b.remote.check.mockResolvedValueOnce({ ok: false as const, error: { code: 'OFFLINE', message: 'no registry' } } as never)
    await expect(injected.check()).rejects.toThrow('OFFLINE: no registry')
    await b.ctx.fiber.dispose()
  })
})
