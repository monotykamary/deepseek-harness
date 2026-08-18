/** Pure command-palette projection and ranking over runtime snapshots. */
import type {
  SessionId, SessionListState, SessionSearchResultItem, SessionSummary,
  WorkspaceId, WorkspaceListState, WorkspaceView,
} from '@monotykamary/dsh-client-runtime/client'

/** Maximum accepted by the `session.search` wire request. */
export const SEARCH_QUERY_MAX_CODE_UNITS = 500
/** Empty-query recent-session count, adapted from T3 Code's command palette. */
export const RECENT_SESSION_LIMIT = 12

/** Workspace row ranked for the command palette. */
export interface PaletteWorkspace {
  workspace: WorkspaceView
  score: number
}

/** Session row with its display context and optional content hit. */
export interface PaletteSession {
  summary: SessionSummary
  workspace?: WorkspaceView
  snippet?: string
  score: number
}

/** Bounded Session result projection. */
export interface PaletteSessionResults {
  items: PaletteSession[]
  hasMore: boolean
}

/**
 * Remove NUL and cap one query without splitting a UTF-16 surrogate pair.
 * @param value - raw controlled-input value.
 * @returns the value admitted by the Session search wire request.
 */
export function sanitizeSearchQuery(value: string): string {
  const withoutNul = value.replaceAll('\0', '')
  if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul
  let end = SEARCH_QUERY_MAX_CODE_UNITS
  const previous = withoutNul.charCodeAt(end - 1)
  const next = withoutNul.charCodeAt(end)
  if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end -= 1
  return withoutNul.slice(0, end)
}

/**
 * Normalize user search text for stable case-insensitive matching.
 * @param value - query or candidate field.
 * @returns trimmed, folded text with collapsed whitespace.
 */
export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ')
}

/** Rank an exact, prefix, or contained field match; zero means no match. */
function rankField(field: string | undefined, query: string, fieldIndex: number): number {
  if (field === undefined) return 0
  const normalized = normalizeSearchText(field)
  if (normalized === '' || !normalized.includes(query)) return 0
  const strength = normalized === query ? 3 : normalized.startsWith(query) ? 2 : 1
  return 3_000 - fieldIndex * 100 + strength
}

/**
 * Compute the highest ordered-field rank for one query.
 * @param fields - candidate fields in precedence order.
 * @param rawQuery - user query before normalization.
 * @returns zero for no match, otherwise an exact/prefix/contained rank.
 */
export function rankFields(fields: readonly (string | undefined)[], rawQuery: string): number {
  const query = normalizeSearchText(rawQuery)
  if (query === '') return 0
  let best = 0
  fields.forEach((field, index) => { best = Math.max(best, rankField(field, query, index)) })
  return best
}

/**
 * Resolve the Workspace that authoritatively accounts for one Session.
 * @param workspaces - current Workspace projection.
 * @param sessionId - Session to locate by membership.
 * @returns the accounting Workspace, when one exists.
 */
export function workspaceForSession(
  workspaces: readonly WorkspaceView[],
  sessionId: SessionId,
): WorkspaceView | undefined {
  return workspaces.find(workspace => workspace.sessionIds.includes(sessionId))
}

/**
 * Resolve New Session's contextual Workspace: current membership, then recent.
 * @param sessions - current Session list and selection.
 * @param workspaces - current Workspace list and recency projection.
 * @returns the contextual Workspace id, when any Workspace is eligible.
 */
export function contextWorkspaceId(
  sessions: SessionListState,
  workspaces: WorkspaceListState,
): WorkspaceId | undefined {
  if (sessions.current !== undefined) {
    const current = workspaceForSession(workspaces.items, sessions.current)
    if (current !== undefined) return current.workspaceId
  }
  return workspaces.recentWorkspaceId
}

/**
 * Select visible root Sessions shared by recent and search projections.
 * @param sessions - authoritative Session list.
 * @param workspaces - archive membership and Workspace accounting.
 * @returns non-blank, non-subagent, unarchived Sessions in list order.
 */
export function visibleSessions(
  sessions: SessionListState,
  workspaces: WorkspaceListState,
): SessionSummary[] {
  const archived = new Set(workspaces.archivedSessionIds)
  return sessions.ids.flatMap((id) => {
    const summary = sessions.byId[id]
    return summary !== undefined
      && !summary.blank
      && summary.origin !== 'subagent'
      && !archived.has(summary.id)
      ? [summary]
      : []
  })
}

/**
 * Rank Workspaces by title first and path second.
 * @param workspaces - current Workspace projection.
 * @param query - normalized or raw user query.
 * @returns matching Workspaces in rank order, or registry order when blank.
 */
export function workspaceResults(
  workspaces: readonly WorkspaceView[],
  query: string,
): PaletteWorkspace[] {
  const normalized = normalizeSearchText(query)
  return workspaces
    .map(workspace => ({
      workspace,
      score: normalized === '' ? 1 : rankFields([workspace.title, workspace.path], normalized),
    }))
    .filter(item => item.score > 0)
    .toSorted((left, right) => right.score - left.score)
}

/**
 * Merge local metadata matches with Host-ranked content hits.
 * @param input - current projections, query, Host page, and complete result bound.
 * @returns bounded visible Session rows plus the refine-query indicator.
 */
export function sessionResults(input: {
  sessions: SessionListState
  workspaces: WorkspaceListState
  query: string
  remote: { items: readonly SessionSearchResultItem[]; hasMore: boolean }
  limit: number
}): PaletteSessionResults {
  const visible = visibleSessions(input.sessions, input.workspaces)
  const query = normalizeSearchText(input.query)
  if (query === '') {
    const items = visible
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, RECENT_SESSION_LIMIT)
      .map((summary): PaletteSession => {
        const workspace = workspaceForSession(input.workspaces.items, summary.id)
        return {
          summary,
          ...(workspace === undefined ? {} : { workspace }),
          score: summary.updatedAt,
        }
      })
    return { items, hasMore: false }
  }

  const remoteById = new Map(input.remote.items.map((item, index) => [item.sessionId, { item, index }]))
  const ranked = visible.flatMap((summary): PaletteSession[] => {
    const workspace = workspaceForSession(input.workspaces.items, summary.id)
    const localScore = rankFields([
      summary.displayTitle, workspace?.title, workspace?.path, summary.cwd,
    ], query)
    const remote = remoteById.get(summary.id)
    if (localScore === 0) {
      if (remote === undefined) return []
      return [{
        summary,
        ...(workspace === undefined ? {} : { workspace }),
        snippet: remote.item.snippet,
        score: 1_000 - remote.index,
      }]
    }
    return [{
      summary,
      ...(workspace === undefined ? {} : { workspace }),
      ...(remote === undefined ? {} : { snippet: remote.item.snippet }),
      score: localScore + 1_000,
    }]
  }).toSorted((left, right) => right.score - left.score || right.summary.updatedAt - left.summary.updatedAt)

  return {
    items: ranked.slice(0, input.limit),
    hasMore: input.remote.hasMore || ranked.length > input.limit,
  }
}
