// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { DEFAULT_TERMINAL_PREFERENCES } from '../src/client/preferences.ts'

const mocks = vi.hoisted(() => ({
  instances: [] as Array<{
    apply: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    fit: ReturnType<typeof vi.fn>
    refreshFontMetrics: ReturnType<typeof vi.fn>
    input: (value: string) => void
  }>,
  fits: [] as Array<{ cols: number; rows: number } | undefined>,
}))

vi.mock('../src/client/xterm-surface.ts', () => ({
  XtermSurface: class {
    readonly apply = vi.fn()
    readonly dispose = vi.fn()
    readonly fit = vi.fn(() => mocks.fits.shift())
    readonly refreshFontMetrics = vi.fn()
    constructor(_container: HTMLDivElement, _preferences: unknown, readonly input: (value: string) => void) {
      mocks.instances.push(this)
    }
  },
}))

let resizeCallback: ResizeObserverCallback | undefined
const disconnect = vi.fn()
const observe = vi.fn()
class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
  observe = observe
  disconnect(): void { disconnect() }
  unobserve(): void {}
}

import { TerminalViewport } from '../src/client/TerminalViewport.tsx'

beforeEach(() => {
  mocks.instances.length = 0
  mocks.fits.length = 0
  resizeCallback = undefined
  disconnect.mockClear()
  observe.mockClear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('TerminalViewport', () => {
  it('remeasures and refits after the selected font loads', async () => {
    mocks.fits.push({ cols: 80, rows: 24 }, { cols: 81, rows: 25 }, { cols: 120, rows: 36 })
    const onResize = vi.fn()
    render(
      <TerminalViewport
        preferences={DEFAULT_TERMINAL_PREFERENCES}
        onReady={vi.fn()}
        onInput={vi.fn()}
        onResize={onResize}
      />,
    )
    const surface = mocks.instances[0]!

    await waitFor(() => { expect(surface.refreshFontMetrics).toHaveBeenCalledOnce() })
    expect(onResize).toHaveBeenLastCalledWith({ cols: 120, rows: 36 })
  })

  it('waits for a collapsed bottom panel to open and fit before publishing readiness', async () => {
    mocks.fits.push({ cols: 120, rows: 30 })
    const onReady = vi.fn()
    const onResize = vi.fn()
    const renderViewport = (layoutHeight: number) => (
      <div data-testid="transition-owner" style={{ transitionProperty: 'height', transitionDuration: '0.3s' }}>
        <TerminalViewport
          preferences={DEFAULT_TERMINAL_PREFERENCES}
          onReady={onReady}
          onInput={vi.fn()}
          onResize={onResize}
          layoutHeight={layoutHeight}
        />
      </div>
    )
    const view = render(renderViewport(0))
    expect(onReady).not.toHaveBeenCalled()
    expect(onResize).not.toHaveBeenCalled()

    view.rerender(renderViewport(500))
    expect(onReady).not.toHaveBeenCalled()
    fireEvent.transitionEnd(view.getByTestId('transition-owner'), { propertyName: 'height' })
    await waitFor(() => { expect(onReady).toHaveBeenCalledOnce() })
    expect(onResize).toHaveBeenCalledWith({ cols: 120, rows: 30 })
    expect(onResize.mock.invocationCallOrder[0]!).toBeLessThan(onReady.mock.invocationCallOrder[0]!)
  })

  it('mounts once, forwards input and dimensions, reapplies preferences, observes resize, and disposes', () => {
    mocks.fits.push({ cols: 80, rows: 24 }, { cols: 81, rows: 25 })
    const onReady = vi.fn()
    const onInput = vi.fn()
    const onResize = vi.fn()
    const view = render(
      <TerminalViewport
        preferences={DEFAULT_TERMINAL_PREFERENCES}
        onReady={onReady}
        onInput={onInput}
        onResize={onResize}
      />,
    )
    const surface = mocks.instances[0]!
    const viewport = view.container.querySelector<HTMLElement>('[data-terminal-viewport]')!
    expect(viewport.dataset.terminalFont).toBe('geist-mono')
    expect(viewport.dataset.terminalLigatures).toBe('true')
    expect(viewport.style.backgroundColor).toBe('rgb(21, 21, 22)')
    expect(viewport.firstElementChild).not.toBeNull()
    expect(observe).toHaveBeenCalledTimes(2)
    expect(onReady).toHaveBeenCalledWith(surface)
    expect(onResize).toHaveBeenNthCalledWith(1, { cols: 80, rows: 24 })
    expect(onResize.mock.invocationCallOrder[0]!).toBeLessThan(onReady.mock.invocationCallOrder[0]!)
    expect(surface.apply).toHaveBeenCalledWith(DEFAULT_TERMINAL_PREFERENCES)
    expect(onResize).toHaveBeenNthCalledWith(2, { cols: 81, rows: 25 })
    surface.input('echo\n')
    expect(onInput).toHaveBeenCalledWith('echo\n')

    mocks.fits.push(undefined, { cols: 100, rows: 40 })
    resizeCallback?.([], {} as ResizeObserver)
    expect(onResize).toHaveBeenCalledTimes(2)
    resizeCallback?.([], {} as ResizeObserver)
    expect(onResize).toHaveBeenLastCalledWith({ cols: 100, rows: 40 })

    const next = { ...DEFAULT_TERMINAL_PREFERENCES, theme: 'light' as const, fontSize: 15 }
    mocks.fits.push(undefined)
    view.rerender(
      <TerminalViewport preferences={next} onReady={onReady} onInput={onInput} onResize={onResize} />,
    )
    expect(surface.apply).toHaveBeenLastCalledWith(next)
    expect(viewport.style.backgroundColor).toBe('rgb(250, 250, 250)')

    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(surface.dispose).toHaveBeenCalledOnce()
  })
})
