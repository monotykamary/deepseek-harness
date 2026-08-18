import type {
  WorkspaceDirectoryListing, WorkspaceFileLocator, WorkspaceFilePreview,
} from '@monotykamary/dsh-api-remotes/client'
import { defineStore, type EngineStoreHandle } from '@monotykamary/dsh-client-runtime/client'
import { locatorKey } from './presentation.ts'

/** One cached directory request and its last committed listing. */
export interface DirectoryCell {
  requestId: number
  phase: 'loading' | 'ready' | 'error'
  listing: WorkspaceDirectoryListing | null
}

/** One selected-file request and its committed preview. */
export interface PreviewCell {
  requestId: number
  phase: 'loading' | 'ready' | 'error'
  file: WorkspaceFileLocator
  value: WorkspaceFilePreview | null
}

/** Per-session Files viewing and bounded Remote cache state. */
export interface FilesState {
  expandedKeys: string[]
  directories: Record<string, DirectoryCell>
  selected: WorkspaceFileLocator | null
  preview: PreviewCell | null
  query: string
}

type FilesActions = {
  setQuery: (draft: FilesState, query: string) => void
  toggleDirectory: (draft: FilesState, key: string) => void
  expandPath: (draft: FilesState, locator: WorkspaceFileLocator, includeSelf: boolean) => void
  selectFile: (draft: FilesState, locator: WorkspaceFileLocator) => void
  showTree: (draft: FilesState) => void
  refresh: (draft: FilesState) => void
  beginDirectory: (draft: FilesState, key: string, requestId: number) => void
  resolveDirectory: (draft: FilesState, key: string, requestId: number, listing: WorkspaceDirectoryListing) => void
  rejectDirectory: (draft: FilesState, key: string, requestId: number) => void
  beginPreview: (draft: FilesState, file: WorkspaceFileLocator, requestId: number) => void
  resolvePreview: (draft: FilesState, requestId: number, value: WorkspaceFilePreview) => void
  commitPreview: (draft: FilesState, value: WorkspaceFilePreview) => void
  rejectPreview: (draft: FilesState, requestId: number) => void
  cancelPending: (draft: FilesState) => void
}

/**
 * Create the transient per-session Files view store.
 * @returns store handle containing expansion, selection, and bounded read caches.
 */
export function createFilesStore(): EngineStoreHandle<FilesState, FilesActions> {
  return defineStore({
    init: (): FilesState => ({
      expandedKeys: [], directories: {}, selected: null, preview: null, query: '',
    }),
    actions: {
      setQuery: (draft, query: string) => { draft.query = query },
      toggleDirectory: (draft, key: string) => {
        const index = draft.expandedKeys.indexOf(key)
        if (index < 0) draft.expandedKeys.push(key)
        else draft.expandedKeys.splice(index, 1)
      },
      expandPath: (draft, locator: WorkspaceFileLocator, includeSelf: boolean) => {
        const through = includeSelf ? locator.segments.length : Math.max(0, locator.segments.length - 1)
        for (let length = 1; length <= through; length += 1) {
          const key = locatorKey({ segments: locator.segments.slice(0, length) })
          if (!draft.expandedKeys.includes(key)) draft.expandedKeys.push(key)
        }
      },
      selectFile: (draft, locator: WorkspaceFileLocator) => {
        draft.selected = { segments: [...locator.segments] }
        draft.preview = null
      },
      showTree: (draft) => {
        draft.selected = null
        draft.preview = null
      },
      refresh: (draft) => {
        draft.directories = {}
        draft.preview = null
      },
      beginDirectory: (draft, key: string, requestId: number) => {
        const previous = draft.directories[key]
        draft.directories[key] = {
          requestId,
          phase: 'loading',
          listing: previous?.listing ?? null,
        }
      },
      resolveDirectory: (draft, key: string, requestId: number, listing: WorkspaceDirectoryListing) => {
        const current = draft.directories[key]
        if (current?.requestId !== requestId) return
        current.phase = 'ready'
        current.listing = listing
      },
      rejectDirectory: (draft, key: string, requestId: number) => {
        const current = draft.directories[key]
        if (current?.requestId !== requestId) return
        current.phase = 'error'
      },
      beginPreview: (draft, file: WorkspaceFileLocator, requestId: number) => {
        draft.preview = {
          requestId, phase: 'loading', file: { segments: [...file.segments] }, value: null,
        }
      },
      resolvePreview: (draft, requestId: number, value: WorkspaceFilePreview) => {
        if (draft.preview?.requestId !== requestId) return
        draft.preview.phase = 'ready'
        draft.preview.value = value
      },
      commitPreview: (draft, value: WorkspaceFilePreview) => {
        if (draft.preview === null || locatorKey(draft.preview.file) !== locatorKey(value.file)) return
        draft.preview.phase = 'ready'
        draft.preview.value = value
      },
      rejectPreview: (draft, requestId: number) => {
        if (draft.preview?.requestId !== requestId) return
        draft.preview.phase = 'error'
      },
      cancelPending: (draft) => {
        const directories: Record<string, DirectoryCell> = {}
        for (const [key, cell] of Object.entries(draft.directories)) {
          if (cell.phase === 'loading' && cell.listing === null) continue
          if (cell.phase === 'loading') cell.phase = 'ready'
          directories[key] = cell
        }
        draft.directories = directories
        if (draft.preview?.phase === 'loading') draft.preview = null
      },
    },
  })
}
