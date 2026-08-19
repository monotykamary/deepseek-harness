/**
 * The Workspace/Session browser filling `sidebar.workspaces`: a T3-adapted
 * persistent search row, an All Workspaces scope row with view/add actions,
 * grouped or flat Session cards, and Workspace dialogs. Wide state renders the
 * complete browser; rail state retains search and add as 36px controls on the
 * shell's shared entry path. Adding raises the directory flow directly; the
 * flow and its error dialog remain in WorkspacePicker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import {
  Button, IconCloseFill14, IconFolderClose16, IconPersonalizationOutline16,
  IconPlusOutline16, IconProjectAddOutline16, IconSearchOutline16, Menu, Modal, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type {
  SessionId, SessionListState, SessionSearchResultItem, WorkspaceId, WorkspaceView,
} from '@monotykamary/dsh-client-runtime/client'
import { SHIPPED_WORKSPACE_SETTINGS } from '../settled-settings.ts'
import type { WorkspaceBrowserProps } from './contract/slots.ts'
import type { SessionNode, SessionOrderBy } from './tree.ts'
import {
  deriveAutoSettledSessionIds, deriveFlat, deriveGroups, deriveSearchResults, UNGROUPED_KEY,
} from './tree.ts'
import { ProjectRowItem, SearchResultItem, SessionNodeItem } from './rows/Rows.tsx'
import { FLAT_SESSION_ORDER_KEY } from './stores.ts'
import { WorkspacePickFlow } from './WorkspacePicker.tsx'
import css from './WorkspaceBrowser.module.css'

/**
 * Column slide length (--ds-transition-duration-slow): rail-search focus waits it out —
 * focus() forces a synchronous layout and would jank the slide.
 */
const EXPAND_SLIDE_MS = 300
/** Pause between the latest keystroke and a Host content-search request. */
const SEARCH_DEBOUNCE_MS = 250
/** `session.search` wire bound, measured in JavaScript UTF-16 code units. */
const SEARCH_QUERY_MAX_CODE_UNITS = 500
/** Session rows visible per Workspace before the local overflow control. */
const COLLAPSED_SESSION_LIMIT = 5
/** T3-adapted first history page: recent settled work stays cheap to scan. */
const SETTLED_INITIAL_COUNT = 10
/** T3-adapted explicit deep-history page size. */
const SETTLED_PAGE_COUNT = 25
const MINUTE_MS = 60_000

/** Minute-quantized clock shared by relative labels and day-granular auto-settlement. */
function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const remaining = MINUTE_MS - Date.now() % MINUTE_MS
    let interval: number | undefined
    const timeout = window.setTimeout(() => {
      setNow(Date.now())
      interval = window.setInterval(() => { setNow(Date.now()) }, MINUTE_MS)
    }, remaining)
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [])
  return now
}

/** Keep controlled input and RPC payload inside the session.search wire contract. */
function sanitizeSearchQuery(value: string): string {
  const withoutNul = value.replaceAll('\0', '')
  if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul
  let end = SEARCH_QUERY_MAX_CODE_UNITS
  const last = withoutNul.charCodeAt(end - 1)
  const next = withoutNul.charCodeAt(end)
  if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--
  return withoutNul.slice(0, end)
}

/** Immutable membership toggle for the local expand-all array. */
function toggled(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key]
}

/**
 * Accept the native drag at document level while a row drag is active: row
 * hover still owns the insertion marker, and releasing outside the list must
 * not be rendered as a rejected drop before dragend commits that last marker.
 */
function useNativeDragAcceptance(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const acceptDrag = (event: DragEvent): void => {
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
    }
    const acceptDrop = (event: DragEvent): void => { event.preventDefault() }
    document.addEventListener('dragover', acceptDrag)
    document.addEventListener('drop', acceptDrop)
    return () => {
      document.removeEventListener('dragover', acceptDrag)
      document.removeEventListener('drop', acceptDrop)
    }
  }, [active])
}

/** Reconcile a stored view order with the Workspace's current session account. */
function reconciledSessionOrder(sessionIds: readonly SessionId[], stored: readonly string[] | undefined): SessionId[] {
  if (stored === undefined) return [...sessionIds]
  const byId = new Map(sessionIds.map(id => [id as string, id]))
  const ordered: SessionId[] = []
  const included = new Set<string>()
  for (const key of stored) {
    const id = byId.get(key)
    if (id === undefined || included.has(key)) continue
    ordered.push(id)
    included.add(key)
  }
  for (const id of sessionIds) {
    if (included.has(id)) continue
    ordered.push(id)
  }
  return ordered
}

/** Newest update first with stable Session identity as the tie-break. */
function compareSessionRecency(a: SessionId, b: SessionId, byId: SessionListState['byId']): number {
  const aUpdatedAt = byId[a]?.updatedAt ?? Number.NEGATIVE_INFINITY
  const bUpdatedAt = byId[b]?.updatedAt ?? Number.NEGATIVE_INFINITY
  if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt
  return a < b ? -1 : 1
}

/** Reconcile one editable order account and apply its activity-promotion policy. */
function nextSessionOrderAccount({
  sessionIds, previousOrder, previousUpdatedAt, list, orderBy, sortByRecency,
}: {
  sessionIds: readonly SessionId[]
  previousOrder: readonly string[] | undefined
  previousUpdatedAt: Readonly<Record<string, number>>
  list: SessionListState
  orderBy: SessionOrderBy
  sortByRecency: boolean
}): { order: SessionId[]; updatedAt: Record<string, number>; changed: boolean } {
  let order = reconciledSessionOrder(sessionIds, previousOrder)
  if (sortByRecency) {
    order.sort((a, b) => compareSessionRecency(a, b, list.byId))
  } else if (orderBy === 'updated') {
    const promoted = sessionIds
      .filter((id) => {
        const session = list.byId[id]
        return session !== undefined
          && (previousUpdatedAt[id] === undefined || session.updatedAt > previousUpdatedAt[id])
      })
      .sort((a, b) => compareSessionRecency(a, b, list.byId))
    if (promoted.length > 0) {
      const promotedIds = new Set(promoted)
      order = [...promoted, ...order.filter(id => !promotedIds.has(id))]
    }
  }
  const updatedAt: Record<string, number> = {}
  for (const id of sessionIds) {
    const session = list.byId[id]
    if (session !== undefined) updatedAt[id] = session.updatedAt
  }
  const orderChanged = previousOrder === undefined
    || order.length !== previousOrder.length
    || order.some((id, index) => id !== previousOrder[index])
  const timestampsChanged = Object.keys(updatedAt).length !== Object.keys(previousUpdatedAt).length
    || Object.entries(updatedAt).some(([id, timestamp]) => previousUpdatedAt[id] !== timestamp)
  return { order, updatedAt, changed: orderChanged || timestampsChanged }
}

const ALL_WORKSPACES_SCOPE_ID = 'all-workspaces'

