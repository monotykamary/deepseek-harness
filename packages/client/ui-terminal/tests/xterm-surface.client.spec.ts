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
  constructor() { mocks.batchers.push(this) }
}
class FakeTerminal {
  readonly options: Record<string, unknown>
  readonly buffer = { active: { type: 'normal' } }
  readonly unicode = { register: vi.fn(), activeVersion: '' }
  readonly element = document.createElement('div')
  readonly loadAddon = vi.fn()
  readonly open = vi.fn()
  readonly reset = vi.fn()
  readonly resize = vi.fn()
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
  EmojiWidthUnicodeProvider: class { readonly fake = true },
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
    expect(terminal.options).toMatchObject({ fontSize: 13, lineHeight: 1.2, minimumContrastRatio: 1 })
    expect(terminal.loadAddon).toHaveBeenCalledTimes(5)
    expect(terminal.open).toHaveBeenCalledOnce()
    expect(batcher.attach).toHaveBeenCalledWith(terminal, mocks.scroll)
    expect(batcher.setInteractiveRenderingEnabled).toHaveBeenCalledWith(true)

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

    surface.dispose()
    surface.dispose()
    expect(batcher.detach).toHaveBeenCalledOnce()
    expect(terminal.dataDisposable.dispose).toHaveBeenCalledOnce()
    expect(terminal.scrollDisposable.dispose).toHaveBeenCalledOnce()
    expect(terminal.dispose).toHaveBeenCalledOnce()
    surface.write(new Uint8Array([2]))
    surface.reset()
    surface.focus()
    surface.apply(DEFAULT_TERMINAL_PREFERENCES)
    expect(surface.fit()).toBeUndefined()
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
    expect(webgl.dispose).toHaveBeenCalledOnce()
    expect(mocks.batchers[0]?.setInteractiveRenderingEnabled).toHaveBeenLastCalledWith(false)
    first.dispose()

    mocks.throwWebgl = true
    const fallback = new XtermSurface(document.createElement('div'), DEFAULT_TERMINAL_PREFERENCES, vi.fn())
    expect(mocks.batchers.at(-1)?.setInteractiveRenderingEnabled).not.toHaveBeenCalledWith(true)
    fallback.dispose()
  })
})
