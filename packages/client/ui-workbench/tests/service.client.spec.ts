import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@monotykamary/dsh-client-runtime/client'
import type { ILayout } from '@monotykamary/dsh-client-ui-layout/client'
import type { WorkbenchSurfaceId } from '../src/client/contract.ts'
import { WorkbenchController } from '../src/client/service.ts'
import { createWorkbenchStore } from '../src/client/store.ts'

const id = (value: string) => value as WorkbenchSurfaceId
const sid = (value: string) => value as SessionId

function layout(): { panels: ILayout; openDetails: ReturnType<typeof vi.fn>; closeDetails: ReturnType<typeof vi.fn> } {
  const openDetails = vi.fn()
  const closeDetails = vi.fn()
  return {
    panels: {
      toggleSidebar: vi.fn(), openApplicationSurface: vi.fn(), openDetails, closeDetails,
      openBottom: vi.fn(), closeBottom: vi.fn(), toggleBottom: vi.fn(),
    },
    openDetails,
    closeDetails,
  }
}

describe('WorkbenchController', () => {
  it('opens a registered surface before revealing the layout and retains tabs on close', () => {
    const calls: string[] = []
    const { panels, openDetails, closeDetails } = layout()
    openDetails.mockImplementation(() => { calls.push('layout') })
    const disposePresentation = vi.fn()
    const registerPresentation = vi.fn(() => disposePresentation)
    const surfaces = {
      get: (surfaceId: WorkbenchSurfaceId) => surfaceId === id('inspect')
        ? { id: surfaceId, repeatable: true }
        : undefined,
      registerPresentation,
    }
    const controller = new WorkbenchController(panels, surfaces as never)
    controller.attach(sid('session'), {
      openSurface: (surfaceId) => { calls.push(`surface:${String(surfaceId)}`) },
      openNewSurface: (surfaceId) => { calls.push(`new:${String(surfaceId)}`) },
      ensureSurfaceCount: vi.fn(), activatePanel: vi.fn(), closePanel: vi.fn(), reconcile: vi.fn(),
    })

    controller.show()
    expect(openDetails).toHaveBeenCalledTimes(1)
    const dispose = controller.registerPresentation(id('inspect'), {
      icon: 'inspect', description: 'Inspect a tool call',
    })
    expect(registerPresentation).toHaveBeenCalledWith(id('inspect'), {
      icon: 'inspect', description: 'Inspect a tool call',
    })
    dispose()
    expect(disposePresentation).toHaveBeenCalledOnce()

    controller.open(sid('session'), id('inspect'))
    controller.openNew(sid('session'), id('inspect'))
    controller.ensureCount(sid('session'), id('inspect'), 2)
    expect(calls).toEqual(['layout', 'surface:inspect', 'layout', 'new:inspect', 'layout'])
    controller.close()
    expect(closeDetails).toHaveBeenCalledTimes(1)
  })

  it('routes singleton opening to the named Session and retracts only its mounted binding', () => {
    const { panels } = layout()
    const surfaces = {
      get: (surfaceId: WorkbenchSurfaceId) => ({ id: surfaceId, repeatable: false }),
    }
    const controller = new WorkbenchController(panels, surfaces as never)
    const first = createWorkbenchStore().create('first')
    const second = createWorkbenchStore().create('second')
    const detachFirst = controller.attach(sid('first'), first.actions)
    const detachSecond = controller.attach(sid('second'), second.actions)

    controller.open(sid('first'), id('files'))
    controller.open(sid('first'), id('files'))
    controller.open(sid('second'), id('files'))
    expect(first.store.getSnapshot()).toEqual({
      panels: [{ id: 'files:1', surfaceId: id('files'), ordinal: 1 }], activePanelId: 'files:1',
    })
    expect(second.store.getSnapshot()).toEqual({
      panels: [{ id: 'files:1', surfaceId: id('files'), ordinal: 1 }], activePanelId: 'files:1',
    })

    const replacement = createWorkbenchStore().create('replacement')
    const detachReplacement = controller.attach(sid('first'), replacement.actions)
    detachFirst()
    controller.open(sid('first'), id('files'))
    expect(replacement.store.getSnapshot().activePanelId).toBe('files:1')
    detachReplacement()
    expect(() => { controller.open(sid('first'), id('files')) }).toThrow(/first/u)
    controller.open(sid('second'), id('files'))
    detachSecond()
  })

  it('fails loud for an unavailable surface or before the Details entry wires actions', () => {
    const { panels, openDetails } = layout()
    const controller = new WorkbenchController(panels, { get: () => undefined } as never)
    expect(() => { controller.open(sid('session'), id('missing')) }).toThrow(/not registered/u)

    const unwired = new WorkbenchController(panels, { get: () => ({ repeatable: false }) } as never)
    expect(() => { unwired.open(sid('session'), id('inspect')) }).toThrow(/actions not wired/u)
    expect(() => { unwired.openNew(sid('session'), id('inspect')) }).toThrow(/not repeatable/u)
    expect(() => { unwired.ensureCount(sid('session'), id('inspect'), 2) }).toThrow(/not repeatable/u)
    expect(openDetails).not.toHaveBeenCalled()
  })
})
