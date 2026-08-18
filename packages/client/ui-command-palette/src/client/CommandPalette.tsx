/**
 * Frame-wide command palette. Its interaction model and compact command-shell
 * geometry are adapted from T3 Code at revision
 * a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2 under MIT; the repository notice
 * records the upstream copyright and license.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import {
  IconChevronLeftOutline14, IconFolderClose16, IconNewChatOutline16,
  IconSearchOutline16, StateDot,
} from '@monotykamary/dsh-client-ui-primitives'
import type { WorkspaceId, WorkspaceView } from '@monotykamary/dsh-client-runtime/client'
import type { CommandPaletteProps } from './contract.ts'
import {
  contextWorkspaceId, normalizeSearchText, sanitizeSearchQuery, sessionResults,
  workspaceResults, type PaletteSession,
} from './model.ts'
import css from './CommandPalette.module.css'

const SEARCH_DEBOUNCE_MS = 250
const CONTENT_SEARCH_MIN_CHARS = 2

type RemoteState = {
  query: string
  status: 'idle' | 'pending' | 'ready' | 'error'
  items: readonly { sessionId: PaletteSession['summary']['id']; snippet: string }[]
  hasMore: boolean
}

type PaletteItem =
  | { kind: 'action'; id: 'new-default' | 'new-in'; title: string; detail: string }
  | { kind: 'workspace'; id: string; workspace: WorkspaceView; title: string; detail: string }
  | { kind: 'session'; id: string; session: PaletteSession; title: string; detail?: string }

type PaletteGroup = { id: string; label: string; items: PaletteItem[] }

function statusState(session: PaletteSession): 'warning' | 'ongoing' | 'done' | undefined {
  if (session.summary.pendingInteraction !== undefined) return 'warning'
  if (session.summary.running) return 'ongoing'
  if (session.summary.completed === true) return 'done'
  return undefined
}

function statusLabel(session: PaletteSession, t: CommandPaletteProps['t']): string | undefined {
  if (session.summary.pendingInteraction !== undefined) return t('status.waiting')
  if (session.summary.running) return t('status.running')
  if (session.summary.completed === true) return t('status.completed')
  return undefined
}

/* v8 ignore next 3 -- closed-union backstop; only reached if a typed item is forged */
function assertNever(value: never): never {
  throw new Error(`unknown command-palette item: ${String(value)}`)
}

function itemIcon(item: PaletteItem): ReactNode {
  switch (item.kind) {
    case 'action': return <IconNewChatOutline16 size={16} />
    case 'workspace': return <IconFolderClose16 size={16} />
    case 'session': {
      const state = statusState(item.session)
      return state === undefined
        ? <span className={css.iconPlaceholder} />
        : <StateDot state={state} size={10} />
    }
    /* v8 ignore next -- closed-union backstop; typed callers cannot supply another kind */
    default: return assertNever(item)
  }
}

/**
 * Render the global command palette and own its transient keyboard state.
 * @param props - root snapshot hooks, Session operations, result bound, and localized copy.
 * @returns null while closed, otherwise the body-end dialog portal.
 */
