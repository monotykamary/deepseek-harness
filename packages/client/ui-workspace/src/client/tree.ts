/**
 * Derives the workspace browser tree from Host Workspace order and membership.
 * Unassigned Sessions trail under Ungrouped; blank Sessions (nothing started)
 * expose only the selected provisional row until the first prompt converts it.
 */
import {
  indexSubagentDescendants, type PendingInteractionStatus, type SessionId, type SessionListState,
  type SessionSearchResultItem, type SessionSummary, type SubagentDescendantSummary,
  type WorkspaceId, type WorkspaceView,
} from '@monotykamary/dsh-client-runtime/client'

/** Group key for Sessions outside every Workspace. */
export const UNGROUPED_KEY = ''

/** Display label for the ungrouped bucket row. */
export const UNGROUPED_LABEL = 'Ungrouped'

const DAY_MS = 24 * 60 * 60 * 1000

/** One top-level session row in a group or the flat list. */
export interface SessionNode {
  id: SessionId
  /** Workspace display label shown in the card header. */
  workspace: string
  /** Git branch of the session's working tree, shown as the card's context label. */
  branch?: string
  /** Stored display title. */
  title: string
  /** Selected provisional session with no first prompt yet; omitted for ordinary rows. */
  blank?: boolean
  /** The runtime Session list reports an interaction awaiting this user. */
  pendingInteraction?: PendingInteractionStatus
  running: boolean
  /** Running descendants connected through uninterrupted subagent-origin lineage. */
  runningSubagentCount: number
  /** Finished running while not selected and not yet opened (the green "done" reminder dot). */
  completed: boolean
  updatedAt: number
}

/** Session order selected by the Workspace browser. */
export type SessionOrderBy = 'manual' | 'updated'

/** One workspace group section: header row facts + visible top-level session rows. */
export interface GroupNode {
  /** Group key: the workspace id or {@link UNGROUPED_KEY}. */
  key: string
  /** Backing Workspace id; absent only for the ungrouped bucket. */
  workspaceId: WorkspaceId | undefined
  cwd: string | undefined
  /** Workspace creation time (epoch ms); absent only for the ungrouped bucket. */
  createdAt: number | undefined
  label: string
  /** Total visible sessions in the group. */
  sessionCount: number
  expanded: boolean
  /** The group contains the selected session (active folder tint; supplied here so the renderer never scans). */
  containsCurrent: boolean
  /** Visible session rows (empty while the group is folded). */
  sessions: readonly SessionNode[]
}

/** One flat search row combining list metadata with an optional content match. */
export interface SearchResultNode {
  id: SessionId
  title: string
  workspace: string
  /** The runtime Session list reports an interaction awaiting this user. */
  pendingInteraction?: PendingInteractionStatus
  running: boolean
  /** Running descendants connected through uninterrupted subagent-origin lineage. */
  runningSubagentCount: number
  /** Finished running while not selected and not yet opened (the green "done" reminder dot). */
  completed: boolean
  snippet?: string
}

/** Bounded merged search projection plus the refine-query hint bit. */
export interface SearchResultSet {
  items: readonly SearchResultNode[]
  hasMore: boolean
}

/** Viewing state consumed by the derivation. */
export interface TreeView {
  expandedGroups: readonly string[]
  /** Browser-local order for Sessions without a backing Workspace account. */
  ungroupedOrder?: readonly string[]
}

interface Group {
  key: string
  workspaceId: WorkspaceId | undefined
  cwd: string | undefined
  createdAt: number | undefined
  label: string
  sessions: SessionSummary[]
}

/**
 * Directory display label: basename of the path (both separators accepted).
 * Ungrouped-bucket fallback for surfaces without a workspace title.
 * @param cwd - directory path, or undefined for the ungrouped bucket.
 * @returns basename, the raw cwd when it has no basename, or the ungrouped label.
 */
export function workspaceLabel(cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return UNGROUPED_LABEL
  const base = cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
  return base !== undefined && base !== '' ? base : cwd
}

/** Recency comparator: newest first, id as the deterministic tiebreak (ids are unique per group). */
function byRecency(a: SessionSummary, b: SessionSummary): number {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
  return a.id < b.id ? -1 : 1
}

