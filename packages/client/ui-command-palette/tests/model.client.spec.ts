import { describe, expect, it } from 'vitest'
import type {
  SessionId, SessionListState, SessionSearchResultItem, SessionSummary,
  WorkspaceId, WorkspaceListState, WorkspaceView,
} from '@monotykamary/dsh-client-runtime/client'
import {
  RECENT_SESSION_LIMIT, SEARCH_QUERY_MAX_CODE_UNITS, contextWorkspaceId,
  normalizeSearchText, rankFields, sanitizeSearchQuery, sessionResults,
  visibleSessions, workspaceForSession, workspaceResults,
} from '../src/client/model.ts'

const sid = (value: string) => value as SessionId
const wid = (value: string) => value as WorkspaceId
const summary = (id: string, updatedAt: number, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: sid(id), displayTitle: id, running: false, blank: false, updatedAt, ...overrides,
})
const sessions = (rows: readonly SessionSummary[], current?: string): SessionListState => ({
  ids: rows.map(row => row.id),
  byId: Object.fromEntries(rows.map(row => [row.id, row])),
  current: current === undefined ? undefined : sid(current),
  phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
})
const workspace = (id: string, sessionIds: string[] = [], title = id, path = `/projects/${id}`): WorkspaceView => ({
  workspaceId: wid(id), title, path, sessionIds: sessionIds.map(sid),
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const workspaces = (
  items: readonly WorkspaceView[], archived: string[] = [], recent?: string,
): WorkspaceListState => ({
  items, archivedSessionIds: archived.map(sid), state: 'idle', phase: 'ready', error: null,
  baselinesReady: true, recentWorkspaceId: recent === undefined ? undefined : wid(recent),
})

describe('command palette model', () => {
  it('sanitizes NUL and the wire-length boundary without splitting a surrogate pair', () => {
    expect(sanitizeSearchQuery('a\0b')).toBe('ab')
    expect(sanitizeSearchQuery('short')).toBe('short')
    expect(sanitizeSearchQuery('x'.repeat(SEARCH_QUERY_MAX_CODE_UNITS + 1))).toHaveLength(SEARCH_QUERY_MAX_CODE_UNITS)
    const prefix = 'x'.repeat(SEARCH_QUERY_MAX_CODE_UNITS - 1)
    expect(sanitizeSearchQuery(`${prefix}😀tail`)).toBe(prefix)
  })

  it('normalizes whitespace and ranks ordered exact, prefix, and contained fields', () => {
    expect(normalizeSearchText('  New   SESSION ')).toBe('new session')
    expect(rankFields([undefined, 'Alpha Project'], '')).toBe(0)
    expect(rankFields([undefined, ''], 'alpha')).toBe(0)
    const exact = rankFields(['alpha'], 'alpha')
    const prefix = rankFields(['alphabet'], 'alpha')
    const contained = rankFields(['the alpha project'], 'alpha')
    const later = rankFields(['none', 'alpha'], 'alpha')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(contained)
    expect(contained).toBeGreaterThan(later)
  })

  it('resolves Workspace membership and contextual fallback', () => {
    const alpha = workspace('alpha', ['one'])
    const beta = workspace('beta', ['two'])
    const list = workspaces([alpha, beta], [], 'beta')
    expect(workspaceForSession(list.items, sid('one'))).toBe(alpha)
    expect(workspaceForSession(list.items, sid('missing'))).toBeUndefined()
    expect(contextWorkspaceId(sessions([summary('one', 1)], 'one'), list)).toBe(wid('alpha'))
    expect(contextWorkspaceId(sessions([summary('missing', 1)], 'missing'), list)).toBe(wid('beta'))
    expect(contextWorkspaceId(sessions([]), workspaces([]))).toBeUndefined()
  })

  it('hides blank, subagent, archived, and missing Session rows', () => {
    const list = sessions([
      summary('visible', 5),
      summary('blank', 4, { blank: true }),
      summary('child', 3, { origin: 'subagent' }),
      summary('archived', 2),
    ])
    list.ids.push(sid('missing'))
    expect(visibleSessions(list, workspaces([], ['archived'])).map(row => row.id)).toEqual(['visible'])
  })

  it('ranks Workspace title before path and preserves registry order for an empty query', () => {
    const alpha = workspace('alpha', [], 'Alpha', '/z/alpha')
    const pathMatch = workspace('beta', [], 'Beta', '/alpha/beta')
    expect(workspaceResults([pathMatch, alpha], '')).toEqual([
      { workspace: pathMatch, score: 1 }, { workspace: alpha, score: 1 },
    ])
    expect(workspaceResults([pathMatch, alpha], 'alpha').map(row => row.workspace.workspaceId)).toEqual(['alpha', 'beta'])
    expect(workspaceResults([alpha], 'missing')).toEqual([])
  })

  it('returns recent Sessions by update time with Workspace context', () => {
    const rows = Array.from({ length: RECENT_SESSION_LIMIT + 2 }, (_, index) => summary(`s${index}`, index))
    const alpha = workspace('alpha', ['s13'])
    const result = sessionResults({
      sessions: sessions(rows), workspaces: workspaces([alpha]), query: '',
      remote: { items: [], hasMore: true }, limit: 2,
    })
    expect(result.items).toHaveLength(RECENT_SESSION_LIMIT)
    expect(result.items[0]?.summary.id).toBe(sid('s13'))
    expect(result.items[0]?.workspace).toBe(alpha)
    expect(result.items[1]?.workspace).toBeUndefined()
    expect(result.hasMore).toBe(false)
  })

  it('merges local and Host-ranked content matches and applies the complete bound', () => {
    const alpha = workspace('alpha', ['local', 'remote'], 'Alpha Project')
    const list = sessions([
      summary('local', 1, { displayTitle: 'Needle' }),
      summary('remote', 3, { displayTitle: 'Unrelated' }),
      summary('other', 2, { displayTitle: 'Needle elsewhere' }),
      summary('hidden', 4, { blank: true }),
    ])
    const remote: SessionSearchResultItem[] = [
      { sessionId: sid('remote'), snippet: 'needle from history' },
      { sessionId: sid('hidden'), snippet: 'hidden history' },
    ]
    const result = sessionResults({
      sessions: list, workspaces: workspaces([alpha]), query: 'needle',
      remote: { items: remote, hasMore: false }, limit: 2,
    })
    expect(result.items.map(item => item.summary.id)).toEqual(['local', 'other'])
    expect(result.hasMore).toBe(true)

    const metadataAndContent = sessionResults({
      sessions: list, workspaces: workspaces([alpha]), query: 'needle',
      remote: { items: [{ sessionId: sid('local'), snippet: 'also in history' }], hasMore: false }, limit: 20,
    })
    expect(metadataAndContent.items[0]?.snippet).toBe('also in history')

    const contentOnly = sessionResults({
      sessions: list, workspaces: workspaces([alpha]), query: 'history',
      remote: { items: remote, hasMore: true }, limit: 20,
    })
    expect(contentOnly.items).toHaveLength(1)
    expect(contentOnly.items[0]?.summary.id).toBe(sid('remote'))
    expect(contentOnly.items[0]?.snippet).toBe('needle from history')
    expect(contentOnly.hasMore).toBe(true)

    const ungroupedContent = sessionResults({
      sessions: sessions([summary('ungrouped', 1)]), workspaces: workspaces([]), query: 'content',
      remote: { items: [{ sessionId: sid('ungrouped'), snippet: 'content only' }], hasMore: false }, limit: 20,
    })
    expect(ungroupedContent.items[0]?.workspace).toBeUndefined()

    const tied = sessionResults({
      sessions: sessions([
        summary('older', 1, { displayTitle: 'Needle one' }),
        summary('newer', 2, { displayTitle: 'Needle two' }),
      ]),
      workspaces: workspaces([]), query: 'needle', remote: { items: [], hasMore: false }, limit: 20,
    })
    expect(tied.items.map(item => item.summary.id)).toEqual(['newer', 'older'])
  })
})