function workspaceScopeItemId(workspaceId: WorkspaceId): string {
  return `workspace:${workspaceId}`
}

/** T3-adapted full-width Workspace filter with independent per-row actions. */
function WorkspaceScopeMenu({
  workspaces, selected, onSelect, onRename, onDelete, t,
}: {
  workspaces: readonly WorkspaceView[]
  selected: WorkspaceId | null
  onSelect: (workspaceId: WorkspaceId | null) => void
  onRename: (workspace: WorkspaceView) => void
  onDelete: (workspace: WorkspaceView) => void
  t: WorkspaceBrowserProps['t']
}) {
  const [open, setOpen] = useState(false)
  const [actionWorkspace, setActionWorkspace] = useState<WorkspaceView | null>(null)
  const [actionAnchor, setActionAnchor] = useState<DOMRect | null>(null)
  const selectedWorkspace = workspaces.find(workspace => workspace.workspaceId === selected)
  const getActionAnchor = useCallback(() => actionAnchor, [actionAnchor])
  const closeActions = () => {
    setActionWorkspace(null)
    setActionAnchor(null)
  }
  return (
    <>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={[
          {
            id: ALL_WORKSPACES_SCOPE_ID,
            label: t('section.allWorkspaces'),
            icon: <IconFolderClose16 size={16} />,
          },
          ...workspaces.map(workspace => ({
            id: workspaceScopeItemId(workspace.workspaceId),
            label: workspace.title,
            icon: <IconFolderClose16 size={16} />,
            action: {
              label: t('actions.workspace.aria', { name: workspace.title }),
              icon: <IconPersonalizationOutline16 size={16} />,
            },
          })),
        ]}
        selectedId={selectedWorkspace === undefined
          ? ALL_WORKSPACES_SCOPE_ID
          : workspaceScopeItemId(selectedWorkspace.workspaceId)}
        onSelect={(id) => {
          const workspace = workspaces.find(candidate => workspaceScopeItemId(candidate.workspaceId) === id)
          onSelect(workspace?.workspaceId ?? null)
          setOpen(false)
        }}
        onAction={(id, target) => {
          const workspace = workspaces.find(candidate => workspaceScopeItemId(candidate.workspaceId) === id)
          /* v8 ignore next -- action-bearing rows are produced only by the Workspace map above. */
          if (workspace === undefined) return
          setOpen(false)
          setActionAnchor(target.getBoundingClientRect())
          setActionWorkspace(workspace)
        }}
        dense
        portal
        className={css.scopeMenu ?? ''}
        anchor={(
          <button
            type="button"
            className={css.scopeTrigger}
            aria-label={t('workspace.filter.aria')}
            aria-expanded={open}
            onClick={() => {
              closeActions()
              setOpen(value => !value)
            }}
          >
            <IconFolderClose16 size={16} />
            <span>{selectedWorkspace?.title ?? t('section.allWorkspaces')}</span>
            <ChevronDown className={css.scopeChevron} size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      />
      <Menu
        open={actionWorkspace !== null}
        onClose={closeActions}
        getAnchorRect={getActionAnchor}
        items={[
          { id: 'rename', label: t('rename') },
          { id: 'delete', label: t('delete.workspace'), danger: true },
        ]}
        onSelect={(id) => {
          const workspace = actionWorkspace
          closeActions()
          /* v8 ignore next -- the menu disappears before it can dispatch without a Workspace. */
          if (workspace === null) return
          if (id === 'rename') onRename(workspace)
          else if (id === 'delete') onDelete(workspace)
        }}
        side="right"
        dense
        portal
        anchor={null}
      />
    </>
  )
}

/** In-flight root-row drag: source identity plus the current insert marker. */
interface DragState {
  /** Workspace id, or {@link UNGROUPED_KEY} for the browser-local loose-session account. */
  accountKey: string
  sessionId: SessionNode['id']
  /** Row the marker sits on and which half (insert above/below it). */
  over: { id: SessionNode['id']; half: 'before' | 'after' } | null
}

/** In-flight Workspace-row drag: source identity plus the current marker. */
interface WorkspaceDragState {
  workspaceId: WorkspaceId
  over: { id: WorkspaceId; half: 'before' | 'after' } | null
}

/** Resolve an insertion side from the full rendered workspace group. */
function workspaceGroupHalf(e: { clientY: number; currentTarget: HTMLElement }): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

type SessionTreeProps = Pick<
  WorkspaceBrowserProps,
  'useSessions' | 'startSession' | 'open' | 'forkSession'
  | 'insertWorkspaceBefore' | 'insertSessionBefore' | 't'
> & {
  workspaces: readonly WorkspaceView[]
  /** Explicit persisted zero-or-five-session state by Workspace group. */
  groupExpansion: Readonly<Record<string, boolean>>
  /** Persist one Workspace group's zero-or-five-session state. */
  setGroupExpanded: (key: string, expanded: boolean) => void
  /** Shared editable orders used by Workspace groups and the flat-list account. */
  sessionOrderByAccount: Readonly<Record<string, readonly string[]>>
  /** Last update timestamps observed for one-time recent-update promotions. */
  sessionUpdatedAtByAccount: Readonly<Record<string, Readonly<Record<string, number>>>>
  /** Replace one shared order and its observed timestamps. */
  syncSessionOrderAccount: (accountKey: string, order: string[], updatedAt: Record<string, number>) => void
  /** Apply a drag to one shared order. */
  setSessionOrder: (accountKey: string, order: string[]) => void
  /** Registry-global archive set (hidden rows). */
  archivedSessionIds: readonly SessionNode['id'][]
  /** Open the browser-owned rename dialog for a real Workspace group. */
  onRenameRequest: (workspaceId: WorkspaceId, currentTitle: string) => void
  /** Open the browser-owned delete-confirmation dialog for a real Workspace group. */
  onDeleteRequest: (workspaceId: WorkspaceId, currentTitle: string) => void
  /** Open the browser-owned session rename dialog. */
  onSessionRename: (sessionId: SessionNode['id'], currentTitle: string) => void
  /** Archive a session (row menu action; the row disappears on the state echo). */
  onSessionArchive: (sessionId: SessionNode['id']) => void
  /** Session order behavior: fixed after edits, or additionally promoted by user activity. */
  orderBy: SessionOrderBy
  /** Minute-quantized activity clock. */
  now: number
  /** Whole inactive days before shelving, or null while disabled/unavailable. */
  autoSettleAfterDays: number | null
  /** Persisted disclosure state for the shared history shelf. */
  settledShelfExpanded: boolean
  /** Persist the shared history shelf disclosure state. */
  setSettledShelfExpanded: (expanded: boolean) => void
  /** Optional Workspace filter applied to active rows and shelf history. */
  workspace?: WorkspaceView | undefined
}

/** T3-adapted settled-history disclosure shared by grouped and flat views. */
function SettledShelf({
  rows, expanded, setExpanded, currentId, now, open, onRename, onFork, onArchive, t,
}: {
  rows: readonly SessionNode[]
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  currentId: SessionId | undefined
  now: number
  open: (sessionId: SessionId) => void
  onRename: (sessionId: SessionId, currentTitle: string) => void
  onFork: (sessionId: SessionId) => void
  onArchive: (sessionId: SessionId) => void
  t: WorkspaceBrowserProps['t']
}) {
  const [visibleCount, setVisibleCount] = useState(SETTLED_INITIAL_COUNT)
  useEffect(() => {
    if (!expanded) setVisibleCount(SETTLED_INITIAL_COUNT)
  }, [expanded])
  if (rows.length === 0) return null
  const rendered = expanded ? rows.slice(0, visibleCount) : []
  const hiddenCount = Math.max(0, rows.length - rendered.length)
  return (
    <>
      <div className={css.settledShelfHeader} role="presentation">
        <button
          type="button"
          className={css.settledShelfToggle}
          aria-expanded={expanded}
          onClick={() => { setExpanded(!expanded) }}
        >
          <span>{expanded ? t('settled.label') : t('settled.collapsed', { n: rows.length })}</span>
          <span className={css.settledShelfRule} />
          <ChevronDown className={css.settledShelfChevron} size={14} aria-hidden="true" />
        </button>
      </div>
      {rendered.map(node => (
        <SessionNodeItem
          key={node.id}
          node={node}
          currentId={currentId}
          now={now}
          onOpen={open}
          onRename={onRename}
          onFork={onFork}
          onArchive={onArchive}
          settled
          t={t}
        />
      ))}
      {expanded && hiddenCount > 0 && (
        <button
          type="button"
          className={css.settledMore}
          onClick={() => { setVisibleCount(count => count + SETTLED_PAGE_COUNT) }}
        >
          <IconPlusOutline16 size={14} />
          <span>{t('settled.showMore', { n: Math.min(hiddenCount, SETTLED_PAGE_COUNT) })}</span>
        </button>
      )}
    </>
  )
}

/** The scrolling session tree; unmounting drops the sessions subscription and expand-all state. */
function SessionTree({
  useSessions, startSession, open, forkSession, workspaces, archivedSessionIds,
  onRenameRequest, onDeleteRequest, onSessionRename, onSessionArchive,
  insertWorkspaceBefore, insertSessionBefore, orderBy, now, autoSettleAfterDays,
  settledShelfExpanded, setSettledShelfExpanded, workspace,
  groupExpansion, setGroupExpanded,
  sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, t,
}: SessionTreeProps) {
  const list = useSessions(s => s)
  const current = list.current
  const [expandedSessionGroups, setExpandedSessionGroups] = useState<string[]>([])
  // Transient drag marker state; the selected mode owns the resulting order.
  const [drag, setDrag] = useState<DragState | null>(null)
  const sessionDropCommitted = useRef(false)
  const [workspaceDrag, setWorkspaceDrag] = useState<WorkspaceDragState | null>(null)
  const workspaceDropCommitted = useRef(false)
  const previousOrderBy = useRef(orderBy)
  const nativeDragActive = drag !== null || workspaceDrag !== null
  useNativeDragAcceptance(nativeDragActive)
  const currentGroup = current === undefined
    ? undefined
    : (workspaces.find(w => w.sessionIds.includes(current))?.workspaceId as string | undefined)
      ?? UNGROUPED_KEY
  useEffect(() => {
    if (current === undefined || currentGroup === undefined || Object.hasOwn(groupExpansion, currentGroup)) return
    setGroupExpanded(currentGroup, true)
  }, [current, currentGroup, setGroupExpanded, groupExpansion])
  const expandedGroups = useMemo(
    () => Object.entries(groupExpansion).filter(([, expanded]) => expanded).map(([key]) => key),
    [groupExpansion],
  )
  const ungroupedSessionIds = useMemo(() => {
    const accounted = new Set(workspaces.flatMap(workspace => workspace.sessionIds))
    return list.ids.filter(id => list.byId[id] !== undefined && !accounted.has(id))
  }, [list, workspaces])
  useEffect(() => {
    if (list.phase !== 'ready') return
    const switchedToUpdated = previousOrderBy.current !== 'updated' && orderBy === 'updated'
    previousOrderBy.current = orderBy
    const accounts = [
      ...workspaces.map(workspace => ({
        key: workspace.workspaceId as string,
        sessionIds: workspace.sessionIds.filter(id => list.byId[id] !== undefined),
      })),
      { key: UNGROUPED_KEY, sessionIds: ungroupedSessionIds },
    ]
    for (const { key, sessionIds } of accounts) {
      const previousOrder = sessionOrderByAccount[key]
      const previousUpdatedAt = sessionUpdatedAtByAccount[key] ?? {}
      const next = nextSessionOrderAccount({
        sessionIds,
        previousOrder,
        previousUpdatedAt,
        list,
        orderBy,
        sortByRecency: orderBy === 'updated' && (previousOrder === undefined || switchedToUpdated),
      })
      if (next.changed) {
        syncSessionOrderAccount(key, next.order.map(id => id as string), next.updatedAt)
      }
    }
  }, [list, orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, ungroupedSessionIds, workspaces])
  const orderedWorkspaces = useMemo(() => {
    return workspaces.map((workspace) => {
      const stored = sessionOrderByAccount[workspace.workspaceId as string]
      const sessionIds = reconciledSessionOrder(workspace.sessionIds, stored)
      return { ...workspace, sessionIds }
    })
  }, [sessionOrderByAccount, workspaces])
  const orderedUngroupedSessionIds = useMemo(
    () => reconciledSessionOrder(ungroupedSessionIds, sessionOrderByAccount[UNGROUPED_KEY]),
    [sessionOrderByAccount, ungroupedSessionIds],
  )
  const settledSessionIds = useMemo(
    () => deriveAutoSettledSessionIds(list, now, autoSettleAfterDays),
    [autoSettleAfterDays, list, now],
  )
  const settledSet = useMemo(() => new Set(settledSessionIds), [settledSessionIds])
  const groups = useMemo(
    () => deriveGroups(list, orderedWorkspaces, archivedSessionIds, {
      expandedGroups,
      ...(sessionOrderByAccount[UNGROUPED_KEY] === undefined
        ? {}
        : { ungroupedOrder: sessionOrderByAccount[UNGROUPED_KEY] }),
    }, settledSessionIds),
    [list, orderedWorkspaces, archivedSessionIds, expandedGroups, sessionOrderByAccount, settledSessionIds],
  )
  const scopedIds = useMemo(
    () => workspace === undefined ? null : new Set(workspace.sessionIds),
    [workspace],
  )
  const settledRows = useMemo(
    () => deriveFlat(list, archivedSessionIds)
      .filter(row => settledSet.has(row.id) && (scopedIds === null || scopedIds.has(row.id))),
    [archivedSessionIds, list, scopedIds, settledSet],
  )
  const commitSessionDrag = (activeDrag: DragState, over: NonNullable<DragState['over']>): void => {
    if (sessionDropCommitted.current) return
    sessionDropCommitted.current = true
    setDrag(null)
    const group = groups.find(candidate => candidate.key === activeDrag.accountKey)
    if (group === undefined) return
    const targetIndex = group.sessions.findIndex(session => session.id === over.id)
    if (targetIndex === -1) return
    const anchor = over.half === 'before' ? over.id : group.sessions[targetIndex + 1]?.id
    if (anchor === activeDrag.sessionId) return
    const sourceIndex = group.sessions.findIndex(session => session.id === activeDrag.sessionId)
    const anchorIndex = anchor === undefined
      ? group.sessions.length
      : group.sessions.findIndex(session => session.id === anchor)
    if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return
    const accountSessionIds = activeDrag.accountKey === UNGROUPED_KEY
      ? orderedUngroupedSessionIds
      : orderedWorkspaces.find(workspace => workspace.workspaceId === activeDrag.accountKey)?.sessionIds
    if (accountSessionIds === undefined) return
    const nextOrder = accountSessionIds.filter(id => id !== activeDrag.sessionId)
    const insertAt = anchor === undefined ? nextOrder.length : nextOrder.indexOf(anchor)
    nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId)
    setSessionOrder(activeDrag.accountKey, nextOrder.map(id => id as string))
    if (orderBy === 'updated' || activeDrag.accountKey === UNGROUPED_KEY) return
    insertSessionBefore(activeDrag.accountKey as WorkspaceId, activeDrag.sessionId, anchor).catch((reason: unknown) => {
      console.warn('session reorder rejected:', reason)
    })
  }
  const commitWorkspaceDrag = (
    activeDrag: WorkspaceDragState,
    over: NonNullable<WorkspaceDragState['over']>,
  ): void => {
    if (workspaceDropCommitted.current) return
    workspaceDropCommitted.current = true
    setWorkspaceDrag(null)
    const rowIndex = workspaces.findIndex(workspace => workspace.workspaceId === over.id)
    if (rowIndex === -1) return
    const anchor = over.half === 'before' ? over.id : workspaces[rowIndex + 1]?.workspaceId
    if (anchor === activeDrag.workspaceId) return
    const sourceIndex = workspaces.findIndex(workspace => workspace.workspaceId === activeDrag.workspaceId)
    const anchorIndex = anchor === undefined
      ? workspaces.length
      : workspaces.findIndex(workspace => workspace.workspaceId === anchor)
    if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return
    insertWorkspaceBefore(activeDrag.workspaceId, anchor).catch((reason: unknown) => {
      console.warn('workspace reorder rejected:', reason)
    })
  }
  const workspaceDropAtListStart = groups[0]?.workspaceId !== undefined
    && workspaceDrag?.over?.id === groups[0].workspaceId
    && workspaceDrag.over.half === 'before'

  return (
    <div className={clsx(css.treeBody, css.wide)}>
      {workspaceDropAtListStart && <span className={css.listTopDropIndicator} aria-hidden="true" />}
      <div
        className={clsx(css.list, workspaceDropAtListStart && css.listTopDropActive)}
        role="tree"
        aria-label={t('section.sessions')}
      >
        {groups.length === 0 && settledRows.length === 0 && (
          <div className={css.empty}>{t('empty.none')}</div>
        )}
        {groups.map((group) => {
          const workspaceId = group.workspaceId
          const workspaceMarker = workspaceId !== undefined && workspaceDrag?.over?.id === workspaceId
            ? workspaceDrag.over.half
            : null
          const workspaceDragProps = workspaceId === undefined ? undefined : {
            start: () => {
              workspaceDropCommitted.current = false
              setWorkspaceDrag({ workspaceId, over: null })
            },
            end: () => {
              if (workspaceDrag?.over !== null && workspaceDrag?.over !== undefined) {
                commitWorkspaceDrag(workspaceDrag, workspaceDrag.over)
              } else {
                setWorkspaceDrag(null)
              }
              workspaceDropCommitted.current = false
            },
          }
          const hoverWorkspace = workspaceId === undefined
            ? undefined
            : (half: 'before' | 'after') => {
              setWorkspaceDrag(active => active === null
                ? active
                : { ...active, over: { id: workspaceId, half } })
            }
          const dropWorkspace = workspaceId === undefined
            ? undefined
            : (half: 'before' | 'after') => {
              if (workspaceDrag === null) return
              commitWorkspaceDrag(workspaceDrag, { id: workspaceId, half })
            }
          return (
          // Group section: header row + expanded top-level session rows. The
          // inter-group breathing room is the section's own margin
          // (WorkspaceBrowser.module.css).
            <div
              key={group.key}
              className={clsx(
                css.groupSection,
                workspaceMarker === 'before' && css.workspaceDropBefore,
                workspaceMarker === 'after' && css.workspaceDropAfter,
              )}
              onDragOver={workspaceDrag === null || hoverWorkspace === undefined
                ? undefined
                : (e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  hoverWorkspace(workspaceGroupHalf(e))
                }}
              onDrop={workspaceDrag === null || dropWorkspace === undefined
                ? undefined
                : (e) => {
                  e.preventDefault()
                  dropWorkspace(workspaceGroupHalf(e))
                }}
            >
              <ProjectRowItem
                group={group}
                t={t}
                onToggle={() => {
                  if (group.expanded) {
                    setExpandedSessionGroups(keys => keys.filter(key => key !== group.key))
                  }
                  setGroupExpanded(group.key, !group.expanded)
                }}
                onCreate={() => {
                  if (group.workspaceId !== undefined) {
                    setGroupExpanded(group.key, true)
                    startSession(group.workspaceId)
                  }
                }}
                drag={workspaceDragProps}
                actions={group.workspaceId === undefined
                  ? undefined
                  : {
                    rename: () => {
                    /* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
                      if (group.workspaceId !== undefined) onRenameRequest(group.workspaceId, group.label)
                    },
                    delete: () => {
                    /* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
                      if (group.workspaceId !== undefined) onDeleteRequest(group.workspaceId, group.label)
                    },
                  }}
              />
              {(expandedSessionGroups.includes(group.key)
                ? group.sessions
                : group.sessions.slice(0, COLLAPSED_SESSION_LIMIT)
              ).map((node) => {
              // Session drag never leaves its group. Ungrouped writes only the
              // browser-local account; real Workspaces may also write Host order.
                const sameGroupDrag = drag !== null && drag.accountKey === group.key
                const dragProps = {
                  start: () => {
                    sessionDropCommitted.current = false
                    setDrag({ accountKey: group.key, sessionId: node.id, over: null })
                  },
                  active: sameGroupDrag,
                  marker: sameGroupDrag && drag.over?.id === node.id ? drag.over.half : null,
                  hover: (half: 'before' | 'after') => {
                  /* v8 ignore next -- narrowing guard: Rows gates hover on `active`, which is false while the drag state is null. */
                    setDrag(d => (d === null ? d : { ...d, over: { id: node.id, half } }))
                  },
                  drop: (half: 'before' | 'after') => {
                  /* v8 ignore next -- narrowing guard: Rows gates drop on `active`, which is false while the drag state is null. */
                    if (drag === null) return
                    commitSessionDrag(drag, { id: node.id, half })
                  },
                  end: () => {
                    if (drag?.over !== null && drag?.over !== undefined) commitSessionDrag(drag, drag.over)
                    else setDrag(null)
                    sessionDropCommitted.current = false
                  },
                }
                return (
                  <SessionNodeItem
                    key={node.id}
                    node={node}
                    currentId={current}
                    now={now}
                    onOpen={open}
                    onRename={onSessionRename}
                    onFork={forkSession}
                    onArchive={onSessionArchive}
                    drag={dragProps}
                    t={t}
                  />
                )
              })}
              {group.sessions.length > COLLAPSED_SESSION_LIMIT && (
                <button
                  type="button"
                  className={css.sessionOverflowButton}
                  aria-expanded={expandedSessionGroups.includes(group.key)}
                  onClick={() => { setExpandedSessionGroups(keys => toggled(keys, group.key)) }}
                >
                  {expandedSessionGroups.includes(group.key)
                    ? t('sessions.collapse')
                    : t('sessions.expand', { n: group.sessions.length - COLLAPSED_SESSION_LIMIT })}
                </button>
              )}
            </div>
          )
        })}
        <SettledShelf
          rows={settledRows}
          expanded={settledShelfExpanded}
          setExpanded={setSettledShelfExpanded}
          currentId={current}
          now={now}
          open={open}
          onRename={onSessionRename}
          onFork={forkSession}
          onArchive={onSessionArchive}
          t={t}
        />
      </div>
      <span className={css.fade} />
    </div>
  )
}

