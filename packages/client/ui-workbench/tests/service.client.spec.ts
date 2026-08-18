import { describe, expect, it, vi } from 'vitest'
import type { ILayout } from '@monotykamary/dsh-client-ui-layout/client'
import type { WorkbenchSurfaceId } from '../src/client/contract.ts'
import { WorkbenchController } from '../src/client/service.ts'

const id = (value: string) => value as WorkbenchSurfaceId

function layout(): { panels: ILayout; openDetails: ReturnType<typeof vi.fn>; closeDetails: ReturnType<typeof vi.fn> } {
  const openDetails = vi.fn()
  const closeDetails = vi.fn()
  return {
    panels: { toggleSidebar: vi.fn(), openDetails, closeDetails },
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
      has: (surfaceId: WorkbenchSurfaceId) => surfaceId === id('inspect'),
      registerPresentation,
    }
    const controller = new WorkbenchController(panels, surfaces as never)
    controller.attach({
      openSurface: (surfaceId) => { calls.push(`surface:${String(surfaceId)}`) },
      closeSurface: vi.fn(), reconcile: vi.fn(),
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
    expect(calls).toEqual(['layout', 'surface:inspect', 'layout'])
    controller.close()
    expect(closeDetails).toHaveBeenCalledTimes(1)
  })

  it('fails loud for an unavailable surface or before the Details entry wires actions', () => {
    const { panels, openDetails } = layout()
    const controller = new WorkbenchController(panels, { has: () => false } as never)
    expect(() => { controller.open(id('missing')) }).toThrow(/not registered/u)

    const unwired = new WorkbenchController(panels, { has: () => true } as never)
    expect(() => { unwired.open(id('inspect')) }).toThrow(/actions not wired/u)
    expect(openDetails).not.toHaveBeenCalled()
  })
})
