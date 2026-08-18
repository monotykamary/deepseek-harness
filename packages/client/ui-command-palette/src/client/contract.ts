/** Component contract for the frame-wide command palette entry. */
import type { PropsLocale, PropsRuntime } from '@monotykamary/dsh-client-ui-slots'
import type {
  SessionId, SessionSearchResultItem, WorkspaceId,
} from '@monotykamary/dsh-client-runtime/client'
// Type-only: installs the shell.overlay SlotMap declaration.
import type {} from '@monotykamary/dsh-client-ui-layout/client'

/** Root-domain operations supplied to the command palette. */
export interface CommandPaletteInjected {
  /** Open an existing visible Session. */
  openSession: (sessionId: SessionId) => void
  /** Resolve and open the reusable or newly created blank Session. */
  startSession: (workspaceId?: WorkspaceId) => Promise<void>
  /** Search visible persisted message content; cancellation supersedes an older query. */
  searchSessions: (
    query: string,
    signal: AbortSignal,
  ) => Promise<{ items: readonly SessionSearchResultItem[]; hasMore: boolean }>
  /** Host-fixed maximum for one merged Session result page. */
  searchResultLimit: number
}

/** Full component props: root runtime hooks, domain operations, and localized copy. */
export type CommandPaletteProps =
  PropsRuntime<'shell.overlay'>
  & CommandPaletteInjected
  & PropsLocale<'commandPalette'>