/**
 * Ordinary sessions are visible; blank sessions (nothing started yet) never
 * materialize as sidebar rows. Subagent children use their parent header catalog; archived
 * sessions are visible nowhere, while their accounting slots remain so
 * unarchiving restores position.
 */
function sessionVisible(session: SessionSummary, _current: SessionId | undefined, archived: ReadonlySet<SessionId>): boolean {
  return session.origin !== 'subagent'
    && !archived.has(session.id)
    && !session.blank
}

/** Display title for one sidebar row, including the provisional blank label. */
function sessionTitle(session: SessionSummary): string {
  return session.blank ? 'New Session' : session.displayTitle
}

/** Build one group without projecting session lineage into presentation. */
function buildGroup(
  key: string,
  workspaceId: WorkspaceId | undefined,
  cwd: string | undefined,
  createdAt: number | undefined,
  label: string,
  members: readonly SessionSummary[],
  order: 'account' | 'recency',
): Group {
  const sessions = [...members]
  // Real Workspace order comes from sessionIds. Ungrouped falls back to
  // recency until the browser supplies its persisted local order.
  if (order === 'recency') sessions.sort(byRecency)
  return { key, workspaceId, cwd, createdAt, label, sessions }
}

/** Apply a stored Ungrouped order and append newly loose Sessions by recency. */
function orderedUngrouped(members: readonly SessionSummary[], stored: readonly string[]): SessionSummary[] {
  const byId = new Map(members.map(session => [session.id as string, session]))
  const included = new Set<string>()
  const ordered: SessionSummary[] = []
  for (const key of stored) {
    const session = byId.get(key)
    if (session === undefined || included.has(key)) continue
    ordered.push(session)
    included.add(key)
  }
  for (const session of [...members].sort(byRecency)) {
    if (included.has(session.id)) continue
    ordered.push(session)
  }
  return ordered
}

/**
 * Group Sessions by Host Workspace: one group per entity in stable Host
 * order, with members resolved from sessionIds in their stored order. Sessions
 * outside every Workspace trail in the browser-local Ungrouped order, which
 * falls back to recency before that order is initialized.
 */
function groupByWorkspace(
  list: SessionListState,
  workspaces: readonly WorkspaceView[],
  archived: ReadonlySet<SessionId>,
  shelved: ReadonlySet<SessionId>,
  ungroupedOrder: readonly string[] | undefined,
): Group[] {
  const groups: Group[] = []
  const accounted = new Set<SessionId>()
  for (const workspace of workspaces) {
    const members: SessionSummary[] = []
    for (const id of workspace.sessionIds) {
      const summary = list.byId[id]
      if (summary === undefined) continue // account may lead the list pull; the row appears when the summary lands
      accounted.add(id)
      if (!sessionVisible(summary, list.current, archived) || shelved.has(summary.id)) continue
      members.push(summary)
    }
    groups.push(buildGroup(
      workspace.workspaceId, workspace.workspaceId, workspace.path,
      Date.parse(workspace.createdAt), workspace.title, members, 'account',
    ))
  }
  const stray = list.ids
    .map(id => list.byId[id])
    .filter((s): s is SessionSummary =>
      s !== undefined && !accounted.has(s.id) && !shelved.has(s.id)
      && sessionVisible(s, list.current, archived))
  if (stray.length > 0) {
    groups.push(buildGroup(
      UNGROUPED_KEY,
      undefined,
      undefined,
      undefined,
      UNGROUPED_LABEL,
      ungroupedOrder === undefined ? stray : orderedUngrouped(stray, ungroupedOrder),
      ungroupedOrder === undefined ? 'recency' : 'account',
    ))
  }
  return groups
}

function sessionNode(
  s: SessionSummary,
  descendants: ReadonlyMap<SessionId, SubagentDescendantSummary>,
  workspace: string,
): SessionNode {
  return {
    id: s.id,
    workspace,
    ...(s.branch === undefined ? {} : { branch: s.branch }),
    title: sessionTitle(s),
    blank: s.blank,
    running: s.running,
    runningSubagentCount: descendants.get(s.id)?.runningCount ?? 0,
    completed: s.completed === true,
    updatedAt: s.updatedAt,
    ...(s.pendingInteraction === undefined ? {} : { pendingInteraction: s.pendingInteraction }),
  }
}

