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
import { terminalTheme } from './themes.ts'

/** Visible terminal grid dimensions. */
export interface TerminalDimensions {
  readonly cols: number
  readonly rows: number
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
  private disposed = false

  /** Create and open one xterm instance inside its stable DOM container. */
  constructor(container: HTMLDivElement, preferences: TerminalPreferences, onInput: (input: string) => void) {
    const theme = terminalTheme(preferences.theme)
    this.terminal = new XtermTerminal({
      allowProposedApi: true,
      cursorBlink: preferences.cursorBlink,
      cursorStyle: 'block',
      fontFamily: terminalFontFamily(preferences),
      fontSize: preferences.fontSize,
      lineHeight: preferences.lineHeight,
      minimumContrastRatio: preferences.theme === 'light' ? 4.5 : 1,
      scrollback: 10_000,
      scrollOnUserInput: true,
      macOptionIsMeta: true,
      theme,
      windowOptions: {
        getWinSizePixels: true,
        getCellSizePixels: true,
        getWinSizeChars: true,
      },
      scrollbar: { showScrollbar: true },
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
    this.disposables.push(this.terminal.onData((input) => {
      this.outputBatcher.noteUserInput()
      this.outputScroll.scrollToBottomOnUserInput()
      onInput(input)
    }))
    this.disposables.push(this.terminal.onScroll(() => { this.outputScroll.noteUserScroll() }))
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
    if (!this.disposed) this.terminal.reset()
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
   */
  apply(preferences: TerminalPreferences): void {
    if (this.disposed) return
    this.terminal.options.theme = terminalTheme(preferences.theme)
    this.terminal.options.minimumContrastRatio = preferences.theme === 'light' ? 4.5 : 1
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
    this.outputBatcher.detach()
    for (const disposable of this.disposables) disposable.dispose()
    this.webgl = undefined
    this.terminal.dispose()
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
