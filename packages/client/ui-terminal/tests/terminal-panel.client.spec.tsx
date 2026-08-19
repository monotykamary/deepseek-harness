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
  const props = {
    sessionId: 'session-1',
    placement: 'bottom' as const,
    preferences: DEFAULT_TERMINAL_PREFERENCES,
    updatePreferences,
    resetPreferences,
    socketFactory: vi.fn(),
    ...(includeClosePanel ? { closePanel } : {}),
    t: translate as never,
    ...overrides,
  }
  return { ...render(<TerminalPanel {...props} />), updatePreferences, resetPreferences, closePanel }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue([running, exited])
  mocks.killDetached.mockResolvedValue(undefined)
  mocks.connect.mockImplementation(async (
    _factory: unknown,
    handshake: Extract<BrowserTerminalHandshake, { type: 'open' | 'attach' }>,
    callbacks: BrowserTerminalConnectionCallbacks,
  ) => {
    mocks.callbacks = callbacks
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
      t: translate,
    }
    const rightProps = injected as unknown as Parameters<typeof WorkbenchTerminal>[0]
    const right = render(<WorkbenchTerminal {...rightProps} />)
    expect(await screen.findByRole('tab', { name: 'Terminal 1' })).toBeTruthy()
    right.unmount()
    const closePanel = vi.fn()
    const bottomProps = { ...injected, closePanel } as unknown as Parameters<typeof BottomTerminal>[0]
    render(<BottomTerminal {...bottomProps} />)
    expect(await screen.findByRole('button', { name: 'Close bottom terminal' })).toBeTruthy()
  })
})

describe('TerminalPanel', () => {
  it('lists and attaches, forwards input/resize, opens a terminal, kills it, and closes the bottom panel', async () => {
    const mounted = mount()
    expect((await screen.findByRole('tab', { name: 'Terminal 1' })).getAttribute('aria-selected')).toBe('true')
    expect(mocks.list).toHaveBeenCalledWith(expect.any(Function), 'session-1', 'bottom')
    expect(mocks.connect).toHaveBeenCalledWith(expect.any(Function), {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, expect.any(Object))
    expect(mocks.live.resize).toHaveBeenCalledWith(80, 24)

    fireEvent.click(screen.getByText('input'))
    expect(mocks.live.write).toHaveBeenCalledWith('ls\n')
    fireEvent.click(screen.getByText('resize'))
    expect(mocks.live.resize).toHaveBeenCalledWith(120, 40)
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => {
      expect(mocks.connect).toHaveBeenLastCalledWith(expect.any(Function), {
        type: 'open', sessionId: 'session-1', placement: 'bottom', cols: 120, rows: 40,
      }, expect.any(Object))
    })
    expect(mocks.surface.showCursor).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Kill terminal' }))
    expect(mocks.live.kill).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close bottom terminal' }))
    expect(mounted.closePanel).toHaveBeenCalledOnce()
  })

  it('closes the active terminal from its tab control', async () => {
    mount()
    await screen.findByRole('tab', { name: 'Terminal 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Close terminal tab: Terminal 1' }))

    expect(screen.queryByRole('tab', { name: 'Terminal 1' })).toBeNull()
    expect(mocks.killDetached).toHaveBeenCalledWith(expect.any(Function), 'session-1', 'terminal-1')
  })

  it('retires a terminal tab when Ctrl+D exits its PTY', async () => {
    mount()
    await screen.findByRole('tab', { name: 'Terminal 1' })

    mocks.callbacks?.exit({ kind: 'exited', exitCode: 0, signal: null })

    await waitFor(() => { expect(screen.queryByRole('tab', { name: 'Terminal 1' })).toBeNull() })
    expect(mocks.killDetached).toHaveBeenCalledWith(expect.any(Function), 'session-1', 'terminal-1')
  })

  it('opens the compact settings tray and publishes every setting kind', async () => {
    const mounted = mount()
    await screen.findByRole('tab', { name: 'Terminal 1' })
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
  })

  it('selects and removes an exited tab through the detached kill path', async () => {
    mount()
    const exitedTab = await screen.findByRole('tab', { name: 'Terminal 2' })
    fireEvent.click(exitedTab)
    expect(mocks.live.close).toHaveBeenCalled()
    expect(mocks.surface.reset).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Kill terminal' }))
    await waitFor(() => {
      expect(mocks.killDetached).toHaveBeenCalledWith(expect.any(Function), 'session-1', 'terminal-2')
    })
  })

  it('renders output/exit/disconnect callbacks and retries a failed list', async () => {
    mount()
    await screen.findByRole('tab', { name: 'Terminal 1' })
    mocks.callbacks?.output(new Uint8Array([1, 2]))
    expect(mocks.surface.write).toHaveBeenCalledWith(new Uint8Array([1, 2]))
    mocks.callbacks?.disconnected(Object.assign(new Error('transport down'), { code: 'DISCONNECTED' }))
    expect(await screen.findByText('transport down')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    await waitFor(() => { expect(mocks.list).toHaveBeenCalledTimes(2) })

    mocks.callbacks?.exit({ kind: 'exited', exitCode: 0, signal: null })
    expect(await screen.findByText('No terminal is available')).toBeTruthy()
  })

  it('retries an initial list failure', async () => {
    mocks.list.mockRejectedValueOnce(new Error('list down'))
    mount()
    expect(await screen.findByText('list down')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    expect(await screen.findByRole('tab', { name: 'Terminal 1' })).toBeTruthy()
  })

  it('opens a fresh terminal when no running terminal exists and omits the close action on the right', async () => {
    mocks.list.mockResolvedValue([exited])
    mount({ placement: 'right' }, false)
    await waitFor(() => {
      expect(mocks.connect).toHaveBeenCalledWith(expect.any(Function), {
        type: 'open', sessionId: 'session-1', placement: 'right', cols: 80, rows: 24,
      }, expect.any(Object))
    })
    expect(screen.queryByRole('button', { name: 'Close bottom terminal' })).toBeNull()
  })
})