/**
 * Classify inactivity-settled Sessions while retaining every actionable or live row.
 * The current Session, blanks, unread completions, pending interaction, running
 * parents/descendants, and live background jobs never enter the shelf. Settled
 * jobs extend the activity clock through their finish time.
 * @param list - complete Session list and job projection.
 * @param now - current epoch milliseconds.
 * @param autoSettleAfterDays - whole inactive days, or null to disable automatic settlement.
 * @returns Session ids ordered like the source list; presentation sorts its shelf independently.
 */
export function deriveAutoSettledSessionIds(
  list: SessionListState,
  now: number,
  autoSettleAfterDays: number | null,
): SessionId[] {
  if (autoSettleAfterDays === null) return []
  const cutoff = now - autoSettleAfterDays * DAY_MS
  const descendants = indexSubagentDescendants(list.byId)
  const settled: SessionId[] = []
  for (const id of list.ids) {
    const session = list.byId[id]
    if (session === undefined
      || session.id === list.current
      || session.origin === 'subagent'
      || session.blank
      || session.running
      || session.pendingInteraction !== undefined
      || session.completed === true
      || (descendants.get(session.id)?.runningCount ?? 0) > 0) continue
    let lastActivityAt = session.updatedAt
    let liveJob = false
    for (const job of list.jobsBySession[session.id] ?? []) {
      if (job.status === 'running' || job.status === 'stopping') liveJob = true
      lastActivityAt = Math.max(lastActivityAt, job.finishedAt ?? job.startedAt)
    }
    if (!liveJob && lastActivityAt < cutoff) settled.push(session.id)
  }
  return settled
}

/**
 * Shelf membership derived from the inactivity policy plus the user's
 * settle/snooze overrides.
 */
export interface SessionShelfSets {
  /** Session ids in the settled shelf: inactivity-settled or explicitly settled, minus keep-active pins. */
  settledIds: ReadonlySet<SessionId>
  /** Wake time (epoch ms) per still-snoozed Session (wake still in the future). */
  snoozedUntil: Readonly<Record<string, number>>
  /** Session ids whose snooze elapsed (or raised a pending interaction): back in the active list with the Woke pill. */
  wokeIds: ReadonlySet<SessionId>
}

/**
 * Combine the inactivity policy with the user's shelf overrides. A settle
 * parks the Session until un-settled; an un-settle clears an explicit settle
 * and pins an auto-settled row back into the active list. A snooze hides the
 * row until its wake time, then returns it with the Woke pill — a pending
 * interaction wakes it early so blocked-on-you work is never hidden.
 * @param list - complete Session list snapshot.
 * @param now - current epoch milliseconds.
 * @param autoSettleAfterDays - whole inactive days, or null to disable automatic settlement.
 * @param explicitlySettledSessionIds - user-settled Session ids (persisted browser state).
 * @param pinnedActiveSessionIds - user-un-settled ids pinned out of auto-settlement.
 * @param snoozedUntilBySession - wake time per snoozed Session (persisted browser state).
 * @returns the three shelf memberships.
 */
export function deriveShelfSets(
  list: SessionListState,
  now: number,
  autoSettleAfterDays: number | null,
  explicitlySettledSessionIds: readonly string[] | undefined,
  pinnedActiveSessionIds: readonly string[] | undefined,
  snoozedUntilBySession: Readonly<Record<string, number>> | undefined,
): SessionShelfSets {
  const autoSettled = deriveAutoSettledSessionIds(list, now, autoSettleAfterDays)
  const auto = new Set(autoSettled)
  const pinned = new Set(pinnedActiveSessionIds ?? [])
  const explicit = new Set(explicitlySettledSessionIds ?? [])
  const settledIds = new Set<SessionId>()
  const snoozedUntil: Record<string, number> = {}
  const wokeIds = new Set<SessionId>()
  for (const id of list.ids) {
    if (pinned.has(id)) continue
    if (auto.has(id) || explicit.has(id)) settledIds.add(id)
  }
  for (const [id, until] of Object.entries(snoozedUntilBySession ?? {})) {
    const session = list.byId[id as SessionId]
    if (session === undefined) continue
    if (until > now && session.pendingInteraction === undefined) snoozedUntil[id] = until
    else wokeIds.add(session.id)
  }
  return { settledIds, snoozedUntil, wokeIds }
}

