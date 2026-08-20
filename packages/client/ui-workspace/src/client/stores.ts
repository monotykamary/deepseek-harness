/**
 * The workspace browser's viewing store: the session-list grouping mode,
 * persisted across reloads. Module level exports the factory only (a
 * module-level handle would pin the store identity across plugin reloads);
 * register() receives the factory and the browser derives its PropsStore
 * share from the return type.
 */
import {
  defineStore, type EngineStoreHandle, type WorkspaceId,
} from '@monotykamary/dsh-client-runtime/client'

/** Browser-local order account for the hierarchy-free flat Session list. */
export const FLAT_SESSION_ORDER_KEY = '__flat_session_order__'

/** Session-list grouping mode: workspace sections or one flat recency list. */
export type SessionGroupBy = 'workspace' | 'flat'
/** Session order: user-arranged only, or user-arranged plus activity promotion. */
export type SessionOrderBy = 'manual' | 'updated'

/** Workspace browser viewing state persisted across surface remounts and reloads. */
type WorkspaceViewState = {
  /** Workspace whose Sessions remain visible, or null for every Workspace. */
  workspaceScope: WorkspaceId | null
  groupBy: SessionGroupBy
  orderBy: SessionOrderBy
  /** Explicit zero-or-five-session state keyed by Workspace group identity. */
  groupExpansion: Record<string, boolean>
  /** Whether inactivity-settled Sessions are revealed below the active list. */
  settledShelfExpanded?: boolean
  /** Session ids the user settled explicitly (shelf membership independent of inactivity). */
  explicitlySettledSessionIds?: string[]
  /** Auto-settled session ids the user pinned back into the active list (un-settle). */
  pinnedActiveSessionIds?: string[]
  /** Wake time (epoch ms) per snoozed Session; the row hides until then. */
  snoozedUntilBySession?: Record<string, number>
  /** Whether the snoozed shelf reveals its rows (default collapsed). */
  snoozedShelfExpanded?: boolean
  /** Shared editable order per Workspace group plus the browser-local flat-list account. */
  sessionOrderByAccount: Record<string, string[]>
  /** Last observed update timestamps per order account for one-time promotion events. */
  sessionUpdatedAtByAccount: Record<string, Record<string, number>>
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type WorkspaceViewActions = {
  setWorkspaceScope: (draft: WorkspaceViewState, workspaceId: WorkspaceId | null) => void
  setGroupBy: (draft: WorkspaceViewState, mode: SessionGroupBy) => void
  setOrderBy: (draft: WorkspaceViewState, mode: SessionOrderBy) => void
  setGroupExpanded: (draft: WorkspaceViewState, key: string, expanded: boolean) => void
  setSettledShelfExpanded: (draft: WorkspaceViewState, expanded: boolean) => void
  setSnoozedShelfExpanded: (draft: WorkspaceViewState, expanded: boolean) => void
  /** Settle a Session into the history shelf (also clears any snooze: settle parks it for good). */
  settleSession: (draft: WorkspaceViewState, sessionId: string) => void
  /** Un-settle a Session: clear an explicit settle; pin an auto-settled row back into the active list. */
  unsettleSession: (draft: WorkspaceViewState, sessionId: string) => void
  /** Snooze a Session until the given epoch ms (hidden wins: leaves both settle sets). */
  snoozeSession: (draft: WorkspaceViewState, sessionId: string, until: number) => void
  /** Wake a Session now / dismiss its Woke indicator. */
  wakeSession: (draft: WorkspaceViewState, sessionId: string) => void
  retainAccountKeys: (draft: WorkspaceViewState, workspaceKeys: readonly string[]) => void
  syncSessionOrderAccount: (
    draft: WorkspaceViewState,
    accountKey: string,
    order: string[],
    updatedAt: Record<string, number>,
  ) => void
  setSessionOrder: (draft: WorkspaceViewState, accountKey: string, order: string[]) => void
}

/**
 * Create the workspace browser viewing store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWorkspaceViewStore(): EngineStoreHandle<WorkspaceViewState, WorkspaceViewActions> {
  return defineStore({
    init: (): WorkspaceViewState => ({
      workspaceScope: null,
      groupBy: 'flat',
      orderBy: 'updated',
      groupExpansion: {},
      settledShelfExpanded: false,
      explicitlySettledSessionIds: [],
      pinnedActiveSessionIds: [],
      snoozedUntilBySession: {},
      snoozedShelfExpanded: false,
      sessionOrderByAccount: {},
      sessionUpdatedAtByAccount: {},
    }),
    persist: 'dsh.workspace.view.v6',
    actions: {
      setWorkspaceScope: (d, workspaceId: WorkspaceId | null) => { d.workspaceScope = workspaceId },
      setGroupBy: (d, mode: SessionGroupBy) => { d.groupBy = mode },
      setOrderBy: (d, mode: SessionOrderBy) => { d.orderBy = mode },
      setGroupExpanded: (d, key: string, expanded: boolean) => { d.groupExpansion[key] = expanded },
      setSettledShelfExpanded: (d, expanded: boolean) => { d.settledShelfExpanded = expanded },
      setSnoozedShelfExpanded: (d, expanded: boolean) => { d.snoozedShelfExpanded = expanded },
      // The rehydrated shape may predate these fields (older localStorage
      // blobs): every mutator initializes its collections before touching them.
      settleSession: (d, sessionId: string) => {
        d.explicitlySettledSessionIds ??= []
        d.pinnedActiveSessionIds ??= []
        d.snoozedUntilBySession ??= {}
        if (!d.explicitlySettledSessionIds.includes(sessionId)) d.explicitlySettledSessionIds.push(sessionId)
        d.pinnedActiveSessionIds = d.pinnedActiveSessionIds.filter(id => id !== sessionId)
        d.snoozedUntilBySession = Object.fromEntries(
          Object.entries(d.snoozedUntilBySession).filter(([id]) => id !== sessionId),
        )
      },
      unsettleSession: (d, sessionId: string) => {
        d.explicitlySettledSessionIds ??= []
        d.pinnedActiveSessionIds ??= []
        d.explicitlySettledSessionIds = d.explicitlySettledSessionIds.filter(id => id !== sessionId)
        if (!d.pinnedActiveSessionIds.includes(sessionId)) d.pinnedActiveSessionIds.push(sessionId)
      },
      snoozeSession: (d, sessionId: string, until: number) => {
        d.snoozedUntilBySession ??= {}
        d.explicitlySettledSessionIds ??= []
        d.pinnedActiveSessionIds ??= []
        d.snoozedUntilBySession[sessionId] = until
        d.explicitlySettledSessionIds = d.explicitlySettledSessionIds.filter(id => id !== sessionId)
        d.pinnedActiveSessionIds = d.pinnedActiveSessionIds.filter(id => id !== sessionId)
      },
      wakeSession: (d, sessionId: string) => {
        d.snoozedUntilBySession ??= {}
        d.snoozedUntilBySession = Object.fromEntries(
          Object.entries(d.snoozedUntilBySession).filter(([id]) => id !== sessionId),
        )
      },
      retainAccountKeys: (d, workspaceKeys: readonly string[]) => {
        const retained = new Set(workspaceKeys)
        if (d.workspaceScope !== null && !retained.has(d.workspaceScope)) d.workspaceScope = null
        d.groupExpansion = Object.fromEntries(
          Object.entries(d.groupExpansion).filter(([key]) => retained.has(key)),
        )
        d.sessionOrderByAccount = Object.fromEntries(
          Object.entries(d.sessionOrderByAccount).filter(([key]) => retained.has(key)),
        )
        d.sessionUpdatedAtByAccount = Object.fromEntries(
          Object.entries(d.sessionUpdatedAtByAccount).filter(([key]) => retained.has(key)),
        )
      },
      syncSessionOrderAccount: (d, accountKey: string, order: string[], updatedAt: Record<string, number>) => {
        d.sessionOrderByAccount[accountKey] = order
        d.sessionUpdatedAtByAccount[accountKey] = updatedAt
      },
      setSessionOrder: (d, accountKey: string, order: string[]) => {
        d.sessionOrderByAccount[accountKey] = order
      },
    },
  })
}