/** The flat "In one list" body: every session is one draggable top-level row. */
function FlatList({
  useSessions, open, forkSession, onSessionRename, onSessionArchive, archivedSessionIds, workspace,
  orderBy, now, autoSettleAfterDays, settledShelfExpanded, setSettledShelfExpanded,
  sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, t,
}: Pick<
  SessionTreeProps,
  | 'useSessions'
  | 'open'
  | 'forkSession'
  | 'onSessionRename'
  | 'onSessionArchive'
  | 'archivedSessionIds'
  | 'orderBy'
  | 'now'
  | 'autoSettleAfterDays'
  | 'settledShelfExpanded'
  | 'setSettledShelfExpanded'
  | 'sessionOrderByAccount'
  | 'sessionUpdatedAtByAccount'
  | 'syncSessionOrderAccount'
  | 'setSessionOrder'
  | 't'
> & { workspace?: WorkspaceView | undefined }) {
  const list = useSessions(s => s)
  const workspaceSessionIds = useMemo(
    () => workspace === undefined ? null : new Set(workspace.sessionIds),
    [workspace],
  )
  const accountKey = workspace?.workspaceId as string | undefined ?? FLAT_SESSION_ORDER_KEY
  const allRows = useMemo(
    () => deriveFlat(list, archivedSessionIds).filter(
      row => workspaceSessionIds === null || workspaceSessionIds.has(row.id),
    ),
    [list, archivedSessionIds, workspaceSessionIds],
  )
  const settledSessionIds = useMemo(
    () => deriveAutoSettledSessionIds(list, now, autoSettleAfterDays),
    [autoSettleAfterDays, list, now],
  )
  const settledSet = useMemo(() => new Set(settledSessionIds), [settledSessionIds])
  const sessionIds = useMemo(() => allRows.map(row => row.id), [allRows])
  const previousOrderBy = useRef(orderBy)
  useEffect(() => {
    if (list.phase !== 'ready') return
    const previousOrder = sessionOrderByAccount[accountKey]
    const previousUpdatedAt = sessionUpdatedAtByAccount[accountKey] ?? {}
    const switchedToUpdated = previousOrderBy.current !== 'updated' && orderBy === 'updated'
    previousOrderBy.current = orderBy
    const next = nextSessionOrderAccount({
      sessionIds,
      previousOrder,
      previousUpdatedAt,
      list,
      orderBy,
      sortByRecency: orderBy === 'updated' && (previousOrder === undefined || switchedToUpdated),
    })
    if (next.changed) {
      syncSessionOrderAccount(accountKey, next.order.map(id => id as string), next.updatedAt)
    }
  }, [accountKey, list, orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, sessionIds, syncSessionOrderAccount])
  const orderedRows = useMemo(() => {
    const byId = new Map(allRows.map(row => [row.id, row]))
    return reconciledSessionOrder(sessionIds, sessionOrderByAccount[accountKey])
      .flatMap((id) => {
        const row = byId.get(id)
        return row === undefined ? [] : [row]
      })
  }, [accountKey, allRows, sessionOrderByAccount, sessionIds])
  const rows = useMemo(
    () => orderedRows.filter(row => !settledSet.has(row.id)),
    [orderedRows, settledSet],
  )
  const settledRows = useMemo(
    () => allRows.filter(row => settledSet.has(row.id)),
    [allRows, settledSet],
  )
  const [drag, setDrag] = useState<DragState | null>(null)
  const dropCommitted = useRef(false)
  useNativeDragAcceptance(drag !== null)
  const commitDrag = (activeDrag: DragState, over: NonNullable<DragState['over']>): void => {
    if (dropCommitted.current) return
    dropCommitted.current = true
    setDrag(null)
    const targetIndex = rows.findIndex(row => row.id === over.id)
    if (targetIndex === -1) return
    const anchor = over.half === 'before' ? over.id : rows[targetIndex + 1]?.id
    if (anchor === activeDrag.sessionId) return
    const sourceIndex = rows.findIndex(row => row.id === activeDrag.sessionId)
    const anchorIndex = anchor === undefined ? rows.length : rows.findIndex(row => row.id === anchor)
    if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return
    const nextOrder = orderedRows.map(row => row.id).filter(id => id !== activeDrag.sessionId)
    const insertAt = anchor === undefined ? nextOrder.length : nextOrder.indexOf(anchor)
    nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId)
    setSessionOrder(accountKey, nextOrder.map(id => id as string))
  }
  return (
    <div className={clsx(css.treeBody, css.wide)}>
      <div className={clsx(css.list, css.flatList)} role="tree" aria-label={t('section.sessions')}>
        {rows.length === 0 && settledRows.length === 0 && (
          <div className={css.empty}>{t('empty.none')}</div>
        )}
        {rows.map((node) => {
          const active = drag !== null
          return (
            <SessionNodeItem
              key={node.id}
              node={node}
              currentId={list.current}
              now={now}
              onOpen={open}
              onRename={onSessionRename}
              onFork={forkSession}
              onArchive={onSessionArchive}
              drag={{
                start: () => {
                  dropCommitted.current = false
                  setDrag({ accountKey, sessionId: node.id, over: null })
                },
                active,
                marker: active && drag.over?.id === node.id ? drag.over.half : null,
                hover: (half) => {
                  setDrag(current => current === null ? current : { ...current, over: { id: node.id, half } })
                },
                drop: (half) => {
                  if (drag !== null) commitDrag(drag, { id: node.id, half })
                },
                end: () => {
                  if (drag?.over !== null && drag?.over !== undefined) commitDrag(drag, drag.over)
                  else setDrag(null)
                  dropCommitted.current = false
                },
              }}
              t={t}
            />
          )
        })}
        <SettledShelf
          rows={settledRows}
          expanded={settledShelfExpanded}
          setExpanded={setSettledShelfExpanded}
          currentId={list.current}
          now={now}
          open={open}
          onRename={onSessionRename}
          onFork={forkSession}
          onArchive={onSessionArchive}
          t={t}
        />
      </div>
      <span className={css.fade} />
    </div>
  )
}