/**
 * Derive the workspace browser groups with every session as a top-level row.
 *
 * Every group shows; sessions populate under expanded groups in the selected
 * local order. Blank sessions are excluded everywhere; archived sessions are
 * excluded everywhere.
 * Content search lives outside this derivation
 * (see {@link deriveSearchResults}).
 * @param list - sessions list snapshot (`current` feeds containsCurrent).
 * @param workspaces - real workspaces in stable Host order.
 * @param archivedSessionIds - registry-global archive set.
 * @param view - local expansion arrays.
 * @param shelvedSessionIds - auto-settled rows rendered by the separate history shelf.
 * @returns group sections in render order.
 */
export function deriveGroups(
  list: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly SessionId[],
  view: TreeView,
  shelvedSessionIds: readonly SessionId[] = [],
): GroupNode[] {
  const archived = new Set(archivedSessionIds)
  const shelved = new Set(shelvedSessionIds)
  const expandedGroups = new Set(view.expandedGroups)
  const descendants = indexSubagentDescendants(list.byId)
  const currentGroup = list.current === undefined
    ? undefined
    : (workspaces.find(w => w.sessionIds.includes(list.current as SessionId))?.workspaceId as string | undefined)
        ?? UNGROUPED_KEY
  const groups: GroupNode[] = []
  for (const g of groupByWorkspace(list, workspaces, archived, shelved, view.ungroupedOrder)) {
    const expanded = expandedGroups.has(g.key)
    groups.push({
      key: g.key,
      workspaceId: g.workspaceId,
      cwd: g.cwd,
      createdAt: g.createdAt,
      label: g.label,
      sessionCount: g.sessions.length,
      expanded,
      containsCurrent: g.key === currentGroup,
      sessions: expanded ? g.sessions.map(session => sessionNode(session, descendants, g.label)) : [],
    })
  }
  return groups
}

/**
 * Derive the flat session list ("In one list" mode): every session — fork
 * children included — as a top-level row, strictly newest-first. No grouping,
 * no parent/child adjacency. Content search lives outside this derivation
 * (see {@link deriveSearchResults}).
 * @param list - sessions list snapshot.
 * @param archivedSessionIds - registry-global archive set.
 * @param shelvedSessionIds - auto-settled rows rendered by the separate history shelf.
 * @returns flat rows in render order.
 */
export function deriveFlat(
  list: SessionListState,
  archivedSessionIds: readonly SessionId[],
  shelvedSessionIds: readonly SessionId[] = [],
): SessionNode[] {
  const archived = new Set(archivedSessionIds)
  const shelved = new Set(shelvedSessionIds)
  const descendants = indexSubagentDescendants(list.byId)
  const rows: SessionSummary[] = []
  for (const id of list.ids) {
    const s = list.byId[id]
    if (s === undefined || shelved.has(s.id) || !sessionVisible(s, list.current, archived)) continue
    rows.push(s)
  }
  rows.sort(byRecency)
  return rows.map(session => sessionNode(session, descendants, workspaceLabel(session.cwd)))
}

/** Relative-time bucket of a session row's trailing label. */
export type RelativeTimeUnit = 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years'

/** Structured relative time: the bucket plus its magnitude (0 for 'now'). */
export interface RelativeTime {
  unit: RelativeTimeUnit
  n: number
}

/**
 * Merge immediate title/Workspace substring matches with ranked Host content
 * matches. Local rows lead newest-first, content-only rows retain backend
 * order, and duplicate sessions receive the backend snippet in place.
 * @param list - session metadata authority.
 * @param workspaces - Workspace membership and display labels.
 * @param query - caller text; surrounding whitespace is ignored.
 * @param archivedSessionIds - registry-global archive set (members never match).
 * @param content - ranked Host content-search page.
 * @param limit - protocol-owned maximum merged row count.
 * @param workspaceScope - optional Workspace whose membership limits both local and content matches.
 * @returns bounded deduplicated flat rows and a refine-query hint bit.
 */
