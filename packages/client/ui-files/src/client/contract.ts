import type {
  WorkspaceDirectoryListing, WorkspaceFileLocator, WorkspaceFilePreview, WorkspaceFileVersion,
  WorkspaceFileWriteResult,
} from '@monotykamary/dsh-api-remotes/client'
import type {
  InjectFace, PropsLocale, PropsRuntime, PropsStore,
} from '@monotykamary/dsh-client-ui-slots'
import type { createFilesStore } from './store.ts'
import type { NS } from './locales.ts'

/** Files-surface Remote callbacks bound to the current Session. */
export interface FilesInjected {
  /** List one direct workspace directory. */
  list: (directory: WorkspaceFileLocator, signal?: AbortSignal) => Promise<WorkspaceDirectoryListing>
  /** Read one bounded workspace file with its guarded-write version. */
  read: (file: WorkspaceFileLocator, signal?: AbortSignal) => Promise<WorkspaceFilePreview>
  /** Replace one previously read text file when its provider version remains current. */
  write: (
    file: WorkspaceFileLocator,
    content: string,
    expectedVersion: WorkspaceFileVersion,
    signal?: AbortSignal,
  ) => Promise<WorkspaceFileWriteResult>
}

/** Full props of the session-scoped Files workbench surface. */
export type FilesPanelProps =
  & PropsRuntime<'workbench.surface'>
  & PropsStore<ReturnType<typeof createFilesStore>>
  & InjectFace<FilesInjected>
  & PropsLocale<typeof NS>
