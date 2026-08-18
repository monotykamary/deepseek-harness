import type {
  WorkspaceFileEntry, WorkspaceFileLocator,
} from '@monotykamary/dsh-api-remotes/client'
import type { DirectoryCell, FilesState } from './store.ts'

/** Provider-neutral workspace root locator. */
export const ROOT_LOCATOR: WorkspaceFileLocator = { segments: [] }

/**
 * Build a stable JSON key for one provider-neutral locator.
 * @param locator - workspace-relative child-name segments.
 * @returns exact key preserving segment boundaries.
 */
export function locatorKey(locator: WorkspaceFileLocator): string {
  return JSON.stringify(locator.segments)
}

/**
 * Format a slash-separated path for browser presentation.
 * @param locator - workspace-relative child-name segments.
 * @returns display path without a leading slash.
 */
export function locatorLabel(locator: WorkspaceFileLocator): string {
  return locator.segments.join('/')
}

const KIND_ORDER = { directory: 0, file: 1, other: 2 } as const

/**
 * Order one provider listing by directory, file, other, then localized name.
 * @param entries - direct children in provider order.
 * @returns copied and deterministically ordered entries.
 */
export function orderedEntries(entries: readonly WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  return [...entries].sort((left, right) => {
    const kind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
    return kind !== 0 ? kind : left.name.localeCompare(right.name)
  })
}

/** One rendered tree or loaded-search row. */
export interface FileRow {
  readonly key: string
  readonly parentKey: string
  readonly depth: number
  readonly entry: WorkspaceFileEntry
}

function rowsFrom(
  directory: WorkspaceFileLocator,
  depth: number,
  state: Pick<FilesState, 'directories' | 'expandedKeys'>,
  rows: FileRow[],
): void {
  const parentKey = locatorKey(directory)
  const listing = state.directories[parentKey]?.listing
  if (listing === null || listing === undefined) return
  for (const entry of orderedEntries(listing.entries)) {
    const key = locatorKey(entry.locator)
    rows.push({ key, parentKey, depth, entry })
    if (entry.kind === 'directory' && state.expandedKeys.includes(key)) {
      rowsFrom(entry.locator, depth + 1, state, rows)
    }
  }
}

/**
 * Project the visible hierarchy under current expansion state.
 * @param state - committed listings and expanded locator keys.
 * @returns depth-annotated visible rows.
 */
export function treeRows(state: Pick<FilesState, 'directories' | 'expandedKeys'>): FileRow[] {
  const rows: FileRow[] = []
  rowsFrom(ROOT_LOCATOR, 0, state, rows)
  return rows
}

/**
 * Collect every unique entry reached by a committed directory listing.
 * @param directories - per-locator request and listing cache.
 * @returns entries deduplicated by provider-neutral locator.
 */
export function loadedEntries(directories: Readonly<Record<string, DirectoryCell>>): WorkspaceFileEntry[] {
  const byKey = new Map<string, WorkspaceFileEntry>()
  for (const cell of Object.values(directories)) {
    for (const entry of cell.listing?.entries ?? []) byKey.set(locatorKey(entry.locator), entry)
  }
  return [...byKey.values()]
}

/**
 * Search loaded entries without traversing unopened directories.
 * @param directories - per-locator request and listing cache.
 * @param query - case-insensitive locator substring.
 * @returns flat matching rows in path order.
 */
export function searchRows(
  directories: Readonly<Record<string, DirectoryCell>>,
  query: string,
): FileRow[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return []
  return loadedEntries(directories)
    .filter(entry => locatorLabel(entry.locator).toLocaleLowerCase().includes(needle))
    .sort((left, right) => locatorLabel(left.locator).localeCompare(locatorLabel(right.locator)))
    .map(entry => ({
      key: locatorKey(entry.locator),
      parentKey: locatorKey({ segments: entry.locator.segments.slice(0, -1) }),
      depth: 0,
      entry,
    }))
}

/**
 * Infer a syntax grammar from the selected filename.
 * @param locator - selected workspace file locator.
 * @returns shared CodeBlock language id, or undefined for an unknown extension.
 */
export function languageFor(locator: WorkspaceFileLocator): string | undefined {
  const name = locator.segments.at(-1)?.toLocaleLowerCase()
  if (name === undefined) return undefined
  const aliases: Record<string, string> = {
    'js': 'javascript', 'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx',
    'md': 'markdown', 'mdx': 'mdx', 'json': 'json', 'jsonl': 'json',
    'yaml': 'yaml', 'yml': 'yaml', 'css': 'css', 'html': 'html',
    'py': 'python', 'rs': 'rust', 'go': 'go', 'sh': 'bash', 'bash': 'bash',
  }
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return aliases[extension]
}

/**
 * Format a compact binary byte limit for preview copy.
 * @param bytes - positive byte count.
 * @returns exact MiB, KiB, or byte label.
 */
export function byteLimitLabel(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${String(bytes / (1024 * 1024))} MiB`
  if (bytes % 1024 === 0) return `${String(bytes / 1024)} KiB`
  return `${String(bytes)} B`
}