interface RemoteSearchState {
  query: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: readonly SessionSearchResultItem[]
  hasMore: boolean
}

/** Flat search body: local metadata matches plus the current Host result page. */
function SearchResults({
  useSessions,
  open,
  workspaces,
  archivedSessionIds,
  query,
  remote,
  resultLimit,
  workspace,
  t,
}: Pick<SessionTreeProps, 'useSessions' | 'open' | 't'> & {
  workspaces: readonly WorkspaceView[]
  workspace?: WorkspaceView | undefined
  archivedSessionIds: readonly SessionNode['id'][]
  query: string
  remote: RemoteSearchState
  resultLimit: number
}) {
  const list = useSessions(s => s)
  const currentRemote = remote.query === query
    ? remote
    : { query, status: 'loading' as const, items: [], hasMore: false }
  const results = useMemo(
    () => deriveSearchResults(
      list, workspaces, query, archivedSessionIds, currentRemote, resultLimit, workspace?.workspaceId,
    ),
    [list, workspaces, query, archivedSessionIds, currentRemote, resultLimit, workspace?.workspaceId],
  )
  const pending = currentRemote.status === 'loading'
  const failed = currentRemote.status === 'error'

  return (
    <div className={clsx(css.treeBody, css.wide)}>
      <div className={css.list}>
        <div className={css.searchTree} role="tree" aria-label={t('search.results.aria')}>
          {results.items.map(result => (
            <SearchResultItem
              key={result.id}
              result={result}
              currentId={list.current}
              onOpen={open}
              t={t}
            />
          ))}
        </div>
        {pending && (
          <div className={css.searchStatus} role="status">{t('search.pending')}</div>
        )}
        {failed && (
          <div className={css.searchWarning} role="status">
            {t('search.unavailable')}
          </div>
        )}
        {!pending && results.items.length === 0 && (
          <div className={css.empty}>{t('search.noMatches')}</div>
        )}
        {results.hasMore && (
          <div className={css.searchStatus}>
            {t('search.hasMore', { n: resultLimit })}
          </div>
        )}
      </div>
      <span className={css.fade} />
    </div>
  )
}

