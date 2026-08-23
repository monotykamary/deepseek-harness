import { describe, expect, it, vi } from 'vitest'
import type { ILayout } from '@monotykamary/dsh-client-ui-layout/client'
import type { WorkbenchSurfaceId } from '../src/client/contract.ts'
import { WorkbenchController } from '../src/client/service.ts'

const id = (value: string) => value as WorkbenchSurfaceId

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
    controller.attach({
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

    controller.open(id('inspect'))
    controller.openNew(id('inspect'))
    controller.ensureCount(id('inspect'), 2)
    expect(calls).toEqual(['layout', 'surface:inspect', 'layout', 'new:inspect', 'layout'])
    controller.close()
    expect(closeDetails).toHaveBeenCalledTimes(1)
  })

  it('fails loud for an unavailable surface or before the Details entry wires actions', () => {
    const { panels, openDetails } = layout()
    const controller = new WorkbenchController(panels, { get: () => undefined } as never)
    expect(() => { controller.open(id('missing')) }).toThrow(/not registered/u)

    const unwired = new WorkbenchController(panels, { get: () => ({ repeatable: false }) } as never)
    expect(() => { unwired.open(id('inspect')) }).toThrow(/actions not wired/u)
    expect(() => { unwired.openNew(id('inspect')) }).toThrow(/not repeatable/u)
    expect(() => { unwired.ensureCount(id('inspect'), 2) }).toThrow(/not repeatable/u)
    expect(openDetails).not.toHaveBeenCalled()
  })
})