export function deriveSearchResults(
  list: SessionListState,
  workspaces: readonly WorkspaceView[],
  query: string,
  archivedSessionIds: readonly SessionId[],
  content: { items: readonly SessionSearchResultItem[]; hasMore: boolean },
  limit: number,
  workspaceScope?: WorkspaceId,
): SearchResultSet {
  const q = query.trim().toLowerCase()
  if (q === '') return { items: [], hasMore: false }
  const archived = new Set(archivedSessionIds)
  const scopedSessionIds = workspaceScope === undefined
    ? null
    : new Set(workspaces.find(workspace => workspace.workspaceId === workspaceScope)?.sessionIds ?? [])
  const inScope = (sessionId: SessionId): boolean =>
    scopedSessionIds === null || scopedSessionIds.has(sessionId)
  const descendants = indexSubagentDescendants(list.byId)

  const workspaceBySession = new Map<SessionId, string>()
  for (const workspace of workspaces) {
    for (const sessionId of workspace.sessionIds) {
      if (!workspaceBySession.has(sessionId)) workspaceBySession.set(sessionId, workspace.title)
    }
  }
  const labelOf = (summary: SessionSummary): string =>
    workspaceBySession.get(summary.id) ?? workspaceLabel(summary.cwd)
  const contentBySession = new Map<SessionId, SessionSearchResultItem>()
  for (const item of content.items) {
    if (!contentBySession.has(item.sessionId)) contentBySession.set(item.sessionId, item)
  }

  const local: SessionSummary[] = []
  for (const id of list.ids) {
    const summary = list.byId[id]
    // Blank sessions never match a query: nothing has started in them, so
    // their placeholder title carries no searchable content.
    if (
      summary === undefined
      || summary.blank
      || !inScope(summary.id)
      || !sessionVisible(summary, list.current, archived)
    ) continue
    if (
      summary.displayTitle.toLowerCase().includes(q)
      || labelOf(summary).toLowerCase().includes(q)
    ) {
      local.push(summary)
    }
  }
  local.sort(byRecency)

  const ordered: SessionSummary[] = []
  const included = new Set<SessionId>()
  const include = (summary: SessionSummary): void => {
    if (included.has(summary.id)) return
    included.add(summary.id)
    ordered.push(summary)
  }
  for (const summary of local) include(summary)
  for (const item of content.items) {
    const summary = list.byId[item.sessionId]
    if (
      summary !== undefined
      && !summary.blank
      && inScope(summary.id)
      && sessionVisible(summary, list.current, archived)
    ) include(summary)
  }

  return {
    items: ordered.slice(0, limit).map((summary) => {
      const match = contentBySession.get(summary.id)
      return {
        id: summary.id,
        title: summary.displayTitle,
        workspace: labelOf(summary),
        running: summary.running,
        runningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,
        ...(summary.pendingInteraction === undefined
          ? {}
          : { pendingInteraction: summary.pendingInteraction }),
        completed: summary.completed === true,
        ...match === undefined ? {} : { snippet: match.snippet },
      }
    }),
    hasMore: content.hasMore || ordered.length > limit,
  }
}

/**
 * Compact relative time for session rows, as a structured bucket the
 * renderer localizes ("now"/"5min"/"3h"/"2d"/"4mo"/"1y" in en).
 * @param updatedAt - epoch ms of the session's last activity.
 * @param now - current epoch ms (injected for pure rendering).
 * @returns the row's trailing time bucket and magnitude.
 */
export function relativeTime(updatedAt: number, now: number): RelativeTime {
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const diff = Math.max(0, now - updatedAt)
  if (diff < MIN) return { unit: 'now', n: 0 }
  if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) }
  if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) }
  if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) }
  if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) }
  return { unit: 'years', n: Math.floor(diff / (365 * DAY)) }
}
