import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconCloseOutline16, IconPlusOutline16, IconRefreshOutline16, IconSettingsOutline16,
  IconTrashOutline16, Modal, Tooltip,
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
import { terminalTheme } from './themes.ts'
import css from './TerminalPanel.module.css'

interface TerminalPanelProps {
  readonly sessionId: string
  readonly placement: BrowserTerminalPlacement
  readonly preferences: TerminalPreferences
  readonly updatePreferences: (patch: Partial<TerminalPreferences>) => void
  readonly resetPreferences: () => void
  readonly socketFactory: TerminalWebSocketFactory
  readonly closePanel?: () => void
  readonly layoutHeight?: number
  readonly t: WorkbenchTerminalProps['t']
}

type TerminalPhase = 'connecting' | 'ready' | 'exited' | 'error'

function running(snapshot: BrowserTerminalSnapshot | undefined): snapshot is BrowserTerminalSnapshot {
  return snapshot?.status.kind === 'running'
}

/** Interactive terminal tabs, toolbar, compact settings tray, and stable xterm viewport. */
export function TerminalPanel({
  sessionId, placement, preferences, updatePreferences, resetPreferences, socketFactory,
  closePanel, layoutHeight, t,
}: TerminalPanelProps) {
  const [surface, setSurface] = useState<XtermSurface | null>(null)
  const [terminals, setTerminals] = useState<readonly BrowserTerminalSnapshot[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [phase, setPhase] = useState<TerminalPhase>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId
  const connectionRef = useRef<BrowserTerminalConnection | null>(null)
  const dimensionsRef = useRef<TerminalDimensions>({ cols: 80, rows: 24 })
  const generationRef = useRef(0)
  const endedGenerationRef = useRef<number | null>(null)
  const refreshRef = useRef<() => void>(() => {})
  const retireTerminalRef = useRef<(terminalId: string) => void>(() => {})

  const connect = useCallback(async (
    handshake: Extract<BrowserTerminalHandshake, { type: 'open' | 'attach' }>,
    generation: number,
  ): Promise<void> => {
    connectionRef.current?.close()
    connectionRef.current = null
    endedGenerationRef.current = null
    surface?.reset()
    setPhase('connecting')
    setError(null)
    let connectedTerminalId = handshake.type === 'attach' ? handshake.terminalId : undefined
    try {
      const live = await BrowserTerminalConnection.connect(socketFactory, handshake, {
        output: (bytes) => {
          if (generation === generationRef.current) surface?.write(bytes)
        },
        exit: (_status) => {
          if (generation !== generationRef.current || connectedTerminalId === undefined) return
          endedGenerationRef.current = generation
          retireTerminalRef.current(connectedTerminalId)
        },
        killed: () => {
          if (generation !== generationRef.current) return
          endedGenerationRef.current = generation
          refreshRef.current()
        },
        disconnected: (failure) => {
          if (generation !== generationRef.current || endedGenerationRef.current === generation) return
          setError(failure?.message ?? t('disconnected'))
          setPhase('error')
        },
      })
      if (generation !== generationRef.current) {
        live.close()
        return
      }
      connectionRef.current = live
      const currentDimensions = dimensionsRef.current
      live.resize(currentDimensions.cols, currentDimensions.rows)
      connectedTerminalId = live.terminal.terminalId
      setActiveId(live.terminal.terminalId)
      setTerminals((current) => {
        const existing = current.some(terminal => terminal.terminalId === live.terminal.terminalId)
        return existing
          ? current.map(terminal => terminal.terminalId === live.terminal.terminalId ? live.terminal : terminal)
          : [...current, live.terminal]
      })
      setPhase('ready')
      if (handshake.type === 'open') surface?.showCursor()
      surface?.focus()
    } catch (failure: unknown) {
      if (generation !== generationRef.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
      setPhase('error')
    }
  }, [socketFactory, surface, t])

  const refresh = useCallback((): void => {
    if (surface === null) return
    const generation = ++generationRef.current
    connectionRef.current?.close()
    connectionRef.current = null
    setPhase('connecting')
    setError(null)
    void listBrowserTerminals(socketFactory, sessionId, placement).then((items) => {
      if (generation !== generationRef.current) return
      setTerminals(items)
      const current = items.find(terminal => terminal.terminalId === activeIdRef.current)
      const target = running(current) ? current : items.find(terminal => terminal.status.kind === 'running')
      const dimensions = dimensionsRef.current
      if (target === undefined) {
        return connect({ type: 'open', sessionId, placement, ...dimensions }, generation)
      }
      return connect({
        type: 'attach', sessionId, terminalId: target.terminalId, ...dimensions,
      }, generation)
    }).catch((failure: unknown) => {
      if (generation !== generationRef.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
      setPhase('error')
    })
  }, [connect, placement, sessionId, socketFactory, surface])
  refreshRef.current = refresh

  useEffect(() => {
    if (surface === null) return
    refresh()
    return () => {
      generationRef.current += 1
      connectionRef.current?.close()
      connectionRef.current = null
    }
  }, [refresh])

  const openNew = (): void => {
    const generation = ++generationRef.current
    const dimensions = dimensionsRef.current
    void connect({ type: 'open', sessionId, placement, ...dimensions }, generation)
  }

  const activate = (terminal: BrowserTerminalSnapshot): void => {
    if (terminal.terminalId === activeId && phase !== 'error') return
    const generation = ++generationRef.current
    if (terminal.status.kind === 'exited') {
      connectionRef.current?.close()
      connectionRef.current = null
      endedGenerationRef.current = generation
      setActiveId(terminal.terminalId)
      setPhase('exited')
      setError(null)
      surface?.reset()
      return
    }
    const dimensions = dimensionsRef.current
    void connect({
      type: 'attach', sessionId, terminalId: terminal.terminalId, ...dimensions,
    }, generation)
  }

  const retireTerminal = (terminalId: string): void => {
    const remaining = terminals.filter(terminal => terminal.terminalId !== terminalId)
    setTerminals(remaining)
    const closingActive = terminalId === activeId
    const generation = closingActive ? ++generationRef.current : generationRef.current
    if (closingActive) {
      connectionRef.current?.close()
      connectionRef.current = null
      setActiveId(null)
      surface?.reset()
      const target = remaining.find(terminal => terminal.status.kind === 'running')
      if (target === undefined) {
        endedGenerationRef.current = generation
        setPhase('exited')
        setError(null)
      } else {
        const dimensions = dimensionsRef.current
        void connect({
          type: 'attach', sessionId, terminalId: target.terminalId, ...dimensions,
        }, generation)
      }
    }
    void killBrowserTerminal(socketFactory, sessionId, terminalId).catch((failure: unknown) => {
      if (generation !== generationRef.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
      setPhase('error')
    })
  }
  retireTerminalRef.current = retireTerminal

  const closeTerminal = (terminal: BrowserTerminalSnapshot): void => {
    retireTerminal(terminal.terminalId)
  }

  const killActive = (): void => {
    if (activeId === null) return
    if (phase === 'ready' && connectionRef.current !== null) {
      connectionRef.current.kill()
      return
    }
    const generation = ++generationRef.current
    void killBrowserTerminal(socketFactory, sessionId, activeId).then(() => {
      if (generation === generationRef.current) refreshRef.current()
    }).catch((failure: unknown) => {
      if (generation !== generationRef.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
      setPhase('error')
    })
  }

  const onInput = (input: string): void => {
    try {
      connectionRef.current?.write(input)
    } catch (failure: unknown) {
      const message = failure instanceof BrowserTerminalError ? failure.message : String(failure)
      setError(message)
      setPhase('error')
    }
  }

  const onResize = (dimensions: TerminalDimensions): void => {
    dimensionsRef.current = dimensions
    try {
      connectionRef.current?.resize(dimensions.cols, dimensions.rows)
    } catch {
      // A close can win the resize observer callback; the connection state already reports that loss.
    }
  }

  return (
    <section className={css.root} data-terminal-panel={placement}>
      <div className={css.toolbar}>
        <div className={css.tabs} role="tablist" aria-label={t('surface')}>
          {terminals.map(terminal => (
            <div
              key={terminal.terminalId}
              className={css.tabCell}
              data-active={terminal.terminalId === activeId || undefined}
              data-status={terminal.status.kind}
            >
              <button
                type="button"
                className={css.tabClose}
                aria-label={`${t('closeTab')}: ${terminal.label}`}
                onClick={() => { closeTerminal(terminal) }}
              >
                <span className={css.statusDot} />
                <span className={css.tabCloseGlyph}><IconCloseOutline16 size={12} /></span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={terminal.terminalId === activeId}
                className={css.tab}
                onClick={() => { activate(terminal) }}
              >
                <span className={css.tabLabel}>{terminal.label}</span>
              </button>
            </div>
          ))}
        </div>
        <div className={css.actions}>
          <Tooltip label={t('new')} side="bottom">
            <button type="button" className={css.iconButton} aria-label={t('new')} onClick={openNew}>
              <IconPlusOutline16 size={14} />
            </button>
          </Tooltip>
          <Tooltip label={t('kill')} side="bottom">
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('kill')}
              disabled={activeId === null}
              onClick={killActive}
            >
              <IconTrashOutline16 size={14} />
            </button>
          </Tooltip>
          <Tooltip label={t('settings')} side="bottom">
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('settings')}
              aria-expanded={settingsOpen}
              onClick={() => { setSettingsOpen(open => !open) }}
            >
              <IconSettingsOutline16 size={14} />
            </button>
          </Tooltip>
          {closePanel !== undefined && (
            <Tooltip label={t('close')} side="bottom">
              <button type="button" className={css.iconButton} aria-label={t('close')} onClick={closePanel}>
                <IconCloseOutline16 size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <Modal
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false) }}
        title={t('settings')}
        closeLabel={t('settings.close')}
        className={css.settingsDialog ?? ''}
      >
        <TerminalSettings
          preferences={preferences}
          update={updatePreferences}
          reset={resetPreferences}
          t={t}
        />
      </Modal>
      <div
        className={css.terminalBody}
        style={{ backgroundColor: terminalTheme(preferences.theme).background }}
      >
        <TerminalViewport
          preferences={preferences}
          onReady={setSurface}
          onInput={onInput}
          onResize={onResize}
          {...layoutHeight === undefined ? {} : { layoutHeight }}
        />
        {phase !== 'ready' && (
          <div className={css.status} data-phase={phase}>
            <span>{phase === 'connecting' ? t('connecting') : phase === 'exited' ? t('empty') : error ?? t('disconnected')}</span>
            {phase === 'error' && (
              <button type="button" className={css.retry} onClick={refresh}>
                <IconRefreshOutline16 size={14} />
                <span>{t('retry')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/** Right-workbench terminal surface wrapper. */
export function WorkbenchTerminal({
  sessionId, usePreferences, updatePreferences, resetPreferences, socketFactory, t,
}: WorkbenchTerminalProps) {
  const preferences = usePreferences(value => value)
  return (
    <TerminalPanel
      sessionId={sessionId}
      placement="right"
      preferences={preferences}
      updatePreferences={updatePreferences}
      resetPreferences={resetPreferences}
      socketFactory={socketFactory}
      t={t}
    />
  )
}

/** Bottom-panel terminal surface wrapper. */
export function BottomTerminal({
  sessionId, closePanel, height, usePreferences, updatePreferences, resetPreferences, socketFactory, t,
}: BottomTerminalProps) {
  const preferences = usePreferences(value => value)
  return (
    <TerminalPanel
      sessionId={sessionId}
      placement="bottom"
      preferences={preferences}
      updatePreferences={updatePreferences}
      resetPreferences={resetPreferences}
      socketFactory={socketFactory}
      closePanel={closePanel}
      layoutHeight={height}
      t={t}
    />
  )
}
