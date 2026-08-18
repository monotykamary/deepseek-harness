import { Context } from '@monotykamary/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import type { WorkbenchSurfaceId } from '@monotykamary/dsh-client-ui-workbench/client'
import { apply, inject } from '@monotykamary/dsh-client-ui-workbench/client'
import { createWorkbenchStore } from '../src/client/store.ts'
import { Workbench } from '../src/client/Workbench.tsx'
import { apply as applyNode } from '../src/index.ts'

const INSPECT = 'inspect' as WorkbenchSurfaceId

async function bench(declareFirst = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const layout = { toggleSidebar: vi.fn(), openDetails: vi.fn(), closeDetails: vi.fn() }
  ctx.provide('layout', layout)
  const declare = () => ctx.slots.register({
    name: 'root', children: { 'details': { kind: 'single', scope: 'session' } },
  } as never, () => null)
  if (declareFirst) declare()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  if (!declareFirst) declare()
  await Promise.resolve()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, layout, fiber }
}

describe('ui-workbench apply', () => {
  it('keeps the Host half empty', () => {
    applyNode()
  })

  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'layout', 'locale'])
  })

  it.each([true, false])('registers before or after Details declaration (%s)', async (declareFirst) => {
    const b = await bench(declareFirst)
    const [entry] = b.slots.entries('details')
    expect(entry?.component).toBe(Workbench)
    expect(entry?.locale).toBe('workbench')
    expect(b.slots.spec('workbench.surface')).toEqual({ kind: 'list', scope: 'session' })
    expect(b.locale.bind('workbench')('title')).toBe('工作台')
    expect(b.ctx.get('workbench')).toBeDefined()
    await b.fiber.dispose()
  })

  it('wires the current store actions into the navigation service and retracts everything on disposal', async () => {
    const b = await bench()
    const entry = b.slots.entries('details')[0]!
    const instance = createWorkbenchStore().create('session')
    const face = (entry.inject as unknown as (sessionId: string, actions: typeof instance.actions) => object)(
      'session', instance.actions,
    ) as { hooks: { surfaces: { getSnapshot(): readonly { id: WorkbenchSurfaceId }[] } } }
    b.slots.register({ name: 'workbench.surface', id: INSPECT, label: 'Inspect' } as never, () => null)
    const disposePresentation = b.ctx.workbench.registerPresentation(INSPECT, {
      icon: 'inspect', description: 'Inspect a tool call',
    })
    await Promise.resolve()
    expect(face.hooks.surfaces.getSnapshot()).toEqual([{
      id: INSPECT, label: 'Inspect', icon: 'inspect', description: 'Inspect a tool call',
    }])

    b.ctx.workbench.show()
    expect(b.layout.openDetails).toHaveBeenCalledTimes(1)
    b.ctx.workbench.open(INSPECT)
    expect(instance.store.getSnapshot().activeId).toBe(INSPECT)
    expect(b.layout.openDetails).toHaveBeenCalledTimes(2)
    disposePresentation()
    b.ctx.workbench.close()
    expect(b.layout.closeDetails).toHaveBeenCalledTimes(1)

    await b.fiber.dispose()
    expect(b.slots.entries('details')).toHaveLength(0)
    expect(b.slots.spec('workbench.surface')).toBeUndefined()
    expect(b.ctx.get('workbench')).toBeUndefined()
  })
})