export function CommandPalette({
  useSessions, useWorkspaces, openSession, startSession, searchSessions, searchResultLimit, t,
}: CommandPaletteProps) {
  const sessions = useSessions(state => state)
  const workspaces = useWorkspaces(state => state)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'root' | 'workspace'>('root')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [acceptedWorkspaceId, setAcceptedWorkspaceId] = useState<WorkspaceId | undefined>()
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [remote, setRemote] = useState<RemoteState>({
    query: '', status: 'idle', items: [], hasMore: false,
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => { setOpen(false) }, [])
  const openRoot = useCallback(() => {
    setMode('root')
    setQuery('')
    setActive(0)
    setAcceptedWorkspaceId(undefined)
    setStartError(null)
    setOpen(true)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      if (open && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if (event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return
      const usesMeta = /Mac|iPhone|iPad|iPod/u.test(navigator.platform)
      const primaryModifier = usesMeta
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey
      if (!primaryModifier) return
      event.preventDefault()
      event.stopPropagation()
      if (open) close()
      else openRoot()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [close, open, openRoot])

  useEffect(() => {
    if (!open) return
    const appRoot = document.getElementById('root')
    if (appRoot === null) return
    const previous = appRoot.inert
    appRoot.inert = true
    return () => { appRoot.inert = previous }
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    inputRef.current?.focus()
    return () => {
      if (previous !== null && document.contains(previous)) previous.focus()
    }
  }, [open])

  const normalizedQuery = normalizeSearchText(query)
  useEffect(() => {
    if (!open || mode !== 'root' || normalizedQuery.length < CONTENT_SEARCH_MIN_CHARS) {
      setRemote({ query: '', status: 'idle', items: [], hasMore: false })
      return
    }
    const controller = new AbortController()
    setRemote({ query: normalizedQuery, status: 'pending', items: [], hasMore: false })
    const timer = window.setTimeout(() => {
      searchSessions(normalizedQuery, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return
          setRemote({ query: normalizedQuery, status: 'ready', ...result })
        },
        () => {
          if (controller.signal.aborted) return
          setRemote({ query: normalizedQuery, status: 'error', items: [], hasMore: false })
        },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [mode, normalizedQuery, open, searchSessions])

  const contextualId = contextWorkspaceId(sessions, workspaces)
  const contextualWorkspace = workspaces.items.find(item => item.workspaceId === contextualId)
  const acceptedWorkspace = workspaces.items.find(item => item.workspaceId === acceptedWorkspaceId)
  const remoteForQuery = remote.query === normalizedQuery && remote.status === 'ready'
    ? { items: remote.items, hasMore: remote.hasMore }
    : { items: [], hasMore: false }
  const sessionsProjection = sessionResults({
    sessions,
    workspaces,
    query: mode === 'root' ? normalizedQuery : '',
    remote: remoteForQuery,
    limit: searchResultLimit,
  })
  const workspaceProjection = workspaceResults(
    acceptedWorkspace === undefined ? workspaces.items : [acceptedWorkspace],
    acceptedWorkspace === undefined ? normalizedQuery : '',
  )

  const groups = useMemo<PaletteGroup[]>(() => {
    if (mode === 'workspace') {
      return workspaceProjection.length === 0 ? [] : [{
        id: 'workspaces', label: t('group.workspaces'),
        items: workspaceProjection.map(({ workspace }) => ({
          kind: 'workspace', id: `workspace:${workspace.workspaceId}`, workspace,
          title: workspace.title, detail: workspace.path,
        })),
      }]
    }

    const allActions: Array<Extract<PaletteItem, { kind: 'action' }>> = [
      {
        kind: 'action', id: 'new-default',
        title: contextualWorkspace === undefined
          ? t('action.newSession')
          : t('action.newSessionInWorkspace', { workspace: contextualWorkspace.title }),
        detail: contextualWorkspace === undefined
          ? t('action.chooseWorkspace')
          : t('action.currentWorkspace'),
      },
      {
        kind: 'action', id: 'new-in', title: t('action.newSessionIn'),
        detail: t('action.chooseWorkspace'),
      },
    ]
    const actionItems: PaletteItem[] = allActions.filter(item => normalizedQuery === '' || (
      rankAction(item, normalizedQuery) > 0
    ))
    const result: PaletteGroup[] = []
    if (actionItems.length > 0) result.push({ id: 'actions', label: t('group.actions'), items: actionItems })
    if (normalizedQuery !== '' && workspaceProjection.length > 0) {
      result.push({
        id: 'workspaces', label: t('group.workspaces'),
        items: workspaceProjection.map(({ workspace }) => ({
          kind: 'workspace', id: `workspace:${workspace.workspaceId}`, workspace,
          title: workspace.title, detail: workspace.path,
        })),
      })
    }
    if (sessionsProjection.items.length > 0) {
      result.push({
        id: normalizedQuery === '' ? 'recent' : 'sessions',
        label: normalizedQuery === '' ? t('group.recent') : t('group.sessions'),
        items: sessionsProjection.items.map((session): PaletteItem => {
          const detail = session.snippet ?? session.workspace?.path ?? session.summary.cwd
          return {
            kind: 'session', id: `session:${session.summary.id}`, session,
            title: session.summary.displayTitle,
            ...(detail === undefined ? {} : { detail }),
          }
        }),
      })
    }
    return result
  }, [contextualWorkspace, mode, normalizedQuery, sessionsProjection.items, t, workspaceProjection])

  const items = groups.flatMap(group => group.items)
  const itemKey = items.map(item => item.id).join('\0')
  useEffect(() => { setActive(items.length === 0 ? -1 : 0) }, [itemKey, items.length])
  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [active, itemKey])

  const enterWorkspaceMode = (): void => {
    setMode('workspace')
    setQuery('')
    setActive(0)
    setAcceptedWorkspaceId(undefined)
    setStartError(null)
  }

  const leaveWorkspaceMode = (): void => {
    setMode('root')
    setQuery('')
    setAcceptedWorkspaceId(undefined)
  }

  const createSession = async (workspaceId?: WorkspaceId): Promise<void> => {
    setBusy(true)
    setStartError(null)
    try {
      await startSession(workspaceId)
      close()
    } catch (error) {
      setStartError(t('error.start', {
        message: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setBusy(false)
    }
  }

  const execute = (item: PaletteItem | undefined): void => {
    if (item === undefined || busy) return
    switch (item.kind) {
      case 'action':
        if (item.id === 'new-in' || (contextualWorkspace === undefined && workspaces.items.length > 0)) {
          enterWorkspaceMode()
        } else {
          void createSession(contextualWorkspace?.workspaceId)
        }
        return
      case 'workspace':
        void createSession(item.workspace.workspaceId)
        return
      case 'session':
        close()
        openSession(item.session.summary.id)
        return
      /* v8 ignore next -- closed-union backstop; typed callers cannot supply another kind */
      default: return assertNever(item)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (items.length > 0) setActive(index => (index + 1 + items.length) % items.length)
        return
      case 'ArrowUp':
        event.preventDefault()
        if (items.length > 0) setActive(index => (index - 1 + items.length) % items.length)
        return
      case 'Home':
        event.preventDefault()
        if (items.length > 0) setActive(0)
        return
      case 'End':
        event.preventDefault()
        if (items.length > 0) setActive(items.length - 1)
        return
      case 'Enter':
        event.preventDefault()
        if (mode === 'workspace' && acceptedWorkspace !== undefined) void createSession(acceptedWorkspace.workspaceId)
        else execute(items[active])
        return
      case 'Tab': {
        event.preventDefault()
        const item = items[active]
        if (mode === 'workspace' && item?.kind === 'workspace') {
          setAcceptedWorkspaceId(item.workspace.workspaceId)
          setQuery(item.workspace.title)
        }
        return
      }
      case 'Backspace':
        if (mode === 'workspace' && query === '') {
          event.preventDefault()
          setMode('root')
          setActive(0)
          setAcceptedWorkspaceId(undefined)
        }
        return
      case 'Escape':
        event.preventDefault()
        close()
        return
      default:
    }
  }

  if (!open) return null
  const activeItem = items[active]
  const activeId = activeItem === undefined ? undefined : `command-palette-${activeItem.id.replaceAll(':', '-')}`
  const pending = remote.query === normalizedQuery && remote.status === 'pending'
  const searchFailed = remote.query === normalizedQuery && remote.status === 'error'
  const empty = items.length === 0 && !pending

  return createPortal((
    <div className={css.root} data-command-palette="">
      <div className={css.mask} aria-hidden="true" onPointerDown={close} />
      <div className={css.dialog} role="dialog" aria-modal="true" aria-label={t('dialog.aria')}>
        <div className={css.searchRow}>
          {mode === 'workspace'
            ? (
              <button
                type="button"
                className={css.back}
                aria-label={t('footer.back')}
                onClick={leaveWorkspaceMode}
                onMouseDown={(event) => { event.preventDefault() }}
              >
                <IconChevronLeftOutline14 />
              </button>
            )
            : <span className={css.searchIcon} aria-hidden="true"><IconSearchOutline16 /></span>}
          <input
            ref={inputRef}
            className={css.search}
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={t('search.aria')}
            placeholder={mode === 'root' ? t('search.rootPlaceholder') : t('search.workspacePlaceholder')}
            value={query}
            disabled={busy}
            onChange={(event) => {
              setQuery(sanitizeSearchQuery(event.currentTarget.value))
              setAcceptedWorkspaceId(undefined)
              setStartError(null)
            }}
            onKeyDown={onKeyDown}
          />
          {acceptedWorkspace !== undefined && (
            <span className={css.accepted} role="status">{t('workspace.accepted', { workspace: acceptedWorkspace.title })}</span>
          )}
        </div>
        <div ref={listRef} id="command-palette-results" className={css.panel} role="listbox" aria-busy={busy || pending}>
          {groups.map(group => (
            <div key={group.id} className={css.group} role="group" aria-label={group.label}>
              <div className={css.groupLabel}>{group.label}</div>
              <div className={css.rows}>
                {group.items.map((item) => {
                  const index = items.findIndex(candidate => candidate.id === item.id)
                  const selected = index === active
                  const current = item.kind === 'session' && item.session.summary.id === sessions.current
                  return (
                    <div
                      key={item.id}
                      id={`command-palette-${item.id.replaceAll(':', '-')}`}
                      className={clsx(css.row, selected && css.rowActive)}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => { event.preventDefault() }}
                      onMouseEnter={() => { setActive(index) }}
                      onClick={() => { execute(item) }}
                    >
                      <span className={css.itemIcon} aria-hidden="true">{itemIcon(item)}</span>
                      <span className={css.itemText}>
                        <span className={css.itemTitle}>{item.title}</span>
                        {item.detail !== undefined && <span className={css.itemDetail}>{item.detail}</span>}
                      </span>
                      {item.kind === 'session' && statusLabel(item.session, t) !== undefined && (
                        <span className={css.statusBadge}>{statusLabel(item.session, t)}</span>
                      )}
                      {current && <span className={css.badge}>{t('session.current')}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {pending && <div className={css.status} role="status">{t('status.searching')}</div>}
          {searchFailed && <div className={css.warning} role="status">{t('error.search')}</div>}
          {sessionsProjection.hasMore && <div className={css.status}>{t('status.hasMore', { n: searchResultLimit })}</div>}
          {startError !== null && <div className={css.error} role="alert">{startError}</div>}
          {empty && <div className={css.empty}>{mode === 'root' ? t('empty.root') : t('empty.workspaces')}</div>}
        </div>
        <div className={css.footer}>
          <Hint keys={['↑', '↓']} label={t('footer.navigate')} />
          <Hint keys={['Enter']} label={mode === 'workspace' ? t('footer.create') : t('footer.open')} />
          {mode === 'workspace' && <Hint keys={['Tab']} label={t('footer.complete')} />}
          {mode === 'workspace' && <Hint keys={['⌫']} label={t('footer.back')} />}
          <Hint keys={['Esc']} label={t('footer.close')} />
        </div>
      </div>
    </div>
  ), document.body)
}

function rankAction(item: Extract<PaletteItem, { kind: 'action' }>, query: string): number {
  const haystack = normalizeSearchText(`${item.title} ${item.detail} new session create workspace`)
  return haystack.includes(query) ? 1 : 0
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className={css.hint}>
      <span className={css.keys}>{keys.map(key => <kbd key={key}>{key}</kbd>)}</span>
      <span>{label}</span>
    </span>
  )
}
