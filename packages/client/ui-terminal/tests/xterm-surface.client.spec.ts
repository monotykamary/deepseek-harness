// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TERMINAL_PREFERENCES } from '../src/client/preferences.ts'

const mocks = vi.hoisted(() => ({
  terminals: [] as FakeTerminal[],
  fitDimensions: { cols: 80, rows: 24 } as { cols: number; rows: number } | undefined,
  throwWebgl: false,
  batchers: [] as FakeBatcher[],
  scroll: {
    capture: vi.fn(() => ({ marker: true })), restore: vi.fn(), noteUserScroll: vi.fn(),
    scrollToBottomOnUserInput: vi.fn(),
  },
  probes: [] as { supports: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
  fontLoads: [] as Promise<unknown>[],
  charMeasure: vi.fn(),
  emojiNormal: undefined as (() => boolean) | undefined,
}))

class FakeDisposable { dispose = vi.fn() }
class FakeFitAddon {
  proposeDimensions(): { cols: number; rows: number } | undefined { return mocks.fitDimensions }
}
class FakeWebglAddon {
  static instances: FakeWebglAddon[] = []
  readonly setEmojiColorsMuted = vi.fn()
  readonly dispose = vi.fn()
  contextLoss: (() => void) | undefined
  constructor(readonly options: unknown) {
    if (mocks.throwWebgl) throw new Error('no webgl')
    FakeWebglAddon.instances.push(this)
  }
  onContextLoss(callback: () => void): void { this.contextLoss = callback }
}
class FakeBatcher {
  readonly attach = vi.fn()
  readonly setInteractiveRenderingEnabled = vi.fn()
  readonly noteUserInput = vi.fn()
  readonly pushBytes = vi.fn()
  readonly detach = vi.fn()
  afterFlush: (() => void) | null = null
  readonly setAfterFlush = vi.fn((callback: (() => void) | null) => { this.afterFlush = callback })
  constructor() { mocks.batchers.push(this) }
}
class FakeTerminal {
  readonly options: Record<string, unknown>
  readonly buffer = { active: { type: 'normal', length: 24, viewportY: 0 } }
  readonly unicode = { register: vi.fn(), activeVersion: '' }
  readonly element = document.createElement('div')
  readonly loadAddon = vi.fn()
  readonly open = vi.fn()
  readonly reset = vi.fn()
  readonly resize = vi.fn()
  readonly scrollLines = vi.fn((delta: number) => {
    this.buffer.active.viewportY += delta
    this.scrollCallback?.()
  })
  readonly rows = 24
  readonly write = vi.fn((_data: string, callback?: () => void) => { callback?.() })
  readonly refresh = vi.fn()
  readonly focus = vi.fn()
  readonly clearTextureAtlas = vi.fn()
  readonly deregisterCharacterJoiner = vi.fn()
  readonly dispose = vi.fn()
  readonly dataDisposable = new FakeDisposable()
  readonly scrollDisposable = new FakeDisposable()
  dataCallback: ((input: string) => void) | undefined
  scrollCallback: (() => void) | undefined
  joiner: ((text: string) => [number, number][]) | undefined
  constructor(options: Record<string, unknown>) {
    this.options = options
    ;(this as unknown as { _core: unknown })._core = {
      unicodeService: { _activeProvider: { wcwidth: () => 1, charProperties: () => 2 } },
      _charSizeService: { measure: mocks.charMeasure },
    }
    mocks.terminals.push(this)
  }
  onData(callback: (input: string) => void): FakeDisposable { this.dataCallback = callback; return this.dataDisposable }
  onScroll(callback: () => void): FakeDisposable { this.scrollCallback = callback; return this.scrollDisposable }
  readonly registerCharacterJoiner = vi.fn((joiner: (text: string) => [number, number][]): number => {
    this.joiner = joiner
    return 7
  })
}

vi.doMock('@xterm/addon-fit', () => ({ FitAddon: FakeFitAddon }))
vi.doMock('@xterm/addon-image/lib/addon-image.mjs', () => ({ ImageAddon: class { readonly fake = true } }))
vi.doMock('@xterm/addon-unicode-graphemes', () => ({ UnicodeGraphemesAddon: class { readonly fake = true } }))
vi.doMock('@xterm/addon-web-links', () => ({ WebLinksAddon: class { readonly fake = true } }))
vi.doMock('@xterm/addon-webgl/lib/addon-webgl.mjs', () => ({ WebglAddon: FakeWebglAddon }))
vi.doMock('@xterm/xterm', () => ({ Terminal: FakeTerminal }))
vi.doMock('../src/client/performance/output-batcher.ts', () => ({ OutputBatcher: FakeBatcher }))
vi.doMock('../src/client/performance/output-scroll-controller.ts', () => ({
  createTerminalOutputScrollController: () => mocks.scroll,
}))
vi.doMock('../src/client/performance/emoji-width-unicode-provider.ts', () => ({
  EmojiWidthUnicodeProvider: class {
    readonly fake = true
    constructor(_provider: unknown, normal: () => boolean) { mocks.emojiNormal = normal }
  },
}))
vi.doMock('../src/client/performance/ligature-joiner.ts', () => ({
  findLigatureRanges: () => [[0, 2], [3, 5]],
}))
vi.doMock('../src/client/performance/ligature-support-probe.ts', () => ({
  createLigatureSupportProbe: () => {
    const probe = { supports: vi.fn((text: string) => text === 'ok'), dispose: vi.fn() }
    mocks.probes.push(probe)
    return probe
  },
}))

let XtermSurface: typeof import('../src/client/xterm-surface.ts').XtermSurface

beforeAll(async () => {
  ;({ XtermSurface } = await import('../src/client/xterm-surface.ts'))
})

beforeEach(() => {
  mocks.terminals.length = 0
  mocks.batchers.length = 0
  mocks.probes.length = 0
  mocks.fitDimensions = { cols: 80, rows: 24 }
  mocks.throwWebgl = false
  FakeWebglAddon.instances.length = 0
  mocks.charMeasure.mockClear()
  mocks.emojiNormal = undefined
  for (const value of Object.values(mocks.scroll)) value.mockClear()
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: vi.fn(() => Promise.resolve([])) },
  })
})

