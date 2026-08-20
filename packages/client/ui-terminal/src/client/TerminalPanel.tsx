import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconChevronLeftOutline14, IconCloseOutline16, IconCodeOutline16,
  IconPlusOutline16, IconRefreshOutline16, IconSettingsOutline16, IconTrashOutline16, Modal, Tooltip,
} from '@monotykamary/dsh-client-ui-primitives'
import type {
  BrowserTerminalHandshake, BrowserTerminalPlacement, BrowserTerminalSnapshot,
} from '@monotykamary/dsh-terminal-web/protocol'
import {
  BrowserTerminalConnection, BrowserTerminalError, killBrowserTerminal, listBrowserTerminals,
} from './connection.ts'
import type { TerminalWebSocketFactory } from './connection.ts'
import type { WorkbenchTerminalProps, BottomTerminalProps } from './contract.ts'
import type { TerminalPreferences } from './preferences.ts'
import { TerminalSettings } from './TerminalSettings.tsx'
import { TerminalViewport } from './TerminalViewport.tsx'
import type { TerminalDimensions, XtermSurface } from './xterm-surface.ts'
import { terminalTheme, type TerminalColorScheme } from './themes.ts'
import css from './TerminalPanel.module.css'

interface TerminalPanelProps {
  readonly sessionId: string
  readonly placement: BrowserTerminalPlacement
  readonly preferences: TerminalPreferences
  readonly colorScheme: TerminalColorScheme
  readonly updatePreferences: (patch: Partial<TerminalPreferences>) => void
  readonly resetPreferences: () => void
  readonly socketFactory: TerminalWebSocketFactory
  readonly workbenchPanelOrdinal?: number
  readonly openWorkbenchPanel?: () => void
  readonly ensureWorkbenchPanels?: (count: number) => void
  readonly closePanel?: () => void
  readonly layoutHeight?: number
  readonly t: WorkbenchTerminalProps['t']
}

type TerminalPhase = 'connecting' | 'ready' | 'error'
type SplitDirection = 'horizontal' | 'vertical'

interface TerminalItem {
  readonly key: string
  readonly terminalId?: string
}

interface TerminalGroup {
  readonly id: string
  readonly items: readonly TerminalItem[]
  readonly splitDirection: SplitDirection
}

function SplitIcon({ direction }: { readonly direction: SplitDirection }) {
  return direction === 'horizontal' ? (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" />
      <path d="M7 2v10" stroke="currentColor" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" />
      <path d="M1.5 7h11" stroke="currentColor" />
    </svg>
  )
}

