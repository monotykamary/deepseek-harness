import type { Terminal as XtermTerminal } from '@xterm/xterm'
import { describe, expect, it, vi } from 'vitest'
import { createTerminalOutputScrollController } from '../src/client/output-scroll-controller.ts'

interface FakeTerminalBuffer {
  baseY: number
  cursorY: number
  type: 'normal' | 'alternate'
  viewportY: number
}

interface FakeTerminalMarker {
  dispose: () => void
  isDisposed: boolean
  line: number
}

interface TerminalScrollHarness {
  buffer: FakeTerminalBuffer
  controller: ReturnType<typeof createTerminalOutputScrollController>
  markers: FakeTerminalMarker[]
  registerMarker: ReturnType<typeof vi.fn>
  scrollLines: ReturnType<typeof vi.fn>
  scrollToBottom: ReturnType<typeof vi.fn>
  trimFullScrollback: (amount: number) => void
}

const createTerminalScrollHarness = (
  initialBuffer: FakeTerminalBuffer,
  scrollOnUserInput = true,
): TerminalScrollHarness => {
  const buffer = { ...initialBuffer }
  const markers: FakeTerminalMarker[] = []
  const registerMarker = vi.fn((cursorYOffset: number = 0) => {
    const marker: FakeTerminalMarker = {
      dispose: () => {
        marker.isDisposed = true
      },
      isDisposed: false,
      line: buffer.baseY + buffer.cursorY + cursorYOffset,
    }
    markers.push(marker)
    return marker
  })
  const scrollLines = vi.fn((amount: number) => {
    buffer.viewportY += amount
  })
  const scrollToBottom = vi.fn(() => {
    buffer.viewportY = buffer.baseY
  })
  const terminal = {
    buffer: { active: buffer },
    options: { scrollOnUserInput },
    registerMarker,
    scrollLines,
    scrollToBottom,
  } as unknown as XtermTerminal
  return {
    buffer,
    controller: createTerminalOutputScrollController(terminal),
    markers,
    registerMarker,
    scrollLines,
    scrollToBottom,
    trimFullScrollback: (amount) => {
      buffer.viewportY = Math.max(buffer.viewportY - amount, 0)
      for (const marker of markers) {
        if (marker.isDisposed) continue
        marker.line -= amount
        if (marker.line < 0) marker.dispose()
      }
    },
  }
}

describe('createTerminalOutputScrollController', () => {
  it('continues following output when the viewport was at the bottom', () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 100,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()
    harness.buffer.baseY = 105
    harness.buffer.viewportY = 101

    harness.controller.restore(snapshot)

    expect(harness.scrollToBottom).toHaveBeenCalledOnce()
    expect(harness.buffer.viewportY).toBe(105)
    expect(harness.registerMarker).not.toHaveBeenCalled()
  })

  it('does not refresh the viewport when xterm already followed output', () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 100,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()
    harness.buffer.baseY = 105
    harness.buffer.viewportY = 105

    harness.controller.restore(snapshot)

    expect(harness.scrollToBottom).not.toHaveBeenCalled()
    expect(harness.scrollLines).not.toHaveBeenCalled()
  })

  it('keeps the same absolute scrollback row visible while detached', () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 70,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()
    harness.buffer.baseY = 105
    harness.buffer.viewportY = 74

    harness.controller.restore(snapshot)

    expect(harness.scrollLines).toHaveBeenCalledWith(-4)
    expect(harness.buffer.viewportY).toBe(70)
    expect(harness.scrollToBottom).not.toHaveBeenCalled()
    expect(harness.markers[0]?.isDisposed).toBe(true)
  })

  it('tracks the viewed row when a full scrollback buffer trims', () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 70,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()

    harness.trimFullScrollback(5)
    harness.controller.restore(snapshot)

    expect(harness.buffer.viewportY).toBe(65)
    expect(harness.scrollLines).not.toHaveBeenCalled()
    expect(harness.markers[0]?.isDisposed).toBe(true)
  })

  it("keeps xterm's closest viewport when the viewed row was trimmed away", () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 3,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()

    harness.trimFullScrollback(5)
    harness.controller.restore(snapshot)

    expect(harness.buffer.viewportY).toBe(0)
    expect(harness.scrollLines).not.toHaveBeenCalled()
    expect(harness.scrollToBottom).not.toHaveBeenCalled()
  })

  it('does not overwrite scrolling that happens while output is parsing', () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 70,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()
    harness.buffer.baseY = 105
    harness.buffer.viewportY = 65
    harness.controller.noteUserScroll()

    harness.controller.restore(snapshot)

    expect(harness.scrollLines).not.toHaveBeenCalled()
    expect(harness.scrollToBottom).not.toHaveBeenCalled()
    expect(harness.buffer.viewportY).toBe(65)
    expect(harness.markers[0]?.isDisposed).toBe(true)
  })

  it('pins to the bottom on input and invalidates an in-flight output anchor', () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 70,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()

    expect(harness.controller.scrollToBottomOnUserInput()).toBe(true)
    harness.buffer.baseY = 105
    harness.buffer.viewportY = 105
    harness.controller.restore(snapshot)

    expect(harness.scrollToBottom).toHaveBeenCalledOnce()
    expect(harness.scrollLines).not.toHaveBeenCalled()
    expect(harness.buffer.viewportY).toBe(105)
    expect(harness.markers[0]?.isDisposed).toBe(true)
  })

  it('preserves a scrolled viewport when scroll-on-input is disabled', () => {
    const harness = createTerminalScrollHarness(
      { baseY: 100, cursorY: 20, viewportY: 70, type: 'normal' },
      false,
    )

    expect(harness.controller.scrollToBottomOnUserInput()).toBe(false)

    expect(harness.scrollToBottom).not.toHaveBeenCalled()
    expect(harness.buffer.viewportY).toBe(70)
  })

  it('does not carry a normal-buffer anchor into the alternate buffer', () => {
    const harness = createTerminalScrollHarness({
      baseY: 100,
      cursorY: 20,
      viewportY: 70,
      type: 'normal',
    })
    const snapshot = harness.controller.capture()
    harness.buffer.type = 'alternate'
    harness.buffer.baseY = 0
    harness.buffer.viewportY = 0

    harness.controller.restore(snapshot)

    expect(harness.scrollLines).not.toHaveBeenCalled()
    expect(harness.scrollToBottom).not.toHaveBeenCalled()
    expect(harness.markers[0]?.isDisposed).toBe(true)
  })
})
