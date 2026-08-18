// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  WorkspaceDirectoryListing, WorkspaceFileLocator, WorkspaceFilePreview, WorkspaceFileVersion,
} from '@monotykamary/dsh-api-remotes/client'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import { FilesPanel } from '../src/client/FilesPanel.tsx'
import type { FilesInjected, FilesPanelProps } from '../src/client/contract.ts'
import { en } from '../src/client/locales.ts'
import { createFilesStore } from '../src/client/store.ts'

function hookOf<T>(source: { subscribe: (listener: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(selector: (snapshot: T) => S): S {
    return selector(useSyncExternalStore(source.subscribe, source.getSnapshot))
  }
}

const rootEntries = [
  { name: 'src', kind: 'directory' as const, locator: { segments: ['src'] } },
  { name: 'README.md', kind: 'file' as const, locator: { segments: ['README.md'] }, size: 8 },
  { name: 'binary.bin', kind: 'file' as const, locator: { segments: ['binary.bin'] }, size: 2 },
  { name: 'large.txt', kind: 'file' as const, locator: { segments: ['large.txt'] }, size: 20 },
  { name: 'special', kind: 'other' as const, locator: { segments: ['special'] } },
]
const rootListing: WorkspaceDirectoryListing = {
  directory: { segments: [] }, entries: rootEntries, truncated: true,
}
const srcListing: WorkspaceDirectoryListing = {
  directory: { segments: ['src'] },
  entries: [{ name: 'index.ts', kind: 'file', locator: { segments: ['src', 'index.ts'] }, size: 22 }],
  truncated: false,
}

function text(file: WorkspaceFileLocator, content: string): WorkspaceFilePreview {
  return {
    kind: 'text', file, name: file.segments.at(-1) ?? '', content,
    byteLength: new TextEncoder().encode(content).byteLength,
    version: 'fixture-version' as WorkspaceFileVersion,
  }
}

function mount(
  list: FilesInjected['list'],
  read: FilesInjected['read'],
  write: FilesInjected['write'] = async () => { throw new Error('unexpected write') },
) {
  const instance = createFilesStore().create('s')
  const props = {
    useStore: hookOf(instance),
    actions: instance.actions,
    list,
    read,
    write,
    t: makeTranslate(en),
  } as FilesPanelProps
  const view = render(<FilesPanel {...props} />)
  return { instance, view }
}

afterEach(cleanup)

describe('FilesPanel', () => {
  it('loads, expands, filters, previews, refreshes, and supports tree keyboard navigation', async () => {
    const list = vi.fn<FilesInjected['list']>(async locator =>
      locator.segments.length === 0 ? rootListing : srcListing)
    const read = vi.fn<FilesInjected['read']>(async (file) => {
      const path = file.segments.join('/')
      if (path === 'large.txt') {
        return { kind: 'unavailable', file, name: 'large.txt', reason: 'too-large', maxBytes: 5, byteLength: 20 }
      }
      if (path === 'binary.bin') {
        return { kind: 'unavailable', file, name: 'binary.bin', reason: 'not-text', maxBytes: 5 }
      }
      return text(file, 'export const value = 1\n')
    })
    const { view } = mount(list, read)

    const src = await screen.findByRole('treeitem', { name: 'src' })
    expect(screen.getByText(en['tree.truncated'])).toBeTruthy()
    fireEvent.click(src)
    const index = await screen.findByRole('treeitem', { name: 'index.ts' })
    expect(src.getAttribute('aria-expanded')).toBe('true')
    index.focus()
    fireEvent.keyDown(index, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(src)
    fireEvent.keyDown(src, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(index)
    fireEvent.keyDown(index, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(src)
    fireEvent.click(src)
    expect(src.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(src)
    await screen.findByRole('treeitem', { name: 'index.ts' })
    expect(list.mock.calls.filter(call => call[0].segments.join('/') === 'src')).toHaveLength(1)

    fireEvent.click(screen.getByRole('treeitem', { name: 'index.ts' }))
    await waitFor(() => { expect(view.container.textContent).toContain('export const value = 1') })
    expect(screen.getByRole('textbox', { name: 'Edit src/index.ts' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['preview.refresh'] }))
    await waitFor(() => {
      expect(read.mock.calls.filter(call => call[0].segments.join('/') === 'src/index.ts')).toHaveLength(2)
    })
    fireEvent.click(screen.getByRole('button', { name: en['preview.back'] }))

    const filter = screen.getByRole('searchbox', { name: en['tree.filterAria'] })
    fireEvent.change(filter, { target: { value: 'INDEX' } })
    expect(screen.getByRole('treeitem', { name: /index\.ts/ })).toBeTruthy()
    expect(screen.getByText(en['tree.filterScope'])).toBeTruthy()
    fireEvent.change(filter, { target: { value: 'none' } })
    expect(screen.getByText(en['tree.emptyFilter'])).toBeTruthy()
    fireEvent.change(filter, { target: { value: '' } })
    fireEvent.click(screen.getByRole('treeitem', { name: 'src' }))
    fireEvent.change(filter, { target: { value: 'src' } })
    fireEvent.click(screen.getByRole('treeitem', { name: /^src\s*\/$/u }))
    expect((filter as HTMLInputElement).value).toBe('')
    await screen.findByRole('treeitem', { name: 'index.ts' })

    fireEvent.click(screen.getByRole('treeitem', { name: 'large.txt' }))
    expect(await screen.findByText('File exceeds the 5 B preview limit')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['preview.back'] }))
    fireEvent.click(screen.getByRole('treeitem', { name: 'binary.bin' }))
    expect(await screen.findByText(en['preview.notText'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['preview.back'] }))

    fireEvent.click(screen.getByRole('button', { name: en['tree.refresh'] }))
    await waitFor(() => { expect(list.mock.calls.filter(call => call[0].segments.length === 0).length).toBe(2) })
    expect(screen.getByRole('treeitem', { name: 'src' })).toBeTruthy()
  })

  it('shows generic directory and preview failures and retries', async () => {
    const list = vi.fn<FilesInjected['list']>()
      .mockRejectedValueOnce(new Error('private directory detail'))
      .mockResolvedValue(rootListing)
    const read = vi.fn<FilesInjected['read']>()
      .mockRejectedValueOnce(new Error('private preview detail'))
      .mockResolvedValue(text({ segments: ['README.md'] }, '# readme'))
    const { view } = mount(list, read)

    expect((await screen.findByRole('alert')).textContent).toContain(en['tree.error'])
    expect(screen.queryByText('private directory detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en['tree.retry'] }))
    await screen.findByRole('treeitem', { name: 'README.md' })
    fireEvent.click(screen.getByRole('treeitem', { name: 'README.md' }))
    expect((await screen.findByRole('alert')).textContent).toContain(en['preview.error'])
    expect(view.container.textContent).not.toContain('private preview detail')
    fireEvent.click(screen.getByRole('button', { name: en['preview.retry'] }))
    await waitFor(() => { expect(view.container.textContent).toContain('# readme') })
  })

  it('retries a failed child directory when it is reopened', async () => {
    const list = vi.fn<FilesInjected['list']>()
      .mockResolvedValueOnce(rootListing)
      .mockRejectedValueOnce(new Error('child failed'))
      .mockResolvedValueOnce(srcListing)
    mount(list, async file => text(file, 'text'))
    const src = await screen.findByRole('treeitem', { name: 'src' })
    fireEvent.click(src)
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    fireEvent.click(src)
    fireEvent.click(src)
    await screen.findByRole('treeitem', { name: 'index.ts' })
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('handles aborted directory and preview rejections after unmount', async () => {
    const pendingDirectory = Promise.withResolvers<WorkspaceDirectoryListing>()
    let directorySignal: AbortSignal | undefined
    const list = vi.fn<FilesInjected['list']>((_locator, nextSignal) => {
      directorySignal = nextSignal
      return pendingDirectory.promise
    })
    const directoryMount = mount(list, async file => text(file, 'a'))
    await waitFor(() => { expect(list).toHaveBeenCalledOnce() })
    directoryMount.view.unmount()
    expect(directorySignal?.aborted).toBe(true)
    await act(async () => { pendingDirectory.reject(new DOMException('aborted', 'AbortError')) })
    expect(directoryMount.instance.store.getSnapshot().directories).toEqual({})

    const pendingPreview = Promise.withResolvers<WorkspaceFilePreview>()
    let previewSignal: AbortSignal | undefined
    const read = vi.fn<FilesInjected['read']>((_file, nextSignal) => {
      previewSignal = nextSignal
      return pendingPreview.promise
    })
    const previewMount = mount(async () => rootListing, read)
    fireEvent.click(await screen.findByRole('treeitem', { name: 'README.md' }))
    await waitFor(() => { expect(read).toHaveBeenCalledOnce() })
    previewMount.view.unmount()
    expect(previewSignal?.aborted).toBe(true)
    await act(async () => { pendingPreview.reject(new DOMException('aborted', 'AbortError')) })
    expect(previewMount.instance.store.getSnapshot().preview).toBeNull()
  })
})