function ExpandIcon({ expanded }: { readonly expanded: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {expanded ? (
        <path d="M6 2v4H2M10 14v-4h4M6 6 2 2m8 8 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6 10H2v4M10 6h4V2M6 10l-4 4m8-8 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

interface TerminalPaneProps {
  readonly item: TerminalItem
  readonly sessionId: string
  readonly placement: BrowserTerminalPlacement
  readonly preferences: TerminalPreferences
  readonly colorScheme: TerminalColorScheme
  readonly socketFactory: TerminalWebSocketFactory
  readonly layoutHeight?: number
  readonly active: boolean
  readonly onActivate: () => void
  readonly onConnected: (snapshot: BrowserTerminalSnapshot) => void
  readonly onEnded: () => void
  readonly t: WorkbenchTerminalProps['t']
}

function TerminalPane({
  item, sessionId, placement, preferences, colorScheme, socketFactory, layoutHeight, active,
  onActivate, onConnected, onEnded, t,
}: TerminalPaneProps) {
  const [surface, setSurface] = useState<XtermSurface | null>(null)
  const [phase, setPhase] = useState<TerminalPhase>('connecting')
  const [error, setError] = useState<string | null>(null)
  const connectionRef = useRef<BrowserTerminalConnection | null>(null)
  const dimensionsRef = useRef<TerminalDimensions>({ cols: 80, rows: 24 })
  const generationRef = useRef(0)
  const itemRef = useRef(item)
  itemRef.current = item
  const activeRef = useRef(active)
  activeRef.current = active
  const callbacksRef = useRef({ onConnected, onEnded })
  callbacksRef.current = { onConnected, onEnded }

  const connect = useCallback(async (): Promise<void> => {
    if (surface === null) return
    const generation = ++generationRef.current
    connectionRef.current?.close()
    connectionRef.current = null
    surface.reset()
    setPhase('connecting')
    setError(null)
    const dimensions = dimensionsRef.current
    const terminalId = itemRef.current.terminalId
    const handshake: Extract<BrowserTerminalHandshake, { type: 'open' | 'attach' }> = terminalId === undefined
      ? { type: 'open', sessionId, placement, ...dimensions }
      : { type: 'attach', sessionId, terminalId, ...dimensions }
    try {
      const live = await BrowserTerminalConnection.connect(socketFactory, handshake, {
        output: (bytes) => { if (generation === generationRef.current) surface.write(bytes) },
        exit: () => { if (generation === generationRef.current) callbacksRef.current.onEnded() },
        killed: () => { if (generation === generationRef.current) callbacksRef.current.onEnded() },
        disconnected: (failure) => {
          if (generation !== generationRef.current) return
          setError(failure?.message ?? t('disconnected'))
          setPhase('error')
        },
      })
      if (generation !== generationRef.current) {
        live.close()
        return
      }
      connectionRef.current = live
      live.resize(dimensionsRef.current.cols, dimensionsRef.current.rows)
      callbacksRef.current.onConnected(live.terminal)
      setPhase('ready')
      if (handshake.type === 'open') surface.showCursor()
      /* v8 ignore else -- a pane can become inactive only while this asynchronous attach is settling. */
      if (activeRef.current) surface.focus()
    } catch (failure: unknown) {
      if (generation !== generationRef.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
      setPhase('error')
    }
  }, [placement, sessionId, socketFactory, surface, t])

  useEffect(() => {
    void connect()
    return () => {
      generationRef.current += 1
      connectionRef.current?.close()
      connectionRef.current = null
    }
  }, [connect])

  useEffect(() => {
    if (active && phase === 'ready') surface?.focus()
  }, [active, phase, surface])

  const onInput = (input: string): void => {
    try {
      connectionRef.current?.write(input)
    } catch (failure: unknown) {
      setError(failure instanceof BrowserTerminalError ? failure.message : String(failure))
      setPhase('error')
    }
  }

  const onResize = (dimensions: TerminalDimensions): void => {
    dimensionsRef.current = dimensions
    try {
      connectionRef.current?.resize(dimensions.cols, dimensions.rows)
    } catch {
      // A close can win the observer callback; connection state already reports that loss.
    }
  }

  return (
    <div className={css.pane} data-terminal-pane="" data-terminal-phase={phase} data-active={active || undefined} onMouseDown={onActivate}>
      <TerminalViewport
        preferences={preferences}
        colorScheme={colorScheme}
        onReady={setSurface}
        onInput={onInput}
        onResize={onResize}
        {...layoutHeight === undefined ? {} : { layoutHeight }}
      />
      {phase === 'error' && (
        <div className={css.status} data-phase={phase}>
          <span>{error as string}</span>
          <button type="button" className={css.retry} onClick={() => { void connect() }}>
            <IconRefreshOutline16 size={14} />
            <span>{t('retry')}</span>
          </button>
        </div>
      )}
    </div>
  )
}

/** Interactive terminal groups, split panes, toolbar, settings, and fullscreen presentation. */
export function TerminalPanel({
  sessionId, placement, preferences, colorScheme, updatePreferences, resetPreferences, socketFactory,
  workbenchPanelOrdinal, openWorkbenchPanel, ensureWorkbenchPanels, closePanel, layoutHeight, t,
}: TerminalPanelProps) {
  const [groups, setGroups] = useState<readonly TerminalGroup[]>([])
  const [snapshots, setSnapshots] = useState<Readonly<Record<string, BrowserTerminalSnapshot>>>({})
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [actionsExpanded, setActionsExpanded] = useState(false)
  // Hover owns disclosure: the pointer entering reveals the toolbar, so the
  // first chevron click must not close what the pointer just opened. The
  // click only toggles a keyboard- or touch-opened toolbar (no hover).
  const hoverOwnedRef = useRef(false)
  const floatingActionsRef = useRef<HTMLDivElement | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listPending, setListPending] = useState(true)
  const ensureWorkbenchPanelsRef = useRef(ensureWorkbenchPanels)
  ensureWorkbenchPanelsRef.current = ensureWorkbenchPanels
  const nextId = useRef(0)

  const allocate = (prefix: string): string => `${prefix}-${String(++nextId.current)}`

  const createInitialGroups = useCallback((terminals: readonly BrowserTerminalSnapshot[]): void => {
    const running = terminals.filter(terminal => terminal.status.kind === 'running')
    if (placement === 'right') {
      ensureWorkbenchPanelsRef.current?.(Math.max(running.length, 1))
      const terminal = running[(workbenchPanelOrdinal ?? 1) - 1]
      const key = terminal?.terminalId ?? allocate('terminal')
      const id = allocate('group')
      setGroups([{ id, items: [{ key, ...terminal === undefined ? {} : { terminalId: terminal.terminalId } }], splitDirection: 'horizontal' }])
      setSnapshots(terminal === undefined ? {} : { [key]: terminal })
      setActiveGroupId(id)
      setActiveItemKey(key)
      return
    }
    if (running.length === 0) {
      const key = allocate('terminal')
      const id = allocate('group')
      setGroups([{ id, items: [{ key }], splitDirection: 'horizontal' }])
      setSnapshots({})
      setActiveGroupId(id)
      setActiveItemKey(key)
      return
    }
    const nextSnapshots: Record<string, BrowserTerminalSnapshot> = {}
    const nextGroups = running.map((terminal) => {
      const key = terminal.terminalId
      nextSnapshots[key] = terminal
      return { id: allocate('group'), items: [{ key, terminalId: terminal.terminalId }], splitDirection: 'horizontal' as const }
    })
    const firstGroup = nextGroups[0] as TerminalGroup
    const firstItem = firstGroup.items[0] as TerminalItem
    setGroups(nextGroups)
    setSnapshots(nextSnapshots)
    setActiveGroupId(firstGroup.id)
    setActiveItemKey(firstItem.key)
  }, [placement, workbenchPanelOrdinal])

  const refresh = useCallback((): void => {
    setListError(null)
    setListPending(true)
    void listBrowserTerminals(socketFactory, sessionId, placement)
      .then(createInitialGroups)
      .catch((failure: unknown) => {
        setListError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => { setListPending(false) })
  }, [createInitialGroups, placement, sessionId, socketFactory])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!actionsExpanded) return
    const collapseOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && floatingActionsRef.current?.contains(event.target) === true) return
      setActionsExpanded(false)
    }
    document.addEventListener('pointerdown', collapseOutside)
    return () => { document.removeEventListener('pointerdown', collapseOutside) }
  }, [actionsExpanded])

  const activeGroup = groups.find(group => group.id === activeGroupId) ?? groups[0]
  const activeItem = activeGroup?.items.find(item => item.key === activeItemKey) ?? activeGroup?.items[0]
  const totalItems = groups.reduce((count, group) => count + group.items.length, 0)
  const showSidebar = placement === 'bottom' ? totalItems > 1 : (activeGroup?.items.length ?? 0) > 1

  const connected = (key: string, snapshot: BrowserTerminalSnapshot): void => {
    setSnapshots(current => ({ ...current, [key]: snapshot }))
    setGroups(current => current.map(group => ({
      ...group,
      items: group.items.map(item => item.key === key ? { key, terminalId: snapshot.terminalId } : item),
    })))
  }

  const remove = (key: string): void => {
    const terminalId = snapshots[key]?.terminalId
    const nextGroups = groups
      .map(group => ({ ...group, items: group.items.filter(item => item.key !== key) }))
      .filter(group => group.items.length > 0)
    const formerGroup = groups.find(group => group.items.some(item => item.key === key)) as TerminalGroup
    const formerIndex = formerGroup.items.findIndex(item => item.key === key)
    const nextGroup = nextGroups.find(group => group.id === formerGroup.id) ?? nextGroups[0]
    const nextItem = nextGroup?.items[Math.min(formerIndex, nextGroup.items.length - 1)] ?? nextGroup?.items[0]
    setGroups(nextGroups)
    setSnapshots(current => Object.fromEntries(
      Object.entries(current).filter(([itemKey]) => itemKey !== key),
    ))
    setActiveGroupId(nextGroup?.id ?? null)
    setActiveItemKey(nextItem?.key ?? null)
    if (terminalId !== undefined) {
      void killBrowserTerminal(socketFactory, sessionId, terminalId).catch((failure: unknown) => {
        setListError(failure instanceof Error ? failure.message : String(failure))
      })
    }
  }

  const addToGroup = (direction: SplitDirection): void => {
    /* v8 ignore next -- split and New Terminal controls cannot call this without an active group. */
    if (activeGroup === undefined) return
    if (activeGroup.items.length >= 3) return
    const key = allocate('terminal')
    setGroups(current => current.map(group => group.id === activeGroup.id
      ? { ...group, items: [...group.items, { key }], splitDirection: direction }
      : group))
    setActiveItemKey(key)
  }

  const addGroup = (): void => {
    const key = allocate('terminal')
    const id = allocate('group')
    setGroups(current => [...current, { id, items: [{ key }], splitDirection: 'horizontal' }])
    setActiveGroupId(id)
    setActiveItemKey(key)
  }

  const newTerminal = (): void => {
    if (placement === 'right') openWorkbenchPanel?.()
    else if (activeGroup === undefined) addGroup()
    else addToGroup(activeGroup.splitDirection)
  }

  const activateGroup = (group: TerminalGroup): void => {
    setActiveGroupId(group.id)
    setActiveItemKey((group.items[0] as TerminalItem).key)
  }

  const actionButtons = (
    <div className={css.actionGroup}>
      <Tooltip label={t('splitHorizontal')} side="bottom">
        <button type="button" className={css.actionButton} aria-label={t('splitHorizontal')} disabled={activeGroup === undefined || activeGroup.items.length >= 3} onClick={() => { addToGroup('horizontal') }}>
          <SplitIcon direction="horizontal" />
        </button>
      </Tooltip>
      <Tooltip label={t('splitVertical')} side="bottom">
        <button type="button" className={css.actionButton} aria-label={t('splitVertical')} disabled={activeGroup === undefined || activeGroup.items.length >= 3} onClick={() => { addToGroup('vertical') }}>
          <SplitIcon direction="vertical" />
        </button>
      </Tooltip>
      <Tooltip label={t('new')} side="bottom">
        <button type="button" className={css.actionButton} aria-label={t('new')} onClick={newTerminal}>
          <IconPlusOutline16 size={14} />
        </button>
      </Tooltip>
      <Tooltip label={t('kill')} side="bottom">
        <button type="button" className={css.actionButton} aria-label={t('kill')} disabled={activeItem === undefined} onClick={() => { remove((activeItem as TerminalItem).key) }}>
          <IconTrashOutline16 size={14} />
        </button>
      </Tooltip>
      <Tooltip label={t('settings')} side="bottom">
        <button type="button" className={css.actionButton} aria-label={t('settings')} aria-expanded={settingsOpen} onClick={() => { setSettingsOpen(open => !open) }}>
          <IconSettingsOutline16 size={14} />
        </button>
      </Tooltip>
      {closePanel !== undefined && (
        <Tooltip label={t('close')} side="bottom">
          <button type="button" className={css.actionButton} aria-label={t('close')} onClick={closePanel}>
            <IconCloseOutline16 size={14} />
          </button>
        </Tooltip>
      )}
    </div>
  )

  const groupTabs = null


  const sidebarGroups = placement === 'right' && activeGroup !== undefined ? [activeGroup] : groups

  return (
    <section className={css.root} data-terminal-panel={placement} data-fullscreen={fullscreen || undefined}>
      {groupTabs}
      <Modal open={settingsOpen} onClose={() => { setSettingsOpen(false) }} title={t('settings')} closeLabel={t('settings.close')} className={css.settingsDialog as string}>
        <TerminalSettings preferences={preferences} update={updatePreferences} reset={resetPreferences} t={t} />
      </Modal>
      <div className={css.terminalBody} style={{ backgroundColor: terminalTheme(colorScheme).background }}>
        <div className={css.paneArea}>
          {activeGroup === undefined ? (listPending ? null : (
            <div className={css.emptyState}>
              <span>{listError ?? t('empty')}</span>
              <button type="button" className={css.retry} onClick={listError === null ? addGroup : refresh}>
                {listError === null ? <IconPlusOutline16 size={14} /> : <IconRefreshOutline16 size={14} />}
                <span>{listError === null ? t('new') : t('retry')}</span>
              </button>
            </div>
          )) : (
            <div className={css.paneGrid} data-direction={activeGroup.splitDirection} style={{ '--terminal-pane-count': activeGroup.items.length } as React.CSSProperties}>
              {activeGroup.items.map(item => (
                <TerminalPane
                  key={item.key}
                  item={item}
                  sessionId={sessionId}
                  placement={placement}
                  preferences={preferences}
                  colorScheme={colorScheme}
                  socketFactory={socketFactory}
                  {...layoutHeight === undefined ? {} : { layoutHeight }}
                  active={item.key === activeItem?.key}
                  onActivate={() => { setActiveItemKey(item.key) }}
                  onConnected={(snapshot) => { connected(item.key, snapshot) }}
                  onEnded={() => { remove(item.key) }}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
        {!listPending && !showSidebar && (
          <div
            ref={floatingActionsRef}
            className={css.floatingActions}
            data-terminal-floating-actions=""
            data-expanded={actionsExpanded || undefined}
            onMouseEnter={() => { hoverOwnedRef.current = true; setActionsExpanded(true) }}
            onMouseLeave={() => { hoverOwnedRef.current = false; setActionsExpanded(false) }}
          >
            <Tooltip label={actionsExpanded ? t('actions.collapse') : t('actions.expand')} side="bottom">
              <button
                type="button"
                className={css.actionToggle}
                aria-label={actionsExpanded ? t('actions.collapse') : t('actions.expand')}
                aria-expanded={actionsExpanded}
                onClick={() => {
                  if (hoverOwnedRef.current) return
                  setActionsExpanded(value => !value)
                }}
              >
                <IconChevronLeftOutline14 className={css.actionChevron} />
              </button>
            </Tooltip>
            <div
              className={css.actionReveal}
              data-terminal-action-reveal=""
              aria-hidden={!actionsExpanded}
              ref={(element) => {
                if (element === null) return
                if (actionsExpanded) element.removeAttribute('inert')
                else element.setAttribute('inert', '')
              }}
            >
              <div className={css.actionRevealInner}>
                <Tooltip label={fullscreen ? t('restore') : t('fullscreen')} side="bottom">
                  <button type="button" className={css.actionButton} aria-label={fullscreen ? t('restore') : t('fullscreen')} onClick={() => { setFullscreen(value => !value) }}>
                    <ExpandIcon expanded={fullscreen} />
                  </button>
                </Tooltip>
                {actionButtons}
              </div>
            </div>
          </div>
        )}
        {showSidebar && (
          <aside className={css.terminalSidebar} aria-label={t('groups')}>
            <div className={css.sidebarActions} data-terminal-sidebar-actions="">
              {(
                <Tooltip label={fullscreen ? t('restore') : t('fullscreen')} side="bottom">
                  <button type="button" className={css.actionButton} aria-label={fullscreen ? t('restore') : t('fullscreen')} onClick={() => { setFullscreen(value => !value) }}>
                    <ExpandIcon expanded={fullscreen} />
                  </button>
                </Tooltip>
              )}
              {actionButtons}
            </div>
            <div className={css.groupTree}>
              {sidebarGroups.map((group, groupIndex) => (
                <div key={group.id} className={css.groupBlock}>
                  <button type="button" className={css.groupLabel} data-terminal-group-label="" data-active={group.id === activeGroup?.id || undefined} onClick={() => { activateGroup(group) }}>
                    {t('group', { number: groupIndex + 1 })}
                  </button>
                  <div className={css.groupItems}>
                    {group.items.map((item) => {
                      const snapshot = snapshots[item.key]
                      const label = snapshot?.label ?? t('connectingShort')
                      return (
                        <div key={item.key} className={css.groupItemRow} data-terminal-group-row="" data-active={item.key === activeItem?.key || undefined}>
                          <button type="button" className={css.groupItem} onClick={() => { setActiveGroupId(group.id); setActiveItemKey(item.key) }}>
                            <span className={css.branch}>└</span>
                            <IconCodeOutline16 size={13} />
                            <span>{label}</span>
                          </button>
                          <button type="button" className={css.groupItemClose} aria-label={t('closePane', { name: label })} onClick={() => { remove(item.key) }}>
                            <IconCloseOutline16 size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}

/** Right-workbench terminal surface wrapper. */
export function WorkbenchTerminal({
  sessionId, workbenchPanelOrdinal, usePreferences, useColorScheme, updatePreferences, resetPreferences,
  socketFactory, openWorkbenchPanel, ensureWorkbenchPanels, t,
}: WorkbenchTerminalProps) {
  const preferences = usePreferences(value => value)
  const colorScheme = useColorScheme(value => value)
  return <TerminalPanel sessionId={sessionId} placement="right" preferences={preferences} colorScheme={colorScheme} updatePreferences={updatePreferences} resetPreferences={resetPreferences} socketFactory={socketFactory} workbenchPanelOrdinal={workbenchPanelOrdinal ?? 1} openWorkbenchPanel={openWorkbenchPanel} ensureWorkbenchPanels={ensureWorkbenchPanels} t={t} />
}

/** Bottom-panel terminal surface wrapper. */
export function BottomTerminal({
  sessionId, closePanel, height, usePreferences, useColorScheme, updatePreferences, resetPreferences, socketFactory, t,
}: BottomTerminalProps) {
  const preferences = usePreferences(value => value)
  const colorScheme = useColorScheme(value => value)
  return <TerminalPanel sessionId={sessionId} placement="bottom" preferences={preferences} colorScheme={colorScheme} updatePreferences={updatePreferences} resetPreferences={resetPreferences} socketFactory={socketFactory} closePanel={closePanel} layoutHeight={height} t={t} />
}
