import { describe, expect, it } from 'vitest'
import type { WorkbenchSurfaceId } from '../src/client/contract.ts'
import { createWorkbenchStore } from '../src/client/store.ts'

const id = (value: string) => value as WorkbenchSurfaceId

describe('workbench store', () => {
  it('opens, activates, deduplicates, and closes tabs with adjacent fallback', () => {
    const instance = createWorkbenchStore().create('session')
    instance.actions.openSurface(id('inspect'))
    instance.actions.openSurface(id('changes'))
    instance.actions.openSurface(id('inspect'))
    expect(instance.store.getSnapshot()).toEqual({
      openIds: [id('inspect'), id('changes')], activeId: id('inspect'),
    })

    instance.actions.closeSurface(id('inspect'))
    expect(instance.store.getSnapshot()).toEqual({ openIds: [id('changes')], activeId: id('changes') })
    instance.actions.closeSurface(id('missing'))
    instance.actions.closeSurface(id('changes'))
    expect(instance.store.getSnapshot()).toEqual({ openIds: [], activeId: null })
  })

  it('keeps the active tab when closing a background tab and reconciles removed registrations', () => {
    const instance = createWorkbenchStore().create('session')
    instance.actions.openSurface(id('inspect'))
    instance.actions.openSurface(id('changes'))
    instance.actions.openSurface(id('agents'))
    instance.actions.closeSurface(id('inspect'))
    expect(instance.store.getSnapshot()).toEqual({
      openIds: [id('changes'), id('agents')], activeId: id('agents'),
    })

    instance.actions.reconcile([id('changes')])
    expect(instance.store.getSnapshot()).toEqual({ openIds: [id('changes')], activeId: id('changes') })
    instance.actions.reconcile([])
    expect(instance.store.getSnapshot()).toEqual({ openIds: [], activeId: null })
  })
})
