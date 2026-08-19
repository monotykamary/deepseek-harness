import { describe, expect, it } from 'vitest'
import type { WorkbenchSurfaceId } from '../src/client/contract.ts'
import { createWorkbenchStore } from '../src/client/store.ts'

const id = (value: string) => value as WorkbenchSurfaceId

describe('workbench store', () => {
  it('opens singleton surfaces and repeatable panel instances with reusable ordinals', () => {
    const instance = createWorkbenchStore().create('session')
    instance.actions.openSurface(id('inspect'))
    instance.actions.openNewSurface(id('terminal'))
    instance.actions.openNewSurface(id('terminal'))
    instance.actions.openSurface(id('inspect'))
    expect(instance.store.getSnapshot()).toEqual({
      panels: [
        { id: 'inspect:1', surfaceId: id('inspect'), ordinal: 1 },
        { id: 'terminal:1', surfaceId: id('terminal'), ordinal: 1 },
        { id: 'terminal:2', surfaceId: id('terminal'), ordinal: 2 },
      ],
      activePanelId: 'inspect:1',
    })

    instance.actions.closePanel('terminal:1')
    instance.actions.openNewSurface(id('terminal'))
    expect(instance.store.getSnapshot().panels.at(-1)).toEqual({
      id: 'terminal:1', surfaceId: id('terminal'), ordinal: 1,
    })
    instance.actions.activatePanel('terminal:2')
    expect(instance.store.getSnapshot().activePanelId).toBe('terminal:2')
    instance.actions.activatePanel('missing')
    expect(instance.store.getSnapshot().activePanelId).toBe('terminal:2')
    instance.actions.closePanel('missing')
  })

  it('keeps active background panels, ensures restored counts, and reconciles registrations', () => {
    const instance = createWorkbenchStore().create('session')
    instance.actions.openSurface(id('inspect'))
    instance.actions.openSurface(id('changes'))
    instance.actions.ensureSurfaceCount(id('terminal'), 2)
    instance.actions.openSurface(id('terminal'))
    instance.actions.closePanel('inspect:1')
    expect(instance.store.getSnapshot().activePanelId).toBe('terminal:1')

    instance.actions.closePanel('terminal:1')
    expect(instance.store.getSnapshot().activePanelId).toBe('terminal:2')
    instance.actions.reconcile([id('changes')])
    expect(instance.store.getSnapshot()).toEqual({
      panels: [{ id: 'changes:1', surfaceId: id('changes'), ordinal: 1 }],
      activePanelId: 'changes:1',
    })
    instance.actions.reconcile([])
    expect(instance.store.getSnapshot()).toEqual({ panels: [], activePanelId: null })
  })
})
