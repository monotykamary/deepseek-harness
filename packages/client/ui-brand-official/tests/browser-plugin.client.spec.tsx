// @vitest-environment jsdom
import { Context } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { OfficialBrandMark, OfficialBrandName } from '../src/client/Brand.tsx'
import { Welcome } from '../src/client/Welcome.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const unusedHook = (() => { throw new Error('unused by component') }) as never
const runtime = { useSessions: unusedHook, useWorkspaces: unusedHook }

const BRAND_HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'conversation.hero.brand.mark',
] as const

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
  'conversation.hero.brand.mark',
  'settings.onboarding',
] as const

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('connection', { api: {}, isLoopback: false })
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [
      name, { kind: name === 'settings.onboarding' ? 'list' : 'single', scope: 'root' },
    ])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

describe('official browser-brand plugin', () => {
  it('declares only the slot service it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('leaves every slot empty outside the official build profile', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'local')
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of BRAND_HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    expect(subject.slots.entries('settings.onboarding')).toHaveLength(1)
  })

  it('fills declarations before or after apply and removes every occupant on teardown', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    before.disposeHoles?.()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)

    const after = await bench(false)
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
  })

  it('renders the persisted welcome modal and completes after acknowledgement', async () => {
    const complete = vi.fn()
    const controller = { acknowledged: vi.fn(async () => false), acknowledge: vi.fn(async () => {}) }
    render(<Welcome {...runtime} stepId="official-welcome" openSection={vi.fn()} complete={complete} controller={controller as never} t={makeTranslate(en)} />)
    expect(await screen.findByRole('dialog', { name: 'A complete coding-agent workbench' })).toBeTruthy()
    expect(screen.getByText('T3-inspired navigation')).toBeTruthy()
    expect(screen.getByText('Terminal + file workbench')).toBeTruthy()
    expect(screen.getByText('Fovea code intelligence')).toBeTruthy()
    expect(screen.getByText('Fabric execution')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await vi.waitFor(() => { expect(complete).toHaveBeenCalledOnce() })
    expect(controller.acknowledge).toHaveBeenCalledOnce()
  })

  it('renders the official name independently from both requested mark sizes', () => {
    const name = render(<OfficialBrandName />)
    expect(name.container.querySelector('svg')?.getAttribute('viewBox')).toBe('26 0 156 24')
    name.unmount()

    const mark = render(<OfficialBrandMark size={34} className="hero-mark" />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('34')
    expect(mark.container.querySelector('svg')?.getAttribute('class')).toBe('hero-mark')
    mark.rerender(<OfficialBrandMark size={24} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
  })
})
