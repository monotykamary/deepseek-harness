/** xterm surface adapted from localterm revision 8de7394. */

import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image/lib/addon-image.mjs'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl/lib/addon-webgl.mjs'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import type { IDisposable, IUnicodeVersionProvider } from '@xterm/xterm'
import { createTerminalOutputScrollController } from './performance/output-scroll-controller.ts'
import { OutputBatcher } from './performance/output-batcher.ts'
import { EmojiWidthUnicodeProvider } from './performance/emoji-width-unicode-provider.ts'
import { createLigatureSupportProbe } from './performance/ligature-support-probe.ts'
import type { LigatureSupportProbe } from './performance/ligature-support-probe.ts'
import { findLigatureRanges } from './performance/ligature-joiner.ts'
import {
  terminalFontFamily, terminalFontName, type TerminalPreferences,
} from './preferences.ts'
import { terminalTheme, type TerminalColorScheme } from './themes.ts'

/** Visible terminal grid dimensions. */
export interface TerminalDimensions {
  readonly cols: number
  readonly rows: number
}

interface TerminalScrollbarElements {
  readonly track: HTMLDivElement
  readonly thumb: HTMLDivElement
}

/** Imperative high-throughput xterm surface owned by one React viewport. */
export class XtermSurface {
  /** Underlying xterm instance retained for addon and viewport operations. */
  readonly terminal: XtermTerminal
  private readonly fitAddon = new FitAddon()
  private readonly outputBatcher = new OutputBatcher()
  private readonly outputScroll
  private readonly disposables: IDisposable[] = []
  private webgl: WebglAddon | undefined
  private ligatureJoinerId: number | undefined
  private ligatureProbe: LigatureSupportProbe | undefined
  private ligatureGeneration = 0
  private scrollbar: TerminalScrollbarElements | undefined
  private scrollbarDragging = false
  private scrollbarDragStartY = 0
  private scrollbarDragStartViewportY = 0
  private disposed = false

  /** Create and open one xterm instance inside its stable DOM container. */
  constructor(
    container: HTMLDivElement,
    preferences: TerminalPreferences,
    colorScheme: TerminalColorScheme,
    onInput: (input: string) => void,
    scrollbar?: TerminalScrollbarElements,
  ) {
    const theme = terminalTheme(colorScheme)
    this.terminal = new XtermTerminal({
      allowProposedApi: true,
      cursorBlink: preferences.cursorBlink,
      cursorStyle: 'block',
      fontFamily: terminalFontFamily(preferences),
      fontSize: preferences.fontSize,
      lineHeight: preferences.lineHeight,
      minimumContrastRatio: colorScheme === 'light' ? 4.5 : 1,
      scrollback: 10_000,
      scrollOnUserInput: true,
      macOptionIsMeta: true,
      theme,
      windowOptions: {
        getWinSizePixels: true,
        getCellSizePixels: true,
        getWinSizeChars: true,
      },
      scrollbar: { showScrollbar: false },
    })
    this.outputScroll = createTerminalOutputScrollController(this.terminal)
    this.outputBatcher.attach(this.terminal, this.outputScroll)
    this.terminal.loadAddon(this.fitAddon)
    this.terminal.loadAddon(new WebLinksAddon())
    this.terminal.loadAddon(new ImageAddon())
    this.terminal.loadAddon(new UnicodeGraphemesAddon())
    const graphemeProvider = (this.terminal as unknown as {
      _core: { unicodeService: { _activeProvider: IUnicodeVersionProvider } }
    })._core.unicodeService._activeProvider
    this.terminal.unicode.register(new EmojiWidthUnicodeProvider(
      graphemeProvider,
      () => this.terminal.buffer.active.type === 'normal',
    ))
    this.terminal.unicode.activeVersion = '15-graphemes-emoji'
    this.terminal.open(container)
    this.scrollbar = scrollbar
    this.installScrollbar()
    this.disposables.push(this.terminal.onData((input) => {
      this.outputBatcher.noteUserInput()
      this.outputScroll.scrollToBottomOnUserInput()
      onInput(input)
    }))
    this.disposables.push(this.terminal.onScroll(() => {
      this.outputScroll.noteUserScroll()
      this.updateScrollbar()
    }))
    this.outputBatcher.setAfterFlush(this.updateScrollbar)
    this.loadWebgl(preferences.muteEmojiColors)
    this.applyLigatures(preferences)
  }

  /**
   * Push raw PTY bytes through localterm's synchronous frame-aware batcher.
   * @param bytes - output in Host delivery order.
   */
  write(bytes: Uint8Array): void {
    if (!this.disposed) this.outputBatcher.pushBytes(bytes)
  }

