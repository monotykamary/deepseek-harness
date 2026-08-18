/** Browser plugin registering the Files workbench surface and session-header opener. */
import type { ClientContext, SessionId } from '@monotykamary/dsh-client-runtime/client'
import type {
  WorkspaceDirectoryListing, WorkspaceFileLocator, WorkspaceFilePreview, WorkspaceFileVersion,
  WorkspaceFileWriteResult,
} from '@monotykamary/dsh-api-remotes/client'
import type { WorkbenchSurfaceId } from '@monotykamary/dsh-client-ui-workbench/client'
import type {} from '@monotykamary/dsh-client-ui-conversation/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import { FilesHeaderAction } from './FilesHeaderAction.tsx'
import { FilesPanel } from './FilesPanel.tsx'
import type { FilesHeaderInjected, FilesInjected } from './contract.ts'
import { en, NS, zh, type FilesKey } from './locales.ts'
import { createFilesStore } from './store.ts'

const FILES_SURFACE_ID = 'files' as WorkbenchSurfaceId

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workspace file tree and preview copy. */
    files: FilesKey
  }
}

/** Required services for Remote file operations, workbench navigation, slots, and locale. */
export const inject = ['slots', 'locale', 'workbench', 'remote', 'remote.workspaceFiles']

function remoteFailure(operation: 'list' | 'read' | 'write', result: { error: { code: string; message: string } }): Error {
  return new Error(`workspaceFiles.${operation} failed: ${result.error.code}: ${result.error.message}`)
}

/**
 * Register Files as a workbench surface and session-header action.
 * @param ctx - Client context carrying the selected Remote namespace and UI services.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-files: dictionaries')
  const t = ctx.locale.bind(NS)

  const list = async (
    sessionId: SessionId,
    directory: WorkspaceFileLocator,
    signal?: AbortSignal,
  ): Promise<WorkspaceDirectoryListing> => {
    const result = await ctx.remote.workspaceFiles.list(sessionId, directory, signal)
    if (!result.ok) throw remoteFailure('list', result)
    return result.value
  }
  const read = async (
    sessionId: SessionId,
    file: WorkspaceFileLocator,
    signal?: AbortSignal,
  ): Promise<WorkspaceFilePreview> => {
    const result = await ctx.remote.workspaceFiles.read(sessionId, file, signal)
    if (!result.ok) throw remoteFailure('read', result)
    return result.value
  }
  const write = async (
    sessionId: SessionId,
    file: WorkspaceFileLocator,
    content: string,
    expectedVersion: WorkspaceFileVersion,
    signal?: AbortSignal,
  ): Promise<WorkspaceFileWriteResult> => {
    const result = await ctx.remote.workspaceFiles.write(sessionId, file, content, expectedVersion, signal)
    if (!result.ok) throw remoteFailure('write', result)
    return result.value
  }

  ctx.effect(() => ctx.workbench.registerPresentation(FILES_SURFACE_ID, {
    icon: 'files',
    description: () => t('launcher.description'),
  }), 'ui-files: Files workbench presentation')
  ctx.slots.inject('workbench.surface', () => ctx.slots.register({
    name: 'workbench.surface',
    id: FILES_SURFACE_ID,
    order: 20,
    label: () => t('tab'),
    locale: NS,
    store: createFilesStore,
    inject: (sessionId: SessionId): FilesInjected => ({
      list: (directory, signal) => list(sessionId, directory, signal),
      read: (file, signal) => read(sessionId, file, signal),
      write: (file, content, version, signal) => write(sessionId, file, content, version, signal),
    }),
  }, FilesPanel))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'workspace-files',
    order: 30,
    locale: NS,
    inject: (): FilesHeaderInjected => ({
      openFiles: () => { ctx.workbench.open(FILES_SURFACE_ID) },
    }),
  }, FilesHeaderAction))
}
