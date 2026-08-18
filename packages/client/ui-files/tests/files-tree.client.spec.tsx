// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@monotykamary/dsh-client-test-runtime'
import type { WorkspaceDirectoryListing, WorkspaceFileEntry } from '@monotykamary/dsh-api-remotes/client'
import { FilesTree } from '../src/client/FilesTree.tsx'
import { en } from '../src/client/locales.ts'
import { locatorKey } from '../src/client/presentation.ts'
import type { DirectoryCell } from '../src/client/store.ts'

const src: WorkspaceFileEntry = {
  name: 'src', kind: 'directory', locator: { segments: ['src'] },
}
const nested: WorkspaceFileEntry = {
  name: 'index.ts', kind: 'file', locator: { segments: ['src', 'index.ts'] },
}
const readme: WorkspaceFileEntry = {
  name: 'README.md', kind: 'file', locator: { segments: ['README.md'] },
}
const rootListing: WorkspaceDirectoryListing = {
  directory: { segments: [] }, entries: [src, readme], truncated: false,
}
const rootCell: DirectoryCell = { requestId: 1, phase: 'ready', listing: rootListing }
const rows = [
  { key: locatorKey(src.locator), parentKey: locatorKey({ segments: [] }), depth: 0, entry: src },
  { key: locatorKey(nested.locator), parentKey: locatorKey(src.locator), depth: 1, entry: nested },
  { key: locatorKey(readme.locator), parentKey: locatorKey({ segments: [] }), depth: 0, entry: readme },
]

function props(overrides: Partial<ComponentProps<typeof FilesTree>> = {}): ComponentProps<typeof FilesTree> {
  return {
    rows,
    query: '',
    searching: false,
    rootCell,
    directories: {},
    expandedKeys: [locatorKey(src.locator)],
    selectedKey: null,
    truncated: false,
    t: makeTranslate(en),
    onQuery: vi.fn(),
    onRefresh: vi.fn(),
    onActivate: vi.fn(),
    onRetryRoot: vi.fn(),
    ...overrides,
  }
}

afterEach(cleanup)

describe('FilesTree', () => {
  it('supports bounded and hierarchical keyboard navigation', () => {
    const onActivate = vi.fn()
    const view = render(<FilesTree {...props({ onActivate })} />)
    const srcRow = screen.getByRole('treeitem', { name: 'src' })
    const nestedRow = screen.getByRole('treeitem', { name: 'index.ts' })
    const readmeRow = screen.getByRole('treeitem', { name: 'README.md' })

    srcRow.focus()
    fireEvent.keyDown(srcRow, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(nestedRow)
    fireEvent.keyDown(nestedRow, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(readmeRow)
    fireEvent.keyDown(readmeRow, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(readmeRow)
    fireEvent.keyDown(readmeRow, { key: 'Home' })
    expect(document.activeElement).toBe(srcRow)
    fireEvent.keyDown(srcRow, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(srcRow)
    fireEvent.keyDown(srcRow, { key: 'End' })
    expect(document.activeElement).toBe(readmeRow)
    fireEvent.keyDown(srcRow, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(nestedRow)
    fireEvent.keyDown(nestedRow, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(srcRow)
    fireEvent.keyDown(srcRow, { key: 'ArrowLeft' })
    expect(onActivate).toHaveBeenCalledWith(src)
    fireEvent.keyDown(readmeRow, { key: 'ArrowLeft' })
    fireEvent.keyDown(readmeRow, { key: 'Enter' })

    onActivate.mockClear()
    view.rerender(<FilesTree {...props({ expandedKeys: [], onActivate })} />)
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'src' }), { key: 'ArrowRight' })
    expect(onActivate).toHaveBeenCalledWith(src)

    onActivate.mockClear()
    view.rerender(<FilesTree {...props({ searching: true, query: 'src', onActivate })} />)
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /^src\s*\/$/u }), { key: 'ArrowRight' })
    expect(onActivate).not.toHaveBeenCalled()

    view.rerender(<FilesTree {...props({ rows: [rows[0]!], onActivate })} />)
    screen.getByRole('treeitem', { name: 'src' }).focus()
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'src' }), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'src' }))
  })

  it('renders loaded-search paths, child phases, empty state, hints, and toolbar actions', () => {
    const onQuery = vi.fn()
    const onRefresh = vi.fn()
    const pending: DirectoryCell = { requestId: 2, phase: 'loading', listing: null }
    const view = render(
      <FilesTree {...props({
        directories: { [locatorKey(src.locator)]: pending },
        searching: true,
        query: 'file',
        truncated: true,
        onQuery,
        onRefresh,
      })} />,
    )
    expect(screen.getAllByText('/')).toHaveLength(2)
    expect(screen.getAllByText('src')).toHaveLength(2)
    expect(screen.getByText(en['tree.filterScope'])).toBeTruthy()
    expect(screen.getByText(en['tree.truncated'])).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'next' } })
    expect(onQuery).toHaveBeenCalledWith('next')
    fireEvent.click(screen.getByRole('button', { name: en['tree.refresh'] }))
    expect(onRefresh).toHaveBeenCalledOnce()

    const failed: DirectoryCell = { requestId: 2, phase: 'error', listing: null }
    view.rerender(<FilesTree {...props({ directories: { [locatorKey(src.locator)]: failed } })} />)
    expect(screen.getByRole('treeitem', { name: 'src' })).toBeTruthy()

    view.rerender(<FilesTree {...props({ rows: [], expandedKeys: [] })} />)
    expect(screen.getByText(en['tree.empty'])).toBeTruthy()
  })
})
