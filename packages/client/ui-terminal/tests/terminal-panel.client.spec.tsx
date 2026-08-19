// @vitest-environment jsdom
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_TERMINAL_PREFERENCES } from '../src/client/preferences.ts'
import type { TerminalPreferences } from '../src/client/preferences.ts'
import type { BrowserTerminalConnectionCallbacks } from '../src/client/connection.ts'
import type { BrowserTerminalHandshake } from '@monotykamary/dsh-terminal-web/protocol'
import { en } from '../src/client/locales.ts'

const mocks = vi.hoisted(() => {
  const surface = {
    reset: vi.fn(), write: vi.fn(), focus: vi.fn(), showCursor: vi.fn(), fit: vi.fn(), apply: vi.fn(), dispose: vi.fn(),
  }
  const live = {
    terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' as const } },
    replayTruncated: false,
    write: vi.fn(), resize: vi.fn(), kill: vi.fn(), close: vi.fn(),
  }
  return {
    surface,
    live,
    callbacks: undefined as BrowserTerminalConnectionCallbacks | undefined,
    callbackHistory: [] as BrowserTerminalConnectionCallbacks[],
    list: vi.fn(),
    killDetached: vi.fn(),
    connect: vi.fn(),
  }
})

vi.mock('../src/client/TerminalViewport.tsx', () => ({
  TerminalViewport: (props: {
    onReady: (surface: typeof mocks.surface) => void
    onInput: (input: string) => void
    onResize: (dimensions: { cols: number; rows: number }) => void
  }) => {
    useEffect(() => { props.onReady(mocks.surface) }, [])
    return (
      <div data-testid="viewport">
        <button type="button" onClick={() => { props.onInput('ls\n') }}>input</button>
        <button type="button" onClick={() => { props.onResize({ cols: 120, rows: 40 }) }}>resize</button>
      </div>
    )
  },
}))

vi.mock('../src/client/connection.ts', () => {
  class BrowserTerminalError extends Error {
    constructor(readonly code: string, message: string) { super(message) }
  }
  return {
    BrowserTerminalError,
    listBrowserTerminals: mocks.list,
    killBrowserTerminal: mocks.killDetached,
    BrowserTerminalConnection: { connect: mocks.connect },
  }
})

import { BottomTerminal, TerminalPanel, WorkbenchTerminal } from '../src/client/TerminalPanel.tsx'
import { BrowserTerminalError } from '../src/client/connection.ts'
import { BottomTerminalToggle } from '../src/client/BottomTerminalToggle.tsx'
import { TerminalSettings } from '../src/client/TerminalSettings.tsx'

