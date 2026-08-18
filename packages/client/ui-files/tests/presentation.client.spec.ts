import { describe, expect, it } from 'vitest'
import type { WorkspaceDirectoryListing, WorkspaceFileEntry } from '@monotykamary/dsh-api-remotes/client'
import {
  ROOT_LOCATOR, byteLimitLabel, languageFor, loadedEntries, locatorKey, locatorLabel,
  orderedEntries, searchRows, treeRows,
} from '../src/client/presentation.ts'
import type { DirectoryCell } from '../src/client/store.ts'

const dir: WorkspaceFileEntry = { name: 'src', kind: 'directory', locator: { segments: ['src'] } }
const file: WorkspaceFileEntry = { name: 'z.ts', kind: 'file', locator: { segments: ['z.ts'] }, size: 1 }
const nested: WorkspaceFileEntry = {
  name: 'index.ts', kind: 'file', locator: { segments: ['src', 'index.ts'] }, size: 2,
}
const other: WorkspaceFileEntry = { name: 'link', kind: 'other', locator: { segments: ['link'] } }

function cell(directory: readonly string[], entries: readonly WorkspaceFileEntry[]): DirectoryCell {
  const listing: WorkspaceDirectoryListing = {
    directory: { segments: directory }, entries, truncated: false,
  }
  return { requestId: 1, phase: 'ready', listing }
}

describe('Files presentation', () => {
  it('keys and labels provider-neutral locators', () => {
    expect(ROOT_LOCATOR).toEqual({ segments: [] })
    expect(locatorKey({ segments: ['a', 'b'] })).toBe('["a","b"]')
    expect(locatorLabel({ segments: ['a', 'b'] })).toBe('a/b')
  })

  it('orders directories before files and unsupported entries', () => {
    expect(orderedEntries([other, file, dir]).map(entry => entry.name)).toEqual(['src', 'z.ts', 'link'])
    expect(orderedEntries([{ ...file, name: 'b.ts' }, { ...file, name: 'a.ts' }]).map(entry => entry.name))
      .toEqual(['a.ts', 'b.ts'])
  })

  it('builds expanded tree rows and deduplicated loaded search rows', () => {
    const directories = {
      [locatorKey(ROOT_LOCATOR)]: cell([], [file, dir, other]),
      [locatorKey(dir.locator)]: cell(['src'], [nested]),
    }
    expect(treeRows({ directories, expandedKeys: [] }).map(row => [row.entry.name, row.depth]))
      .toEqual([['src', 0], ['z.ts', 0], ['link', 0]])
    expect(treeRows({ directories, expandedKeys: [locatorKey(dir.locator)] }).map(row => [row.entry.name, row.depth]))
      .toEqual([['src', 0], ['index.ts', 1], ['z.ts', 0], ['link', 0]])
    expect(loadedEntries(directories).map(entry => locatorLabel(entry.locator)).sort())
      .toEqual(['link', 'src', 'src/index.ts', 'z.ts'])
    expect(searchRows(directories, 'INDEX').map(row => ({ path: locatorLabel(row.entry.locator), parent: row.parentKey })))
      .toEqual([{ path: 'src/index.ts', parent: '["src"]' }])
    expect(searchRows(directories, 'i').map(row => locatorLabel(row.entry.locator)))
      .toEqual(['link', 'src/index.ts'])
    expect(searchRows(directories, '   ')).toEqual([])
  })

  it('infers common grammars and formats binary limits', () => {
    expect(languageFor({ segments: [] })).toBeUndefined()
    expect(languageFor({ segments: ['Makefile'] })).toBeUndefined()
    expect(languageFor({ segments: ['component.tsx'] })).toBe('tsx')
    expect(languageFor({ segments: ['data.unknown'] })).toBeUndefined()
    expect(byteLimitLabel(1024 * 1024)).toBe('1 MiB')
    expect(byteLimitLabel(2048)).toBe('2 KiB')
    expect(byteLimitLabel(3)).toBe('3 B')
  })
})
