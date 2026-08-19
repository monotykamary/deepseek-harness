import { describe, expect, it, vi } from 'vitest'
import type { StoredEntry } from '@monotykamary/dsh-client-ui-slots'
import type { WorkbenchSurfaceId } from '../src/client/contract.ts'
import { WorkbenchSurfaceDirectory } from '../src/client/surface-directory.ts'

function entry(id: string | undefined, label?: string | (() => string)): StoredEntry {
  return { options: { ...(id === undefined ? {} : { id }), ...(label === undefined ? {} : { label }) } } as StoredEntry
}

describe('WorkbenchSurfaceDirectory', () => {
  it('projects ordered labels, refreshes on slot and locale changes, and disposes upstream subscriptions', () => {
    let entries: readonly StoredEntry[] = [entry('inspect', 'Inspect')]
    let slotListener = () => {}
    let localeListener = () => {}
    const offSlots = vi.fn()
    const offLocale = vi.fn()
    const slots = {
      entries: () => entries,
      subscribe: (_key: string, listener: () => void) => { slotListener = listener; return offSlots },
    }
    const locale = {
      subscribe: (listener: () => void) => { localeListener = listener; return offLocale },
    }
    const directory = new WorkbenchSurfaceDirectory(slots, locale)
    const listener = vi.fn()
    const unsubscribe = directory.subscribe(listener)
    const stop = directory.start()

    const first = directory.getSnapshot()
    expect(first).toEqual([{ id: 'inspect', label: 'Inspect', icon: 'generic', description: '', immersive: false, repeatable: false }])
    expect(directory.has('inspect' as WorkbenchSurfaceId)).toBe(true)
    slotListener()
    expect(directory.getSnapshot()).toBe(first)
    expect(listener).not.toHaveBeenCalled()

    let translated = 'Changes'
    entries = [entry('inspect', 'Inspect'), entry('changes', () => translated), entry(undefined)]
    slotListener()
    expect(directory.getSnapshot()).toEqual([
      { id: 'inspect', label: 'Inspect', icon: 'generic', description: '', immersive: false, repeatable: false },
      { id: 'changes', label: 'Changes', icon: 'generic', description: '', immersive: false, repeatable: false },
    ])
    expect(listener).toHaveBeenCalledTimes(1)

    translated = '更改'
    localeListener()
    expect(directory.getSnapshot()[1]?.label).toBe('更改')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    stop()
    expect(offSlots).toHaveBeenCalledTimes(1)
    expect(offLocale).toHaveBeenCalledTimes(1)
  })

  it('registers locale-aware presentation metadata and retracts only its own registration', () => {
    const slots = {
      entries: () => [entry('files', 'Files')],
      subscribe: () => () => {},
    }
    const locale = { subscribe: () => () => {} }
    const directory = new WorkbenchSurfaceDirectory(slots, locale)
    const files = 'files' as WorkbenchSurfaceId
    let description = 'Browse files'
    const dispose = directory.registerPresentation(files, {
      icon: 'files', description: () => description, immersive: true, repeatable: true,
    })
    expect(directory.getSnapshot()).toEqual([{
      id: 'files', label: 'Files', icon: 'files', description: 'Browse files', immersive: true, repeatable: true,
    }])
    expect(() => directory.registerPresentation(files, { icon: 'files', description: '' }))
      .toThrow(/already registered/u)
    description = '浏览文件'
    directory.start()
    expect(directory.getSnapshot()[0]?.description).toBe('浏览文件')
    dispose()
    dispose()
    expect(directory.getSnapshot()[0]).toMatchObject({ icon: 'generic', description: '', immersive: false, repeatable: false })
  })

  it('falls back to ids and contains subscriber failures', () => {
    let slotListener = () => {}
    let entries = [entry('inspect')]
    const slots = {
      entries: () => entries,
      subscribe: (_key: string, listener: () => void) => { slotListener = listener; return () => {} },
    }
    const locale = { subscribe: () => () => {} }
    const directory = new WorkbenchSurfaceDirectory(slots, locale)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    directory.subscribe(() => { throw new Error('listener') })
    directory.start()
    entries = [entry('inspect'), entry('changes')]
    slotListener()
    expect(directory.getSnapshot()[1]?.label).toBe('changes')
    expect(error).toHaveBeenCalledWith('workbench surface listener failed:', expect.any(Error))
  })
})