const translate = (key: keyof typeof en): string => en[key]
const running = { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' as const } }
const exited = {
  terminalId: 'terminal-2', label: 'Terminal 2',
  status: { kind: 'exited' as const, exitCode: 2, signal: null },
}

function mount(
  overrides: Partial<Parameters<typeof TerminalPanel>[0]> = {},
  includeClosePanel = true,
) {
  const updatePreferences = vi.fn<(patch: Partial<TerminalPreferences>) => void>()
  const resetPreferences = vi.fn()
  const closePanel = vi.fn()
  const openWorkbenchPanel = vi.fn()
  const ensureWorkbenchPanels = vi.fn()
  const props = {
    sessionId: 'session-1',
    placement: 'bottom' as const,
    preferences: DEFAULT_TERMINAL_PREFERENCES,
    updatePreferences,
    resetPreferences,
    socketFactory: vi.fn(),
    workbenchPanelOrdinal: 1,
    openWorkbenchPanel,
    ensureWorkbenchPanels,
    ...(includeClosePanel ? { closePanel } : {}),
    t: translate as never,
    ...overrides,
  }
  return {
    ...render(<TerminalPanel {...props} />), updatePreferences, resetPreferences, closePanel,
    openWorkbenchPanel, ensureWorkbenchPanels, props,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.callbackHistory.length = 0
  mocks.list.mockResolvedValue([running, exited])
  mocks.killDetached.mockResolvedValue(undefined)
  mocks.connect.mockImplementation(async (
    _factory: unknown,
    handshake: Extract<BrowserTerminalHandshake, { type: 'open' | 'attach' }>,
    callbacks: BrowserTerminalConnectionCallbacks,
  ) => {
    mocks.callbacks = callbacks
    mocks.callbackHistory.push(callbacks)
    const terminal = handshake.type === 'open'
      ? { terminalId: 'terminal-3', label: 'Terminal 3', status: { kind: 'running' as const } }
      : running
    return { ...mocks.live, terminal }
  })
})

afterEach(cleanup)

describe('terminal wrappers and controls', () => {
  it('toggles the bottom layout action', () => {
    const toggleBottomTerminal = vi.fn()
    const toggleProps = {
      detailsOpen: false,
      toggleBottomTerminal,
      t: translate,
    } as unknown as Parameters<typeof BottomTerminalToggle>[0]
    render(<BottomTerminalToggle {...toggleProps} />)
    const toggle = screen.getByRole('button', { name: 'Toggle bottom panel' })
    expect(toggle.querySelector('.lucide-panel-bottom')).not.toBeNull()
    fireEvent.click(toggle)
    expect(toggleBottomTerminal).toHaveBeenCalledOnce()
  })

  it('renders custom font input and forwards its value', () => {
    const update = vi.fn()
    render(
      <TerminalSettings
        preferences={{ ...DEFAULT_TERMINAL_PREFERENCES, font: 'custom', customFontFamily: 'Mono A' }}
        update={update}
        reset={vi.fn()}
        t={translate as never}
      />,
    )
    fireEvent.change(screen.getByLabelText('Custom font family'), { target: { value: 'Mono B' } })
    expect(update).toHaveBeenCalledWith({ customFontFamily: 'Mono B' })
  })

  it('binds shared preferences through right and bottom slot wrappers', async () => {
    const injected = {
      sessionId: 'session-1',
      usePreferences: (selector: (value: TerminalPreferences) => unknown) => selector(DEFAULT_TERMINAL_PREFERENCES),
      updatePreferences: vi.fn(),
      resetPreferences: vi.fn(),
      socketFactory: vi.fn(),
      openWorkbenchPanel: vi.fn(),
      ensureWorkbenchPanels: vi.fn(),
      t: translate,
    }
    const rightProps = injected as unknown as Parameters<typeof WorkbenchTerminal>[0]
    const right = render(<WorkbenchTerminal {...rightProps} />)
    expect(await screen.findByTestId('viewport')).toBeTruthy()
    expect(injected.ensureWorkbenchPanels).toHaveBeenCalledWith(1)
    right.unmount()
    const closePanel = vi.fn()
    const bottomProps = { ...injected, closePanel } as unknown as Parameters<typeof BottomTerminal>[0]
    render(<BottomTerminal {...bottomProps} />)
    expect(await screen.findByRole('button', { name: 'Close bottom terminal' })).toBeTruthy()
  })
})

describe('TerminalPanel', () => {
  it('attaches a bottom terminal, forwards IO, splits both ways, and restores fullscreen', async () => {
    const mounted = mount({ layoutHeight: 280 })
    await screen.findByTestId('viewport')
    fireEvent.mouseDown(mounted.container.querySelector('[data-terminal-pane]')!)
    const root = mounted.container.querySelector('[data-terminal-panel]')
    fireEvent.click(screen.getByRole('button', { name: 'Expand terminal to fullscreen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore terminal size' }))
    expect(mocks.list).toHaveBeenCalledWith(expect.any(Function), 'session-1', 'bottom')
    expect(mocks.connect).toHaveBeenCalledWith(expect.any(Function), {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, expect.any(Object))

    fireEvent.click(screen.getByText('input'))
    expect(mocks.live.write).toHaveBeenCalledWith('ls\n')
    fireEvent.click(screen.getByText('resize'))
    expect(mocks.live.resize).toHaveBeenCalledWith(120, 40)

    fireEvent.click(screen.getByRole('button', { name: 'Split terminal horizontally' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(2) })
    expect(mounted.container.querySelector('[data-direction="horizontal"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Split terminal vertically' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(3) })
    expect(mounted.container.querySelector('[data-direction="vertical"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Split terminal horizontally' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    expect(screen.getAllByTestId('viewport')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Expand terminal to fullscreen' }))
    expect(root?.hasAttribute('data-fullscreen')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore terminal size' }))
    expect(root?.hasAttribute('data-fullscreen')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Close bottom terminal' }))
    expect(mounted.closePanel).toHaveBeenCalledOnce()
  })

  it('adds bottom New Terminal to the active group and can remove a not-yet-connected pane', async () => {
    mount()
    await screen.findByTestId('viewport')
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(2) })

    const deferred = Promise.withResolvers<typeof mocks.live>()
    mocks.connect.mockReturnValueOnce(deferred.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal vertically' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(3) })
    fireEvent.click(screen.getByRole('button', { name: 'Kill terminal' }))
    expect(screen.getAllByTestId('viewport')).toHaveLength(2)
    deferred.resolve(mocks.live)
  })

  it('opens a bottom terminal without restored processes and defaults a direct right panel ordinal', async () => {
    mocks.list.mockResolvedValueOnce([])
    const bottom = mount()
    await screen.findByTestId('viewport')
    expect(mocks.connect).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({
      type: 'open', placement: 'bottom',
    }), expect.any(Object))
    bottom.unmount()

    const right = mount({ placement: 'right', workbenchPanelOrdinal: undefined as never }, false)
    await screen.findByTestId('viewport')
    expect(mocks.connect).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({
      type: 'attach', terminalId: 'terminal-1',
    }), expect.any(Object))
    right.unmount()
  })

  it('does not restore a closed Workbench panel when injected callback identities change', async () => {
    const mounted = mount({ placement: 'right' }, false)
    await screen.findByTestId('viewport')
    expect(mocks.list).toHaveBeenCalledOnce()
    const replacementEnsure = vi.fn()
    mounted.rerender(<TerminalPanel {...mounted.props} ensureWorkbenchPanels={replacementEnsure} />)
    await Promise.resolve()
    expect(mocks.list).toHaveBeenCalledOnce()
    expect(replacementEnsure).not.toHaveBeenCalled()
  })

  it('creates right terminals as Workbench panels while splits stay inside one panel', async () => {
    const mounted = mount({ placement: 'right' }, false)
    await screen.findByTestId('viewport')
    expect(mounted.ensureWorkbenchPanels).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('tab')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    expect(mounted.openWorkbenchPanel).toHaveBeenCalledOnce()
    expect(screen.getAllByTestId('viewport')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Split terminal horizontally' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(2) })
    await waitFor(() => {
      expect(mounted.container.querySelectorAll('button[class*="groupItemClose"]')).toHaveLength(2)
    })
    const closeSplit = mounted.container.querySelectorAll<HTMLButtonElement>('button[class*="groupItemClose"]')[1]!
    expect(closeSplit.getAttribute('aria-label')).toBe('Close {name}')
    fireEvent.click(closeSplit)
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(1) })
    expect(mocks.killDetached).toHaveBeenCalledWith(expect.any(Function), 'session-1', 'terminal-3')
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal horizontally' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(2) })
    fireEvent.click(screen.getByRole('button', { name: 'Expand terminal to fullscreen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore terminal size' }))
    expect(mounted.container.querySelector('[aria-label="Terminal groups"]')).toBeTruthy()
  })

  it('opens settings and publishes every preference kind', async () => {
    const mounted = mount()
    await screen.findByTestId('viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Terminal settings' }))
    expect(screen.getByRole('dialog', { name: 'Terminal settings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Theme: Harness' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Light' }))
    fireEvent.click(screen.getByRole('button', { name: 'Font: Geist Mono' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Custom…' }))
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '16' } })
    fireEvent.change(screen.getByLabelText('Line height'), { target: { value: '1.4' } })
    fireEvent.click(screen.getByLabelText('Ligatures'))
    fireEvent.click(screen.getByLabelText('Color emoji'))
    fireEvent.click(screen.getByLabelText('Cursor blink'))
    expect(mounted.updatePreferences.mock.calls.map(call => call[0])).toEqual([
      { theme: 'light' }, { font: 'custom' }, { fontSize: 16 }, { lineHeight: 1.4 },
      { ligatures: false }, { muteEmojiColors: true }, { cursorBlink: false },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(mounted.resetPreferences).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal settings' }))
  })

  it('renders output, retries disconnects, and removes exited panes through the detached kill path', async () => {
    const mounted = mount()
    await screen.findByTestId('viewport')
    mocks.callbacks?.output(new Uint8Array([1, 2]))
    expect(mocks.surface.write).toHaveBeenCalledWith(new Uint8Array([1, 2]))
    mocks.callbacks?.disconnected(Object.assign(new Error('transport down'), { code: 'DISCONNECTED' }))
    expect(await screen.findByText('transport down')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    await waitFor(() => { expect(mocks.connect.mock.calls.length).toBeGreaterThan(1) })

    mocks.callbacks?.exit({ kind: 'exited', exitCode: 0, signal: null })
    await waitFor(() => { expect(mounted.container.querySelector('[data-testid="viewport"]')).toBeNull() })
    expect(mocks.killDetached).toHaveBeenCalledWith(expect.any(Function), 'session-1', 'terminal-1')
  })

  it('retries an initial list failure and opens when no running terminal exists', async () => {
    mocks.list.mockRejectedValueOnce(new Error('list down'))
    const first = mount()
    expect(await screen.findByText('list down')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    await screen.findByTestId('viewport')
    first.unmount()

    mocks.list.mockRejectedValueOnce('plain list failure')
    const plain = mount()
    expect(await screen.findByText('plain list failure')).toBeTruthy()
    plain.unmount()

    mocks.list.mockResolvedValue([exited])
    mount({ placement: 'right' }, false)
    await waitFor(() => {
      expect(mocks.connect).toHaveBeenCalledWith(expect.any(Function), {
        type: 'open', sessionId: 'session-1', placement: 'right', cols: 80, rows: 24,
      }, expect.any(Object))
    })
  })

  it('ignores stale pane callbacks and closes connections that resolve after teardown', async () => {
    const mounted = mount()
    await screen.findByTestId('viewport')
    const stale = mocks.callbackHistory[0]
    if (stale === undefined) throw new Error('missing terminal callbacks')
    mounted.unmount()
    stale.output(new Uint8Array([9]))
    stale.exit({ kind: 'exited', exitCode: 0, signal: null })
    stale.killed('terminal-1')
    stale.disconnected(new BrowserTerminalError('DISCONNECTED', 'late disconnect'))

    const deferred = Promise.withResolvers<typeof mocks.live>()
    mocks.connect.mockReturnValueOnce(deferred.promise)
    const beforeResolve = mocks.connect.mock.calls.length
    const pending = mount()
    await waitFor(() => { expect(mocks.connect.mock.calls.length).toBeGreaterThan(beforeResolve) })
    expect(pending.container.querySelector('[data-terminal-phase="connecting"]')).toBeTruthy()
    expect(pending.container.querySelector('[data-phase="connecting"]')).toBeNull()
    pending.unmount()
    deferred.resolve(mocks.live)
    await waitFor(() => { expect(mocks.live.close).toHaveBeenCalled() })

    const rejected = Promise.withResolvers<typeof mocks.live>()
    mocks.connect.mockReturnValueOnce(rejected.promise)
    const beforeReject = mocks.connect.mock.calls.length
    const failing = mount()
    await waitFor(() => { expect(mocks.connect.mock.calls.length).toBeGreaterThan(beforeReject) })
    failing.unmount()
    rejected.reject(new Error('late reject'))
    await Promise.resolve()
  })

  it('reports connect, input, disconnect, resize, and kill failures without losing retry controls', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('connect down'))
    const first = mount()
    expect(await screen.findByText('connect down')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    await waitFor(() => { expect(mocks.connect).toHaveBeenCalledTimes(2) })

    mocks.live.write.mockImplementationOnce(() => { throw new BrowserTerminalError('WRITE_FAILED', 'write down') })
    fireEvent.click(screen.getByText('input'))
    expect(await screen.findByText('write down')).toBeTruthy()
    mocks.live.resize.mockImplementationOnce(() => { throw new Error('closed') })
    expect(() => { fireEvent.click(screen.getByText('resize')) }).not.toThrow()
    first.unmount()

    mocks.connect.mockRejectedValueOnce('plain connect failure')
    const second = mount()
    expect(await screen.findByText('plain connect failure')).toBeTruthy()
    second.unmount()

    const third = mount()
    await screen.findByTestId('viewport')
    mocks.callbacks?.disconnected(undefined)
    expect(await screen.findByText(en.disconnected)).toBeTruthy()
    mocks.killDetached.mockRejectedValueOnce('kill down')
    fireEvent.click(screen.getByRole('button', { name: 'Kill terminal' }))
    expect(await screen.findByText('kill down')).toBeTruthy()
    third.unmount()

    mocks.killDetached.mockRejectedValueOnce(new Error('kill error'))
    const fourth = mount()
    await screen.findByTestId('viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Kill terminal' }))
    expect(await screen.findByText('kill error')).toBeTruthy()
    fourth.unmount()
  })

  it('switches bottom groups and assigns restored right terminals by panel ordinal', async () => {
    mocks.list.mockResolvedValue([
      running,
      { terminalId: 'terminal-2', label: 'Terminal 2', status: { kind: 'running' as const } },
    ])
    const bottom = mount()
    await waitFor(() => { expect(screen.getAllByRole('button', { name: 'Group {number}' })).toHaveLength(2) })
    fireEvent.click(screen.getAllByRole('button', { name: 'Group {number}' })[1]!)
    const terminal2 = screen.getByRole('button', { name: '└Terminal 2' })
    expect(terminal2.closest('[data-active]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '└Terminal 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal horizontally' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(2) })
    bottom.unmount()

    const right = mount({ placement: 'right', workbenchPanelOrdinal: 2 }, false)
    await screen.findByTestId('viewport')
    expect(right.ensureWorkbenchPanels).toHaveBeenCalledWith(2)
    expect(mocks.connect).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({
      type: 'attach', terminalId: 'terminal-2',
    }), expect.any(Object))
  })

  it('creates a replacement group after the last pane exits', async () => {
    const mounted = mount()
    await screen.findByTestId('viewport')
    mocks.callbacks?.killed('terminal-1')
    await screen.findByText(en.empty)
    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' }).at(-1)!)
    await waitFor(() => { expect(mounted.container.querySelector('[data-terminal-pane]')).toBeTruthy() })
  })

  it('reports non-BrowserTerminal input failures', async () => {
    mount()
    await screen.findByTestId('viewport')
    mocks.live.write.mockImplementationOnce(() => { throw 'plain write failure' })
    fireEvent.click(screen.getByText('input'))
    expect(await screen.findByText('plain write failure')).toBeTruthy()
  })

  it('kills the selected terminal and moves focus to the remaining pane', async () => {
    mount()
    await screen.findByTestId('viewport')
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal horizontally' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(2) })
    fireEvent.click(screen.getByRole('button', { name: 'Kill terminal' }))
    await waitFor(() => { expect(screen.getAllByTestId('viewport')).toHaveLength(1) })
    expect(mocks.killDetached).toHaveBeenCalled()
  })
})