  /** Reset the visible buffer before a different persistent terminal replays. */
  reset(): void {
    if (this.disposed) return
    this.terminal.reset()
    this.updateScrollbar()
  }

  /**
   * Fit to the current container while preserving user scroll position.
   * @returns positive grid dimensions, or undefined while hidden or disposed.
   */
  fit(): TerminalDimensions | undefined {
    if (this.disposed) return undefined
    const dimensions = this.fitAddon.proposeDimensions()
    if (dimensions === undefined || dimensions.cols <= 0 || dimensions.rows <= 0) return undefined
    const snapshot = this.outputScroll.capture()
    this.terminal.resize(dimensions.cols, dimensions.rows)
    this.outputScroll.restore(snapshot)
    this.updateScrollbar()
    return dimensions
  }

  /** Remeasure loaded font faces and invalidate the WebGL glyph atlas. */
  refreshFontMetrics(): void {
    if (this.disposed) return
    const internals = this.terminal as unknown as {
      _core: { _charSizeService: { measure(): void } }
    }
    internals._core._charSizeService.measure()
    this.terminal.clearTextureAtlas()
  }

  /** Focus the xterm helper textarea. */
  focus(): void {
    if (!this.disposed) this.terminal.focus()
  }

  /** Restore the visible cursor when a newly spawned shell reaches its first prompt. */
  showCursor(): void {
    if (this.disposed) return
    this.terminal.write('[?25h', () => {
      if (!this.disposed) this.terminal.refresh(0, this.terminal.rows - 1)
    })
  }

  /**
   * Apply appearance changes without replacing the terminal or its scrollback.
   * @param preferences - validated shared appearance snapshot.
   * @param colorScheme - resolved app color scheme (palette follows appearance).
   */
  apply(preferences: TerminalPreferences, colorScheme: TerminalColorScheme): void {
    if (this.disposed) return
    this.terminal.options.theme = terminalTheme(colorScheme)
    this.terminal.options.minimumContrastRatio = colorScheme === 'light' ? 4.5 : 1
    this.terminal.options.fontFamily = terminalFontFamily(preferences)
    this.terminal.options.fontSize = preferences.fontSize
    this.terminal.options.lineHeight = preferences.lineHeight
    this.terminal.options.cursorBlink = preferences.cursorBlink
    this.webgl?.setEmojiColorsMuted(preferences.muteEmojiColors)
    this.terminal.clearTextureAtlas()
    this.applyLigatures(preferences)
    this.fit()
  }

