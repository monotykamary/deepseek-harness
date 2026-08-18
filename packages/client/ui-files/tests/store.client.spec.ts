import { describe, expect, it } from 'vitest'
import type {
  WorkspaceDirectoryListing, WorkspaceFilePreview, WorkspaceFileVersion,
} from '@monotykamary/dsh-api-remotes/client'
import { createFilesStore } from '../src/client/store.ts'
import { locatorKey } from '../src/client/presentation.ts'

const root = { segments: [] }
const src = { segments: ['src'] }
const file = { segments: ['src', 'index.ts'] }
const listing: WorkspaceDirectoryListing = {
  directory: root,
  entries: [{ name: 'src', locator: src, kind: 'directory' }],
  truncated: false,
}
const preview: WorkspaceFilePreview = {
  kind: 'text', file, name: 'index.ts', content: 'text', byteLength: 4,
  version: 'fixture-version' as WorkspaceFileVersion,
}

describe('Files store', () => {
  it('owns query, expansion, selection, refresh, and ancestor state', () => {
    const instance = createFilesStore().create('s')
    const { actions } = instance
    actions.setQuery('src')
    actions.toggleDirectory(locatorKey(src))
    actions.toggleDirectory(locatorKey(src))
    actions.expandPath(file, false)
    actions.expandPath(file, false)
    expect(instance.store.getSnapshot().expandedKeys).toEqual([locatorKey(src)])
    actions.expandPath(src, true)
    actions.selectFile(file)
    expect(instance.store.getSnapshot()).toMatchObject({
      query: 'src', selected: file, preview: null,
    })
    actions.showTree()
    expect(instance.store.getSnapshot().selected).toBeNull()
    actions.selectFile(file)
    actions.refresh()
    expect(instance.store.getSnapshot()).toMatchObject({
      directories: {}, selected: file, preview: null,
    })
  })

  it('commits only the current directory and preview requests', () => {
    const instance = createFilesStore().create('s')
    const { actions } = instance
    const key = locatorKey(root)
    actions.beginDirectory(key, 1)
    actions.resolveDirectory(key, 0, listing)
    actions.rejectDirectory(key, 0)
    expect(instance.store.getSnapshot().directories[key]?.phase).toBe('loading')
    actions.resolveDirectory(key, 1, listing)
    expect(instance.store.getSnapshot().directories[key]).toEqual({
      requestId: 1, phase: 'ready', listing,
    })
    actions.beginDirectory(key, 2)
    expect(instance.store.getSnapshot().directories[key]?.listing).toEqual(listing)
    actions.rejectDirectory(key, 2)
    expect(instance.store.getSnapshot().directories[key]?.phase).toBe('error')

    actions.beginPreview(file, 3)
    actions.resolvePreview(2, preview)
    actions.rejectPreview(2)
    expect(instance.store.getSnapshot().preview?.phase).toBe('loading')
    actions.resolvePreview(3, preview)
    expect(instance.store.getSnapshot().preview).toMatchObject({ phase: 'ready', value: preview })
    actions.commitPreview({ ...preview, file: { segments: ['other.ts'] }, content: 'ignored' })
    expect(instance.store.getSnapshot().preview?.value).toEqual(preview)
    const saved = {
      ...preview, content: 'saved', byteLength: 5, version: 'saved-version' as WorkspaceFileVersion,
    }
    actions.commitPreview(saved)
    expect(instance.store.getSnapshot().preview).toMatchObject({ phase: 'ready', value: saved })
    actions.beginPreview(file, 4)
    actions.rejectPreview(4)
    expect(instance.store.getSnapshot().preview?.phase).toBe('error')
  })

  it('cancels pending cells while retaining committed directory data', () => {
    const instance = createFilesStore().create('s')
    const { actions } = instance
    const rootKey = locatorKey(root)
    const srcKey = locatorKey(src)
    actions.beginDirectory(rootKey, 1)
    actions.resolveDirectory(rootKey, 1, listing)
    actions.beginDirectory(rootKey, 2)
    actions.beginDirectory(srcKey, 3)
    actions.beginPreview(file, 4)
    actions.cancelPending()
    expect(instance.store.getSnapshot().directories).toEqual({
      [rootKey]: { requestId: 2, phase: 'ready', listing },
    })
    expect(instance.store.getSnapshot().preview).toBeNull()

    actions.beginPreview(file, 5)
    actions.rejectPreview(5)
    actions.cancelPending()
    expect(instance.store.getSnapshot().preview?.phase).toBe('error')
  })
})
