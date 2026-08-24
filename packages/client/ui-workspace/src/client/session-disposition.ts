/** Shared Session disposition over one authoritative policy and override store. */
import { Service } from '@monotykamary/cordis'
import type { Context } from '@monotykamary/cordis'
import {
  createSnapshotStore,
  type SessionId,
  type SettingsScope,
  type SnapshotStore,
} from '@monotykamary/dsh-client-runtime/client'
import { SHIPPED_WORKSPACE_SETTINGS, type WorkspaceSettings } from '../settled-settings.ts'
import { deriveShelfSets } from './tree.ts'
import type { SessionDispositionContract, SessionDispositionSnapshot } from './contract/disposition.ts'

const MINUTE_MS = 60_000
const MAX_TIMER_MS = 2_147_483_647
const PERSIST_KEY = 'dsh.workspace.session-disposition.v1'

interface SessionDispositionOverrides {
  explicitlySettledSessionIds: SessionId[]
  pinnedActiveSessionIds: SessionId[]
  snoozedUntilBySession: Record<string, number>
}

const EMPTY_SNAPSHOT: SessionDispositionSnapshot = {
  settledSessionIds: [],
  snoozedUntilBySession: {},
  wokeSessionIds: [],
}

function sameIds(left: readonly SessionId[], right: readonly SessionId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function sameSnoozes(left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>): boolean {
  const leftEntries = Object.entries(left)
  const rightKeys = Object.keys(right)
  return leftEntries.length === rightKeys.length && leftEntries.every(([id, until]) => right[id] === until)
}

function sameSnapshot(left: SessionDispositionSnapshot, right: SessionDispositionSnapshot): boolean {
  return sameIds(left.settledSessionIds, right.settledSessionIds)
    && sameSnoozes(left.snoozedUntilBySession, right.snoozedUntilBySession)
    && sameIds(left.wokeSessionIds, right.wokeSessionIds)
}

/** Resolve the effective inactivity threshold from the settings capability. */
function autoSettleAfterDays(settings: SettingsScope<WorkspaceSettings>): number | null {
  const snapshot = settings.getSnapshot()
  const value = snapshot.value
    ?? (snapshot.status === 'unavailable' ? SHIPPED_WORKSPACE_SETTINGS : undefined)
  return value?.autoSettleInactive === true ? value.autoSettleAfterDays : null
}

/** Browser-local Session disposition shared by every application projection. */
export class SessionDispositionService extends Service implements SessionDispositionContract {
  readonly state: SnapshotStore<SessionDispositionSnapshot> = createSnapshotStore(EMPTY_SNAPSHOT)

  private readonly overrides = createSnapshotStore<SessionDispositionOverrides>({
    explicitlySettledSessionIds: [],
    pinnedActiveSessionIds: [],
    snoozedUntilBySession: {},
  }, { persist: { name: PERSIST_KEY } })

  private timer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param ctx - Client context carrying Session state.
   * @param settings - Resolved Workspace settlement policy.
   */
  constructor(ctx: Context, private readonly settings: SettingsScope<WorkspaceSettings>) {
    super(ctx, 'sessionDisposition')
    ctx.effect(() => {
      const reconcile = (): void => { this.reconcile() }
      const disposers = [ctx.sessions.list.subscribe(reconcile), settings.subscribe(reconcile), this.overrides.subscribe(reconcile)]
      this.reconcile()
      return () => {
        for (const dispose of disposers) dispose()
        if (this.timer !== undefined) clearTimeout(this.timer)
      }
    }, 'ui-workspace: shared Session disposition')
  }

  settleSession(sessionId: SessionId): void {
    this.overrides.update((draft) => {
      if (!draft.explicitlySettledSessionIds.includes(sessionId)) draft.explicitlySettledSessionIds.push(sessionId)
      if (draft.pinnedActiveSessionIds.includes(sessionId)) {
        draft.pinnedActiveSessionIds = draft.pinnedActiveSessionIds.filter(id => id !== sessionId)
      }
      if (Object.hasOwn(draft.snoozedUntilBySession, sessionId)) {
        const { [sessionId]: _removed, ...remaining } = draft.snoozedUntilBySession
        draft.snoozedUntilBySession = remaining
      }
    })
  }

  unsettleSession(sessionId: SessionId): void {
    this.overrides.update((draft) => {
      if (draft.explicitlySettledSessionIds.includes(sessionId)) {
        draft.explicitlySettledSessionIds = draft.explicitlySettledSessionIds.filter(id => id !== sessionId)
      }
      if (!draft.pinnedActiveSessionIds.includes(sessionId)) draft.pinnedActiveSessionIds.push(sessionId)
    })
  }

  snoozeSession(sessionId: SessionId, until: number): void {
    this.overrides.update((draft) => {
      draft.snoozedUntilBySession[sessionId] = until
      if (draft.explicitlySettledSessionIds.includes(sessionId)) {
        draft.explicitlySettledSessionIds = draft.explicitlySettledSessionIds.filter(id => id !== sessionId)
      }
      if (draft.pinnedActiveSessionIds.includes(sessionId)) {
        draft.pinnedActiveSessionIds = draft.pinnedActiveSessionIds.filter(id => id !== sessionId)
      }
    })
  }

  wakeSession(sessionId: SessionId): void {
    this.overrides.update((draft) => {
      if (Object.hasOwn(draft.snoozedUntilBySession, sessionId)) {
        const { [sessionId]: _removed, ...remaining } = draft.snoozedUntilBySession
        draft.snoozedUntilBySession = remaining
      }
    })
  }

  private reconcile(): void {
    const now = Date.now()
    const overrides = this.overrides.getSnapshot()
    const sessions = this.ctx.sessions.list.getSnapshot()
    const days = autoSettleAfterDays(this.settings)
    const shelf = deriveShelfSets(
      sessions,
      now,
      days,
      overrides.explicitlySettledSessionIds,
      overrides.pinnedActiveSessionIds,
      overrides.snoozedUntilBySession,
    )
    const next: SessionDispositionSnapshot = {
      settledSessionIds: sessions.ids.filter(id => shelf.settledIds.has(id)),
      snoozedUntilBySession: shelf.snoozedUntil,
      wokeSessionIds: sessions.ids.filter(id => shelf.wokeIds.has(id)),
    }
    if (!sameSnapshot(this.state.getSnapshot(), next)) this.state.set(next)
    this.schedule(now, days, overrides.snoozedUntilBySession)
  }

  private schedule(now: number, days: number | null, snoozes: Readonly<Record<string, number>>): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    let delay = days === null ? Number.POSITIVE_INFINITY : MINUTE_MS - now % MINUTE_MS
    for (const until of Object.values(snoozes)) {
      if (until > now) delay = Math.min(delay, until - now)
    }
    if (!Number.isFinite(delay)) return
    this.timer = setTimeout(() => { this.reconcile() }, Math.max(1, Math.min(delay, MAX_TIMER_MS)))
  }
}