  /** Release xterm, addons, output pacing, probes, and listeners exactly once. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.ligatureGeneration += 1
    this.disposeLigatures()
    this.uninstallScrollbar()
    this.outputBatcher.detach()
    for (const disposable of this.disposables) disposable.dispose()
    this.webgl = undefined
    this.terminal.dispose()
  }

  private readonly updateScrollbar = (): void => {
    const scrollbar = this.scrollbar
    if (scrollbar === undefined) return
    const buffer = this.terminal.buffer.active
    const totalLines = buffer.length
    const visibleLines = this.terminal.rows
    const hasScrollback = totalLines > visibleLines
    const atBottom = buffer.viewportY + visibleLines >= totalLines
    scrollbar.track.toggleAttribute('data-visible', hasScrollback && !atBottom)
    if (!hasScrollback) return
    scrollbar.thumb.style.height = `${String((visibleLines / totalLines) * 100)}%`
    scrollbar.thumb.style.top = `${String((buffer.viewportY / totalLines) * 100)}%`
  }

  private readonly onScrollbarThumbPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    this.outputScroll.noteUserScroll()
    this.scrollbarDragging = true
    this.scrollbarDragStartY = event.clientY
    this.scrollbarDragStartViewportY = this.terminal.buffer.active.viewportY
    try {
      ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
    } catch {
      // Browsers without pointer capture still deliver track clicks and wheel scrolling.
    }
    event.preventDefault()
  }

  private readonly onScrollbarThumbPointerMove = (event: PointerEvent): void => {
    if (!this.scrollbarDragging) return
    const scrollbar = this.scrollbar
    /* v8 ignore next -- uninstall removes the pointer listener before clearing this owned pair. */
    if (scrollbar === undefined) return
    const trackHeight = scrollbar.track.clientHeight
    const lastViewportLine = this.terminal.buffer.active.length - this.terminal.rows
    if (lastViewportLine <= 0 || trackHeight <= 0) return
    const targetViewportY = Math.max(0, Math.min(
      lastViewportLine,
      this.scrollbarDragStartViewportY
        + Math.round((event.clientY - this.scrollbarDragStartY) / (trackHeight / lastViewportLine)),
    ))
    const delta = targetViewportY - this.terminal.buffer.active.viewportY
    if (delta !== 0) this.terminal.scrollLines(delta)
  }

  private readonly onScrollbarThumbPointerUp = (): void => {
    this.scrollbarDragging = false
  }

  private readonly onScrollbarTrackPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const scrollbar = this.scrollbar
    /* v8 ignore next -- uninstall removes the pointer listener before clearing this owned pair. */
    if (scrollbar === undefined) return
    if (event.target === scrollbar.thumb) return
    this.outputScroll.noteUserScroll()
    const trackRect = scrollbar.track.getBoundingClientRect()
    if (trackRect.height <= 0) return
    const buffer = this.terminal.buffer.active
    const lastViewportLine = Math.max(0, buffer.length - this.terminal.rows)
    const clickRatio = (event.clientY - trackRect.top) / trackRect.height
    const targetViewportY = Math.max(0, Math.min(
      lastViewportLine,
      Math.round(clickRatio * buffer.length) - Math.floor(this.terminal.rows / 2),
    ))
    const delta = targetViewportY - buffer.viewportY
    if (delta !== 0) this.terminal.scrollLines(delta)
  }

  private installScrollbar(): void {
    const scrollbar = this.scrollbar
    if (scrollbar === undefined) return
    scrollbar.thumb.addEventListener('pointerdown', this.onScrollbarThumbPointerDown)
    scrollbar.thumb.addEventListener('pointermove', this.onScrollbarThumbPointerMove)
    scrollbar.thumb.addEventListener('pointerup', this.onScrollbarThumbPointerUp)
    scrollbar.thumb.addEventListener('pointercancel', this.onScrollbarThumbPointerUp)
    scrollbar.track.addEventListener('pointerdown', this.onScrollbarTrackPointerDown)
    this.updateScrollbar()
  }

  private uninstallScrollbar(): void {
    const scrollbar = this.scrollbar
    if (scrollbar === undefined) return
    scrollbar.thumb.removeEventListener('pointerdown', this.onScrollbarThumbPointerDown)
    scrollbar.thumb.removeEventListener('pointermove', this.onScrollbarThumbPointerMove)
    scrollbar.thumb.removeEventListener('pointerup', this.onScrollbarThumbPointerUp)
    scrollbar.thumb.removeEventListener('pointercancel', this.onScrollbarThumbPointerUp)
    scrollbar.track.removeEventListener('pointerdown', this.onScrollbarTrackPointerDown)
    this.scrollbar = undefined
  }

  private loadWebgl(muteEmojiColors: boolean): void {
    try {
      const addon = new WebglAddon({ muteEmojiColors })
      addon.onContextLoss(() => {
        if (this.webgl === addon) this.webgl = undefined
        this.outputBatcher.setInteractiveRenderingEnabled(false)
        addon.dispose()
      })
      this.terminal.loadAddon(addon)
      this.webgl = addon
      this.outputBatcher.setInteractiveRenderingEnabled(true)
    } catch {
      // WebGL construction can fail on software-only or context-limited browsers; xterm keeps its DOM renderer.
    }
  }

  private applyLigatures(preferences: TerminalPreferences): void {
    const generation = ++this.ligatureGeneration
    this.disposeLigatures()
    if (!preferences.ligatures) return
    const name = terminalFontName(preferences).replaceAll('"', '\\"')
    const ready = Promise.all([
      document.fonts.load(`${String(preferences.fontSize)}px "${name}"`),
      document.fonts.load(`bold ${String(preferences.fontSize)}px "${name}"`),
    ])
    void ready.then(() => {
      if (this.disposed || generation !== this.ligatureGeneration) return
      const probe = createLigatureSupportProbe(
        this.terminal.element,
        terminalFontFamily(preferences),
        preferences.fontSize,
      )
      this.ligatureProbe = probe
      this.ligatureJoinerId = this.terminal.registerCharacterJoiner(text =>
        findLigatureRanges(text).filter(range => probe.supports(text.slice(range[0], range[1]))),
      )
    })
  }

  private disposeLigatures(): void {
    if (this.ligatureJoinerId !== undefined) this.terminal.deregisterCharacterJoiner(this.ligatureJoinerId)
    this.ligatureJoinerId = undefined
    this.ligatureProbe?.dispose()
    this.ligatureProbe = undefined
  }
}