/**
 * Render the browsing region.
 * @param props - composed slot props (shell owner share + store + injected actions).
 * @returns the region element tree.
 */
export function WorkspaceBrowser({
  wide,
  expandSidebar,
  useSessions,
  useWorkspaces,
  useStore,
  actions,
  startSession,
  open,
  renameSession,
  forkSession,
  renameWorkspace,
  deleteWorkspace,
  insertWorkspaceBefore,
  archiveSession,
  insertSessionBefore,
  createWorkspace,
  searchSessions,
  searchResultLimit,
  useDirectoryFlow,
  useSettlement,
  renderSlot,
  t,
}: WorkspaceBrowserProps) {
  const workspaces = useWorkspaces(state => state.items)
  const workspacePhase = useWorkspaces(state => state.phase)
  const archivedSessionIds = useWorkspaces(state => state.archivedSessionIds)
  // Live occupancy of this surface's directory-flow hole (the same source the
  // flow reads): a composition without a picking affordance can add nothing.
  const directoryFlowAvailable = useDirectoryFlow(occupied => occupied)
  const autoSettleAfterDays = useSettlement((snapshot) => {
    const settings = snapshot.value
      ?? (snapshot.status === 'unavailable' ? SHIPPED_WORKSPACE_SETTINGS : undefined)
    return settings?.autoSettleInactive === true ? settings.autoSettleAfterDays : null
  })
  const now = useMinuteNow()
  const workspaceScope = useStore(s => s.workspaceScope)
  const groupBy = useStore(s => s.groupBy)
  const orderBy = useStore(s => s.orderBy)
  const groupExpansion = useStore(s => s.groupExpansion)
  const settledShelfExpanded = useStore(s => s.settledShelfExpanded === true)
  const sessionOrderByAccount = useStore(s => s.sessionOrderByAccount)
  const sessionUpdatedAtByAccount = useStore(s => s.sessionUpdatedAtByAccount)
  const scopedWorkspace = workspaces.find(workspace => workspace.workspaceId === workspaceScope)
  useEffect(() => {
    if (workspacePhase !== 'ready') return
    actions.retainAccountKeys([
      UNGROUPED_KEY,
      FLAT_SESSION_ORDER_KEY,
      ...workspaces.map(workspace => workspace.workspaceId as string),
    ])
  }, [actions.retainAccountKeys, workspacePhase, workspaces])
  // The query outlives the tree and the input (both wide-only) so collapsing
  // does not silently drop an in-progress filter.
  const [query, setQuery] = useState('')
  const normalizedQuery = sanitizeSearchQuery(query).trim()
  const [remoteSearch, setRemoteSearch] = useState<RemoteSearchState>({
    query: '',
    status: 'idle',
    items: [],
    hasMore: false,
  })
  const searchInput = useRef<HTMLInputElement | null>(null)
  // The add control anchors one picker flow in either wide or rail state.
  const [wsPickerOpen, setWsPickerOpen] = useState(false)
  const wsPlusRef = useRef<HTMLButtonElement>(null)
  const composingRef = useRef(false)

  // Rail search = expand + land in the search box: the flag arms before the
  // expand request; once the shell flips wide the input mounts and takes focus.
  const [searchOnExpand, setSearchOnExpand] = useState(false)
  useEffect(() => {
    if (wide && searchOnExpand) {
      const timer = window.setTimeout(() => {
        searchInput.current?.focus({ preventScroll: true })
        setSearchOnExpand(false)
      }, EXPAND_SLIDE_MS)
      return () => { window.clearTimeout(timer) }
    }
  }, [wide, searchOnExpand])

  useEffect(() => {
    if (normalizedQuery === '') {
      setRemoteSearch({ query: '', status: 'idle', items: [], hasMore: false })
      return
    }
    const controller = new AbortController()
    setRemoteSearch({
      query: normalizedQuery,
      status: 'loading',
      items: [],
      hasMore: false,
    })
    const timer = window.setTimeout(() => {
      searchSessions(normalizedQuery, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        setRemoteSearch({
          query: normalizedQuery,
          status: 'ready',
          items: result.items,
          hasMore: result.hasMore,
        })
      }).catch(() => {
        if (controller.signal.aborted) return
        setRemoteSearch({
          query: normalizedQuery,
          status: 'error',
          items: [],
          hasMore: false,
        })
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalizedQuery, searchSessions])

  // Rename dialog (browser-owned so it outlives row unmounts during collapse).
  const [renameTarget, setRenameTarget] = useState<{ workspaceId: WorkspaceId; currentTitle: string } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameTrimmed = renameDraft.trim()
  const renameDuplicate = renameTarget !== null && renameTrimmed !== '' && renameTrimmed !== renameTarget.currentTitle
    && workspaces.some(w => w.title === renameTrimmed)
  const renameBlocked = renaming || renameTrimmed === ''
    || renameTarget === null || renameTrimmed === renameTarget.currentTitle || renameDuplicate
  const closeRename = () => {
    if (renaming) return
    setRenameTarget(null)
    setRenameError(null)
  }
  const confirmRename = () => {
    if (renameBlocked) return
    setRenaming(true)
    setRenameError(null)
    renameWorkspace(renameTarget.workspaceId, renameTrimmed).then(() => {
      setRenaming(false)
      setRenameTarget(null)
    }).catch((reason: unknown) => {
      setRenaming(false)
      setRenameError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  // Session rename dialog (same browser-owned pattern as workspace rename;
  // sessions have no client-side name-conflict rule — the host normalizes).
  // Unlike workspace rename, an unchanged title is NOT blocked: confirming
  // the current automatic title is the gesture that pins it.
  const [sessionRenameTarget, setSessionRenameTarget] = useState<{ sessionId: SessionNode['id']; currentTitle: string } | null>(null)
  const [sessionRenameDraft, setSessionRenameDraft] = useState('')
  const [sessionRenaming, setSessionRenaming] = useState(false)
  const [sessionRenameError, setSessionRenameError] = useState<string | null>(null)
  const sessionRenameTrimmed = sessionRenameDraft.trim()
  const sessionRenameBlocked = sessionRenaming || sessionRenameTrimmed === '' || sessionRenameTarget === null
  const closeSessionRename = () => {
    if (sessionRenaming) return
    setSessionRenameTarget(null)
    setSessionRenameError(null)
  }
  const confirmSessionRename = () => {
    if (sessionRenameBlocked) return
    setSessionRenaming(true)
    setSessionRenameError(null)
    renameSession(sessionRenameTarget.sessionId, sessionRenameTrimmed).then(() => {
      setSessionRenaming(false)
      setSessionRenameTarget(null)
    }).catch((reason: unknown) => {
      setSessionRenaming(false)
      setSessionRenameError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  const onSessionRename = (sessionId: SessionNode['id'], currentTitle: string) => {
    setSessionRenameTarget({ sessionId, currentTitle })
    setSessionRenameDraft(currentTitle)
    setSessionRenameError(null)
  }

  // Archive is dialog-free: not destructive (the log and the accounting slot
  // remain), so the menu action commits directly; the row disappears when the
  // archive-set echo lands. Failures are non-fatal console diagnostics, the
  // same posture as reorder rejections.
  const onSessionArchive = (sessionId: SessionNode['id']) => {
    archiveSession(sessionId).catch((reason: unknown) => {
      console.warn('session archive rejected:', reason)
    })
  }

  // Delete dialog is separate from the row so a successful removal can
  // unmount that row without tearing down the in-flight confirmation state.
  const [deleteTarget, setDeleteTarget] = useState<{ workspaceId: WorkspaceId; title: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteCommittedId, setDeleteCommittedId] = useState<WorkspaceId | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  useEffect(() => {
    if (deleteCommittedId === null
      || workspaces.some(workspace => workspace.workspaceId === deleteCommittedId)) return
    setDeleting(false)
    setDeleteCommittedId(null)
    setDeleteTarget(null)
  }, [deleteCommittedId, workspaces])
  const closeDelete = () => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError(null)
  }
  const confirmDelete = () => {
    /* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
    if (deleting || deleteTarget === null) return
    setDeleting(true)
    setDeleteCommittedId(null)
    setDeleteError(null)
    deleteWorkspace(deleteTarget.workspaceId).then(() => {
      // Keep the confirmation pending until this component has rendered the
      // committed list projection without the deleted id. Closing earlier
      // exposes one stale React frame to the next Create Workspace gesture.
      setDeleteCommittedId(deleteTarget.workspaceId)
    }).catch((reason: unknown) => {
      setDeleting(false)
      setDeleteError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <div className={clsx(css.root, !wide && css.rail)}>
      {wide
        ? (
          <div className={css.fixedControls}>
            <div className={css.searchRow}>
              <span className={css.searchGlyph} aria-hidden="true">
                <IconSearchOutline16 size={16} />
              </span>
              <input
                ref={searchInput}
                className={css.searchInput}
                type="search"
                aria-label={t('search.sessions.aria')}
                placeholder={t('search.placeholder')}
                maxLength={SEARCH_QUERY_MAX_CODE_UNITS}
                value={query}
                onFocus={() => { setWsPickerOpen(false) }}
                onChange={(e) => { setQuery(sanitizeSearchQuery(e.target.value)) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setQuery('')
                }}
              />
              {query !== '' && (
                <button
                  type="button"
                  className={css.clearButton}
                  aria-label={t('search.clear')}
                  onClick={() => {
                    setQuery('')
                    searchInput.current?.focus()
                  }}
                >
                  <IconCloseFill14 />
                </button>
              )}
            </div>
            <div className={css.scopeRow}>
              <WorkspaceScopeMenu
                workspaces={workspaces}
                selected={workspaceScope}
                onSelect={actions.setWorkspaceScope}
                onRename={(workspace) => {
                  setRenameTarget({ workspaceId: workspace.workspaceId, currentTitle: workspace.title })
                  setRenameDraft(workspace.title)
                  setRenameError(null)
                }}
                onDelete={(workspace) => {
                  setDeleteTarget({ workspaceId: workspace.workspaceId, title: workspace.title })
                  setDeleteError(null)
                }}
                t={t}
              />
              <div className={css.headerActions}>
                {directoryFlowAvailable && (
                  <Tooltip label={t('workspace.add')} side="right" delayMs={500}>
                    <button
                      ref={wsPlusRef}
                      type="button"
                      className={css.iconButton}
                      aria-label={t('workspace.add')}
                      onClick={() => { setWsPickerOpen(v => !v) }}
                    >
                      <IconProjectAddOutline16 size={16} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        )
        : (
          <div className={css.railControls}>
            <Tooltip label={t('search')} side="right">
              <button
                type="button"
                className={css.iconButton}
                aria-label={t('search.sessions.aria')}
                onClick={() => {
                  setSearchOnExpand(true)
                  expandSidebar()
                }}
              >
                <IconSearchOutline16 size={18} />
              </button>
            </Tooltip>
            {directoryFlowAvailable && (
              <Tooltip label={t('workspace.add')} side="right" delayMs={500}>
                <button
                  ref={wsPlusRef}
                  type="button"
                  className={css.iconButton}
                  aria-label={t('workspace.add')}
                  onClick={() => { setWsPickerOpen(v => !v) }}
                >
                  <IconProjectAddOutline16 size={18} />
                </button>
              </Tooltip>
            )}
          </div>
        )}

      <WorkspacePickFlow
        t={t}
        open={wsPickerOpen}
        anchorRef={wsPlusRef}
        useWorkspaces={useWorkspaces}
        createWorkspace={createWorkspace}
        useDirectoryFlow={useDirectoryFlow}
        renderDirectoryFlow={owner => renderSlot('sidebar.workspaces.directoryFlow', owner)}
        addOnly
        side="right"
        onPick={(workspaceId) => {
          setWsPickerOpen(false)
          startSession(workspaceId)
        }}
        onClose={() => { setWsPickerOpen(false) }}
      />

      {/* Always-mounted seat keeps the region's flex slot while the list
          itself is wide-only. */}
      <div className={css.listArea}>
        {wide && (normalizedQuery !== ''
          ? (
            <SearchResults
              useSessions={useSessions}
              open={open}
              workspaces={workspaces}
              archivedSessionIds={archivedSessionIds}
              query={normalizedQuery}
              remote={remoteSearch}
              resultLimit={searchResultLimit}
              workspace={scopedWorkspace}
              t={t}
            />
          )
          : groupBy === 'flat'
            ? (
              <FlatList
                useSessions={useSessions} open={open} forkSession={forkSession}
                onSessionRename={onSessionRename} onSessionArchive={onSessionArchive}
                archivedSessionIds={archivedSessionIds}
                workspace={scopedWorkspace}
                orderBy={orderBy}
                now={now}
                autoSettleAfterDays={autoSettleAfterDays}
                settledShelfExpanded={settledShelfExpanded}
                setSettledShelfExpanded={actions.setSettledShelfExpanded}
                sessionOrderByAccount={sessionOrderByAccount}
                sessionUpdatedAtByAccount={sessionUpdatedAtByAccount}
                syncSessionOrderAccount={actions.syncSessionOrderAccount}
                setSessionOrder={actions.setSessionOrder}
                t={t}
              />
            )
            : (
              <SessionTree
                useSessions={useSessions}
                onSessionRename={onSessionRename}
                onSessionArchive={onSessionArchive}
                forkSession={forkSession}
                workspaces={scopedWorkspace === undefined ? workspaces : [scopedWorkspace]}
                groupExpansion={groupExpansion}
                setGroupExpanded={actions.setGroupExpanded}
                sessionOrderByAccount={sessionOrderByAccount}
                sessionUpdatedAtByAccount={sessionUpdatedAtByAccount}
                syncSessionOrderAccount={actions.syncSessionOrderAccount}
                setSessionOrder={actions.setSessionOrder}
                archivedSessionIds={archivedSessionIds}
                startSession={startSession}
                open={open}
                insertWorkspaceBefore={insertWorkspaceBefore}
                insertSessionBefore={insertSessionBefore}
                orderBy={orderBy}
                now={now}
                autoSettleAfterDays={autoSettleAfterDays}
                settledShelfExpanded={settledShelfExpanded}
                setSettledShelfExpanded={actions.setSettledShelfExpanded}
                workspace={scopedWorkspace}
                t={t}
                onRenameRequest={(workspaceId, currentTitle) => {
                  setRenameTarget({ workspaceId, currentTitle })
                  setRenameDraft(currentTitle)
                  setRenameError(null)
                }}
                onDeleteRequest={(workspaceId, title) => {
                  setDeleteTarget({ workspaceId, title })
                  setDeleteError(null)
                }}
              />
            ))}
      </div>

      <Modal
        open={renameTarget !== null}
        onClose={closeRename}
        closeLabel={t('close')}
        title={t('rename.workspace.title')}
        footer={(
          <>
            <Button variant="outline" disabled={renaming} onClick={closeRename}>{t('cancel')}</Button>
            <Button variant="primary" disabled={renameBlocked} onClick={confirmRename}>{t('rename')}</Button>
          </>
        )}
      >
        <input
          className={css.renameInput}
          value={renameDraft}
          aria-label={t('field.workspaceName')}
          autoFocus
          disabled={renaming}
          onFocus={(e) => { e.target.select() }}
          onChange={(e) => { setRenameDraft(e.target.value); setRenameError(null) }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composingRef.current) {
              e.preventDefault()
              confirmRename()
            }
          }}
        />
        {renameDuplicate && (
          <div className={css.renameError} role="alert">{t('conflict.named', { name: renameTrimmed })}</div>
        )}
        {renameError !== null && <div className={css.renameError} role="alert">{renameError}</div>}
      </Modal>

      <Modal
        open={sessionRenameTarget !== null}
        onClose={closeSessionRename}
        closeLabel={t('close')}
        title={t('rename.session.title')}
        footer={(
          <>
            <Button variant="outline" disabled={sessionRenaming} onClick={closeSessionRename}>{t('cancel')}</Button>
            <Button variant="primary" disabled={sessionRenameBlocked} onClick={confirmSessionRename}>{t('rename')}</Button>
          </>
        )}
      >
        <input
          className={css.renameInput}
          value={sessionRenameDraft}
          aria-label={t('field.sessionName')}
          autoFocus
          disabled={sessionRenaming}
          onFocus={(e) => { e.target.select() }}
          onChange={(e) => { setSessionRenameDraft(e.target.value); setSessionRenameError(null) }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composingRef.current) {
              e.preventDefault()
              confirmSessionRename()
            }
          }}
        />
        {sessionRenameError !== null && <div className={css.renameError} role="alert">{sessionRenameError}</div>}
      </Modal>
      <Modal
        open={deleteTarget !== null}
        onClose={closeDelete}
        closeLabel={t('close')}
        title={t('delete.workspace')}
        {...deleteTarget === null
          ? {}
          : { description: t('delete.desc', { name: deleteTarget.title }) }}
        footer={(
          <>
            <Button variant="outline" disabled={deleting} onClick={closeDelete}>{t('cancel')}</Button>
            <Button
              variant="outline"
              className={css.deleteAction}
              disabled={deleting}
              onClick={confirmDelete}
            >
              {t('delete.workspace')}
            </Button>
          </>
        )}
      >
        {deleting && <div className={css.deleteStatus} role="status">{t('delete.pending')}</div>}
        {deleteError !== null && <div className={css.renameError} role="alert">{deleteError}</div>}
      </Modal>
    </div>
  )
}