describe('XtermSurface', () => {
  it('owns addons, input/output pacing, fit, appearance, ligatures, and idempotent disposal', async () => {
    const input = vi.fn()
    const surface = new XtermSurface(document.createElement('div'), DEFAULT_TERMINAL_PREFERENCES, input)
    const terminal = mocks.terminals[0]!
    const batcher = mocks.batchers[0]!
    expect(terminal.options).toMatchObject({
      fontSize: 13, lineHeight: 1.2, minimumContrastRatio: 1,
      scrollbar: { showScrollbar: false },
    })
    expect(terminal.loadAddon).toHaveBeenCalledTimes(5)
    expect(terminal.open).toHaveBeenCalledOnce()
    expect(batcher.attach).toHaveBeenCalledWith(terminal, mocks.scroll)
    expect(batcher.setInteractiveRenderingEnabled).toHaveBeenCalledWith(true)
    expect(mocks.emojiNormal?.()).toBe(true)
    terminal.buffer.active.type = 'alternate'
    expect(mocks.emojiNormal?.()).toBe(false)
    terminal.buffer.active.type = 'normal'

    terminal.dataCallback?.('ls\n')
    expect(batcher.noteUserInput).toHaveBeenCalledOnce()
    expect(mocks.scroll.scrollToBottomOnUserInput).toHaveBeenCalledOnce()
    expect(input).toHaveBeenCalledWith('ls\n')
    terminal.scrollCallback?.()
    expect(mocks.scroll.noteUserScroll).toHaveBeenCalledOnce()
    surface.write(new Uint8Array([1]))
    expect(batcher.pushBytes).toHaveBeenCalled()
    surface.reset()
    expect(terminal.reset).toHaveBeenCalledOnce()
    expect(surface.fit()).toEqual({ cols: 80, rows: 24 })
    expect(terminal.resize).toHaveBeenCalledWith(80, 24)
    expect(mocks.scroll.restore).toHaveBeenCalled()
    surface.refreshFontMetrics()
    expect(mocks.charMeasure).toHaveBeenCalledOnce()
    expect(terminal.clearTextureAtlas).toHaveBeenCalled()
    surface.focus()
    expect(terminal.focus).toHaveBeenCalledOnce()
    surface.showCursor()
    expect(terminal.write).toHaveBeenCalledWith('[?25h', expect.any(Function))
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23)

    await vi.waitFor(() => { expect(terminal.joiner?.('ok no')).toEqual([[0, 2]]) })
    surface.apply({ ...DEFAULT_TERMINAL_PREFERENCES, theme: 'light', ligatures: false, muteEmojiColors: true })
    expect(terminal.options.minimumContrastRatio).toBe(4.5)
    expect(FakeWebglAddon.instances[0]?.setEmojiColorsMuted).toHaveBeenCalledWith(true)
    expect(terminal.deregisterCharacterJoiner).toHaveBeenCalledWith(7)
    expect(mocks.probes[0]?.dispose).toHaveBeenCalledOnce()

    const refreshCount = terminal.refresh.mock.calls.length
    let delayedCursorWrite: (() => void) | undefined
    terminal.write.mockImplementationOnce((_data: string, callback?: () => void) => {
      delayedCursorWrite = callback
    })
    surface.showCursor()
    surface.dispose()
    delayedCursorWrite?.()
    expect(terminal.refresh).toHaveBeenCalledTimes(refreshCount)
    surface.dispose()
    expect(batcher.detach).toHaveBeenCalledOnce()
    expect(terminal.dataDisposable.dispose).toHaveBeenCalledOnce()
    expect(terminal.scrollDisposable.dispose).toHaveBeenCalledOnce()
    expect(terminal.dispose).toHaveBeenCalledOnce()
    surface.write(new Uint8Array([2]))
    surface.reset()
    surface.refreshFontMetrics()
    surface.focus()
    surface.showCursor()
    surface.apply(DEFAULT_TERMINAL_PREFERENCES)
    expect(surface.fit()).toBeUndefined()
  })

  it('overlays an implicit scrollbar without reserving xterm grid width', () => {
    const track = document.createElement('div')
    const thumb = document.createElement('div')
    track.append(thumb)
    Object.defineProperty(track, 'clientHeight', { configurable: true, value: 100 })
    track.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 10, height: 100, top: 0, right: 10, bottom: 100, left: 0,
      toJSON: () => ({}),
    })
    thumb.setPointerCapture = vi.fn()
    const surface = new XtermSurface(
      document.createElement('div'), DEFAULT_TERMINAL_PREFERENCES, vi.fn(), { track, thumb },
    )
    const terminal = mocks.terminals[0]!
    const batcher = mocks.batchers[0]!
    expect(track.hasAttribute('data-visible')).toBe(false)

    terminal.buffer.active.length = 100
    terminal.buffer.active.viewportY = 50
    terminal.scrollCallback?.()
    expect(track.hasAttribute('data-visible')).toBe(true)
    expect(thumb.style.height).toBe('24%')
    expect(thumb.style.top).toBe('50%')

    terminal.buffer.active.viewportY = 76
    batcher.afterFlush?.()
    expect(track.hasAttribute('data-visible')).toBe(false)
    terminal.buffer.active.viewportY = 50
    expect(surface.fit()).toEqual({ cols: 80, rows: 24 })
    expect(track.hasAttribute('data-visible')).toBe(true)

    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 75 }))
    expect(terminal.scrollLines).toHaveBeenLastCalledWith(13)
    terminal.scrollLines.mockClear()
    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 1, clientY: 25 }))
    expect(terminal.scrollLines).not.toHaveBeenCalled()

    thumb.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 20 }))
    expect(terminal.scrollLines).not.toHaveBeenCalled()
    thumb.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 1, clientY: 10 }))
    expect(terminal.scrollLines).not.toHaveBeenCalled()
    thumb.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 10 }))
    thumb.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 20 }))
    expect(terminal.scrollLines).toHaveBeenLastCalledWith(8)
    terminal.scrollLines.mockClear()
    thumb.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 20 }))
    expect(terminal.scrollLines).not.toHaveBeenCalled()
    terminal.buffer.active.length = 24
    thumb.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 30 }))
    Object.defineProperty(track, 'clientHeight', { configurable: true, value: 0 })
    terminal.buffer.active.length = 100
    thumb.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 30 }))
    Object.defineProperty(track, 'clientHeight', { configurable: true, value: 100 })
    thumb.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    thumb.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 30 }))
    expect(terminal.scrollLines).not.toHaveBeenCalled()

    thumb.setPointerCapture = vi.fn(() => { throw new Error('capture unavailable') })
    thumb.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 10 }))
    thumb.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))

    terminal.buffer.active.length = 24
    terminal.buffer.active.viewportY = 0
    track.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 10, height: 0, top: 0, right: 10, bottom: 0, left: 0,
      toJSON: () => ({}),
    })
    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 0 }))
    track.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 10, height: 100, top: 0, right: 10, bottom: 100, left: 0,
      toJSON: () => ({}),
    })
    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 12 }))
    batcher.afterFlush?.()
    expect(track.hasAttribute('data-visible')).toBe(false)
    surface.dispose()
    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 75 }))
    expect(terminal.scrollLines).not.toHaveBeenCalled()
  })

  it('handles hidden dimensions, stale font readiness, WebGL context loss, and renderer fallback', async () => {
    let resolveFont!: () => void
    const fontReady = new Promise<void>((resolve) => { resolveFont = resolve })
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(() => fontReady) },
    })
    const first = new XtermSurface(document.createElement('div'), DEFAULT_TERMINAL_PREFERENCES, vi.fn())
    const terminal = mocks.terminals[0]!
    first.apply({ ...DEFAULT_TERMINAL_PREFERENCES, ligatures: false })
    resolveFont()
    await fontReady
    await Promise.resolve()
    expect(terminal.registerCharacterJoiner).not.toHaveBeenCalled()

    mocks.fitDimensions = undefined
    expect(first.fit()).toBeUndefined()
    mocks.fitDimensions = { cols: 0, rows: 2 }
    expect(first.fit()).toBeUndefined()
    mocks.fitDimensions = { cols: 2, rows: 0 }
    expect(first.fit()).toBeUndefined()

    const webgl = FakeWebglAddon.instances[0]!
    webgl.contextLoss?.()
    webgl.contextLoss?.()
    expect(webgl.dispose).toHaveBeenCalledTimes(2)
    expect(mocks.batchers[0]?.setInteractiveRenderingEnabled).toHaveBeenLastCalledWith(false)
    first.dispose()

    mocks.throwWebgl = true
    const fallback = new XtermSurface(
      document.createElement('div'),
      { ...DEFAULT_TERMINAL_PREFERENCES, theme: 'light' },
      vi.fn(),
    )
    expect(mocks.batchers.at(-1)?.setInteractiveRenderingEnabled).not.toHaveBeenCalledWith(true)
    fallback.dispose()
  })
})
