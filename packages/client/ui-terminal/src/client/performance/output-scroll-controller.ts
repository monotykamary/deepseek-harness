/** Adapted from localterm revision 8de7394; MIT license in THIRD_PARTY_NOTICES.md. */

import type { IMarker, Terminal as XtermTerminal } from '@xterm/xterm'

interface TerminalOutputScrollSnapshot {
  bufferType: 'normal' | 'alternate'
  userScrollGeneration: number
  viewportMarker: IMarker | null
  viewportY: number
  wasAtBottom: boolean
}

/** User-scroll generation and viewport marker operations around xterm writes. */
export interface TerminalOutputScrollController {
  capture: () => TerminalOutputScrollSnapshot
  noteUserScroll: () => void
  scrollToBottomOnUserInput: () => boolean
  restore: (snapshot: TerminalOutputScrollSnapshot) => void
}

/**
 * Create per-terminal scroll capture and restoration state.
 * @param terminal - xterm whose active buffer and viewport are controlled.
 * @returns controller released with the owning xterm surface.
 */
export const createTerminalOutputScrollController = (
  terminal: XtermTerminal,
): TerminalOutputScrollController => {
  let userScrollGeneration = 0

  return {
    capture: () => {
      const buffer = terminal.buffer.active
      const wasAtBottom = buffer.viewportY === buffer.baseY
      return {
        bufferType: buffer.type,
        userScrollGeneration,
        viewportMarker:
          buffer.type === 'normal' && !wasAtBottom
            ? terminal.registerMarker(buffer.viewportY - buffer.baseY - buffer.cursorY)
            : null,
        viewportY: buffer.viewportY,
        wasAtBottom,
      }
    },
    noteUserScroll: () => {
      userScrollGeneration += 1
    },
    scrollToBottomOnUserInput: () => {
      if (!terminal.options.scrollOnUserInput) return false
      userScrollGeneration += 1
      const buffer = terminal.buffer.active
      if (buffer.viewportY !== buffer.baseY) terminal.scrollToBottom()
      return true
    },
    restore: (snapshot) => {
      try {
        if (snapshot.userScrollGeneration !== userScrollGeneration) return
        const buffer = terminal.buffer.active
        if (buffer.type !== snapshot.bufferType) return
        if (snapshot.wasAtBottom) {
          if (buffer.viewportY !== buffer.baseY) terminal.scrollToBottom()
          return
        }
        if (snapshot.viewportMarker?.isDisposed) return
        const targetViewportY = Math.min(
          snapshot.viewportMarker?.line ?? snapshot.viewportY,
          buffer.baseY,
        )
        const lineDelta = targetViewportY - buffer.viewportY
        if (lineDelta !== 0) terminal.scrollLines(lineDelta)
      } finally {
        snapshot.viewportMarker?.dispose()
      }
    },
  }
}
