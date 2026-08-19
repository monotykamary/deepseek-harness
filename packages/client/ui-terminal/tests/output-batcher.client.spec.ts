import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Terminal as XtermTerminal } from '@xterm/xterm'
import {
  INTERACTIVE_OUTPUT_RENDER_MAX_BYTES,
  OUTPUT_BATCHER_INITIAL_CAPACITY_BYTES,
  OUTPUT_KEEP_WARM_MS,
  OUTPUT_PENDING_WRITE_COMPACTION_THRESHOLD_WRITES,
  SYNCHRONIZED_OUTPUT_END_SEQUENCE,
} from '../src/client/performance/constants.ts'
import { createTerminalOutputScrollController } from '../src/client/performance/output-scroll-controller.ts'
import { OutputBatcher } from '../src/client/performance/output-batcher.ts'

interface OutputScrollBuffer {
  baseY: number
  cursorY: number
  viewportY: number
  type: 'normal'
}

interface OutputScrollMarker {
  dispose: () => void
  isDisposed: boolean
  line: number
}

interface FakeTerminalOptions {
  pendingRenderFrameId?: number
  onRenderFlush?: () => void
  deferredWriteCallbacks?: Array<() => void>
}

// Minimal xterm stub: record every write and expose the render debouncer used
// by the interactive fast path. The cast is required because
// OutputBatcher.attach is typed against the full XtermTerminal surface.
const createFakeTerminal = (
  writes: Uint8Array[],
  options: FakeTerminalOptions = {},
): XtermTerminal =>
  ({
    _core: {
      _renderService: {
        _renderDebouncer: {
          _animationFrame: options.pendingRenderFrameId,
          _innerRefresh: options.onRenderFlush,
        },
      },
    },
    write: (data: Uint8Array, callback?: () => void) => {
      writes.push(data)
      if (callback && options.deferredWriteCallbacks) {
        options.deferredWriteCallbacks.push(callback)
      } else {
        callback?.()
      }
    },
  }) as unknown as XtermTerminal

function writeAt(writes: readonly Uint8Array[], index: number): Uint8Array {
  const write = writes[index]
  if (write === undefined) throw new Error(`missing terminal write at index ${String(index)}`)
  return write
}

// A write above the batcher's initial buffer capacity (8KB) so a "large" push
// exercises the growth path; the exact size is otherwise arbitrary (the server
// caps a real message at OUTPUT_BATCH_FLUSH_BYTES, well under xterm's 12ms
// parse-yield budget).
const LARGE_BYTES = OUTPUT_BATCHER_INITIAL_CAPACITY_BYTES + 4096
const PENDING_RENDER_FRAME_ID = 73
const textEncoder = new TextEncoder()
const synchronizedOutputEndByteLength = textEncoder.encode(
  SYNCHRONIZED_OUTPUT_END_SEQUENCE,
).byteLength
const synchronizedFrame = (content: string): Uint8Array =>
  textEncoder.encode(`\x1b[?2026h${content}${SYNCHRONIZED_OUTPUT_END_SEQUENCE}`)
const withoutSynchronizedOutputEnd = (frame: Uint8Array): Uint8Array =>
  frame.subarray(0, frame.byteLength - synchronizedOutputEndByteLength)

interface RenderFlushHarness {
  batcher: OutputBatcher
  writes: Uint8Array[]
  readRenderFlushCount: () => number
}

const createRenderFlushHarness = (): RenderFlushHarness => {
  const writes: Uint8Array[] = []
  let renderFlushCount = 0
  const batcher = new OutputBatcher()
  batcher.attach(
    createFakeTerminal(writes, {
      pendingRenderFrameId: PENDING_RENDER_FRAME_ID,
      onRenderFlush: () => {
        renderFlushCount += 1
      },
    }),
  )
  return {
    batcher,
    writes,
    readRenderFlushCount: () => renderFlushCount,
  }
}

// Recording rAF: registers the callback but never fires it, so onKeepWarm only
// runs when the test calls pendingCb explicitly. This sidesteps the
// synchronous-stub infinite-recurse that the isDispatching guard exists for,
// and lets the test observe whether onKeepWarm re-armed by checking rafCount.
let rafCount = 0
let pendingCb: ((highResTimestamp: number) => void) | null = null
let canceledFrameIds: number[] = []

beforeEach(() => {
  rafCount = 0
  pendingCb = null
  canceledFrameIds = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCount += 1
    pendingCb = cb
    return rafCount
  })
  vi.stubGlobal('cancelAnimationFrame', (frameId: number) => canceledFrameIds.push(frameId))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OutputBatcher viewport anchoring', () => {
  const createViewportHarness = (baseY: number, viewportY: number, deferWrite: boolean) => {
    const buffer: OutputScrollBuffer = {
      baseY,
      cursorY: 0,
      viewportY,
      type: 'normal',
    }
    const deferredWriteCallbacks: Array<() => void> = []
    const registerMarker = (cursorYOffset = 0) => {
      const marker: OutputScrollMarker = {
        dispose: () => {
          marker.isDisposed = true
        },
        isDisposed: false,
        line: buffer.baseY + buffer.cursorY + cursorYOffset,
      }
      return marker
    }
    const scrollLines = vi.fn((amount: number) => {
      buffer.viewportY += amount
    })
    const scrollToBottom = vi.fn(() => {
      buffer.viewportY = buffer.baseY
    })
    const terminal = {
      buffer: { active: buffer },
      registerMarker,
      scrollLines,
      scrollToBottom,
      write: (_data: Uint8Array, callback?: () => void) => {
        buffer.baseY += 5
        buffer.viewportY += 2
        if (callback && deferWrite) deferredWriteCallbacks.push(callback)
        else callback?.()
      },
    } as unknown as XtermTerminal
    const scrollController = createTerminalOutputScrollController(terminal)
    const batcher = new OutputBatcher()
    batcher.attach(terminal, scrollController)
    return {
      batcher,
      buffer,
      deferredWriteCallbacks,
      scrollController,
      scrollLines,
      scrollToBottom,
      terminal,
    }
  }

  it('keeps following after output when it started at the bottom', () => {
    const harness = createViewportHarness(100, 100, false)

    harness.batcher.pushBytes(textEncoder.encode('output'))

    expect(harness.scrollToBottom).toHaveBeenCalledOnce()
    expect(harness.buffer.viewportY).toBe(105)
  })

  it('restores an absolute detached viewport after output parses', () => {
    const harness = createViewportHarness(100, 70, false)

    harness.batcher.pushBytes(textEncoder.encode('output'))

    expect(harness.scrollLines).toHaveBeenCalledWith(-2)
    expect(harness.buffer.viewportY).toBe(70)
  })

  it('does not restore a stale viewport over a user scroll during parsing', () => {
    const harness = createViewportHarness(100, 70, true)
    harness.batcher.pushBytes(textEncoder.encode('output'))
    harness.buffer.viewportY = 64
    harness.scrollController.noteUserScroll()

    harness.deferredWriteCallbacks[0]?.()

    expect(harness.scrollLines).not.toHaveBeenCalled()
    expect(harness.scrollToBottom).not.toHaveBeenCalled()
    expect(harness.buffer.viewportY).toBe(64)
  })

  it('restores a deferred write through the controller that captured it', () => {
    const firstHarness = createViewportHarness(100, 70, true)
    const secondHarness = createViewportHarness(20, 10, false)
    const firstRestore = vi.spyOn(firstHarness.scrollController, 'restore')
    const secondRestore = vi.spyOn(secondHarness.scrollController, 'restore')
    firstHarness.batcher.pushBytes(textEncoder.encode('output'))

    firstHarness.batcher.detach()
    firstHarness.batcher.attach(secondHarness.terminal, secondHarness.scrollController)
    firstHarness.deferredWriteCallbacks[0]?.()

    expect(firstRestore).toHaveBeenCalledOnce()
    expect(secondRestore).not.toHaveBeenCalled()
  })
})

describe('OutputBatcher staging buffer growth', () => {
  it('grows past OUTPUT_BATCHER_INITIAL_CAPACITY_BYTES without truncating tail bytes', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    const oversized = OUTPUT_BATCHER_INITIAL_CAPACITY_BYTES + 2048
    const bytes = new Uint8Array(oversized)
    for (let index = 0; index < oversized; index += 1) bytes[index] = index & 0xff

    batcher.pushBytes(bytes)
    batcher.detach()

    expect(writes).toHaveLength(1)
    expect(writeAt(writes, 0).byteLength).toBe(oversized)
    expect(writeAt(writes, 0)).toEqual(bytes)
  })
})

describe('OutputBatcher raw in/out (flush on arrival)', () => {
  it('consumes the pending WebGL render for a small response after user input', () => {
    const { batcher, writes, readRenderFlushCount } = createRenderFlushHarness()
    batcher.setInteractiveRenderingEnabled(true)

    batcher.noteUserInput()
    batcher.pushBytes(new Uint8Array([65, 66, 67]))

    expect(writes).toHaveLength(1)
    expect(readRenderFlushCount()).toBe(1)
    expect(canceledFrameIds).toContain(PENDING_RENDER_FRAME_ID)
    batcher.detach()
  })

  it('leaves input responses on the normal rAF when WebGL is unavailable', () => {
    const { batcher, writes, readRenderFlushCount } = createRenderFlushHarness()

    batcher.noteUserInput()
    batcher.pushBytes(new Uint8Array([65, 66, 67]))

    expect(writes).toHaveLength(1)
    expect(readRenderFlushCount()).toBe(0)
    expect(canceledFrameIds).not.toContain(PENDING_RENDER_FRAME_ID)
    batcher.detach()
  })

  it("leaves autonomous output on xterm's normal render rAF", () => {
    const { batcher, writes, readRenderFlushCount } = createRenderFlushHarness()
    batcher.setInteractiveRenderingEnabled(true)

    batcher.pushBytes(new Uint8Array([65, 66, 67]))

    expect(writes).toHaveLength(1)
    expect(readRenderFlushCount()).toBe(0)
    expect(canceledFrameIds).not.toContain(PENDING_RENDER_FRAME_ID)
    batcher.detach()
  })

  it('does not synchronously render a throughput-sized response after input', () => {
    const { batcher, writes, readRenderFlushCount } = createRenderFlushHarness()
    batcher.setInteractiveRenderingEnabled(true)

    batcher.noteUserInput()
    batcher.pushBytes(new Uint8Array(INTERACTIVE_OUTPUT_RENDER_MAX_BYTES + 1))
    batcher.pushBytes(new Uint8Array([65]))

    expect(writes).toHaveLength(2)
    expect(readRenderFlushCount()).toBe(0)
    expect(canceledFrameIds).not.toContain(PENDING_RENDER_FRAME_ID)
    batcher.detach()
  })

  it('flushes small output synchronously so xterm answers queries in the same task', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    // A small frame (a terminal query plus a prompt redraw) flushes
    // immediately — no deferral — so xterm parses and answers it in the same
    // task and the probing program reads the response before its short read
    // timeout, instead of the response leaking into the shell as typed text.
    batcher.pushBytes(new Uint8Array([65, 66, 67]))
    expect(writes).toHaveLength(1)
    expect(Array.from(writeAt(writes, 0))).toEqual([65, 66, 67])
    // A keep-warm rAF is armed (not a deferred flush) so the compositor stays
    // warm; its onKeepWarm no-ops on an empty buffer.
    expect(rafCount).toBe(1)
    expect(pendingCb).not.toBeNull()
    batcher.detach()
  })

  it('flushes each push separately (no coalescing) for lowest latency', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    batcher.pushBytes(new Uint8Array([1, 2, 3]))
    batcher.pushBytes(new Uint8Array([4, 5, 6, 7]))
    batcher.pushBytes(new Uint8Array([8]))

    // The server coalesces one logical frame per WebSocket message, so the
    // client does not coalesce — each push flushes on arrival (lowest latency
    // beats coalescing for interactive/animated output), so three writes land.
    expect(writes).toHaveLength(3)
    expect(Array.from(writeAt(writes, 0))).toEqual([1, 2, 3])
    expect(Array.from(writeAt(writes, 1))).toEqual([4, 5, 6, 7])
    expect(Array.from(writeAt(writes, 2))).toEqual([8])
    batcher.detach()
  })

  it('flushes large output immediately, not deferred to a timer or rAF', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    batcher.pushBytes(new Uint8Array(LARGE_BYTES).fill(1))
    batcher.pushBytes(new Uint8Array(LARGE_BYTES).fill(2))

    // Large frames flush on arrival (no rAF/idle-debounce deferral), so both
    // writes land immediately. Only the no-op keep-warm rAF is armed.
    expect(writes).toHaveLength(2)
    expect(writeAt(writes, 0).byteLength).toBe(LARGE_BYTES)
    expect(writeAt(writes, 1).byteLength).toBe(LARGE_BYTES)
    expect(rafCount).toBe(1)
    batcher.detach()
  })

  it('flushes a small interactive write immediately even during a stream', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    // A high-throughput stream message flushes on arrival, then a keystroke
    // echo / terminal query that lands right after it flushes in its own
    // task — xterm answers the query before the probing program's read times
    // out, and the echo paints without waiting on anything.
    batcher.pushBytes(new Uint8Array(LARGE_BYTES).fill(1))
    expect(writes).toHaveLength(1)

    batcher.pushBytes(new Uint8Array([65, 66, 67]))
    expect(writes).toHaveLength(2)
    expect(writeAt(writes, 1).byteLength).toBe(3)
    expect(Array.from(writeAt(writes, 1))).toEqual([65, 66, 67])
    batcher.detach()
  })
})

describe('OutputBatcher synchronized-output pacing', () => {
  it('holds an incomplete next frame until xterm presents the completed frame', () => {
    const writes: Uint8Array[] = []
    const deferredWriteCallbacks: Array<() => void> = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes, { deferredWriteCallbacks }))
    const incompleteSecondFrame = withoutSynchronizedOutputEnd(synchronizedFrame('second'))

    batcher.pushBytes(synchronizedFrame('first'))
    batcher.pushBytes(incompleteSecondFrame)

    expect(writes).toHaveLength(1)
    expect(deferredWriteCallbacks).toHaveLength(1)

    deferredWriteCallbacks.shift()?.()
    const releaseFrame = pendingCb
    expect(releaseFrame).toBeTruthy()
    expect(writes).toHaveLength(1)

    releaseFrame!(performance.now())

    expect(writes).toHaveLength(2)
    expect(Array.from(writeAt(writes, 1))).toEqual(Array.from(incompleteSecondFrame))
    batcher.detach()
  })

  it('preempts a pending render wait only after multiple newer frames complete', () => {
    const writes: Uint8Array[] = []
    const deferredWriteCallbacks: Array<() => void> = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes, { deferredWriteCallbacks }))
    const secondFrame = synchronizedFrame('second')
    const thirdFrame = synchronizedFrame('third')
    const completedBacklog = new Uint8Array(secondFrame.byteLength + thirdFrame.byteLength)
    completedBacklog.set(secondFrame)
    completedBacklog.set(thirdFrame, secondFrame.byteLength)

    batcher.pushBytes(synchronizedFrame('first'))
    deferredWriteCallbacks.shift()?.()
    const staleReleaseFrame = pendingCb
    const staleReleaseFrameId = rafCount

    batcher.pushBytes(secondFrame)

    expect(writes).toHaveLength(1)
    expect(canceledFrameIds).not.toContain(staleReleaseFrameId)

    batcher.pushBytes(thirdFrame)

    expect(canceledFrameIds).toContain(staleReleaseFrameId)
    expect(writes).toHaveLength(2)
    expect(Array.from(writeAt(writes, 1))).toEqual(Array.from(completedBacklog))
    expect(deferredWriteCallbacks).toHaveLength(1)

    staleReleaseFrame?.(performance.now())
    expect(writes).toHaveLength(2)
    batcher.detach()
  })

  it('detects a synchronized-output end across every incoming-write boundary', () => {
    const firstFrame = synchronizedFrame('split')

    for (let splitIndex = 1; splitIndex < synchronizedOutputEndByteLength; splitIndex += 1) {
      const writes: Uint8Array[] = []
      const deferredWriteCallbacks: Array<() => void> = []
      const batcher = new OutputBatcher()
      batcher.attach(createFakeTerminal(writes, { deferredWriteCallbacks }))
      const splitOffset = firstFrame.byteLength - synchronizedOutputEndByteLength + splitIndex

      batcher.pushBytes(firstFrame.subarray(0, splitOffset))
      batcher.pushBytes(firstFrame.subarray(splitOffset))

      expect(writes).toHaveLength(2)
      expect(deferredWriteCallbacks).toHaveLength(1)

      deferredWriteCallbacks.shift()?.()
      const releaseFrame = pendingCb
      expect(releaseFrame).toBeTruthy()
      releaseFrame!(performance.now())

      const nextFrame = synchronizedFrame('next')
      batcher.pushBytes(nextFrame)

      expect(writes).toHaveLength(3)
      expect(Array.from(writeAt(writes, 0))).toEqual(Array.from(firstFrame.subarray(0, splitOffset)))
      expect(Array.from(writeAt(writes, 1))).toEqual(Array.from(firstFrame.subarray(splitOffset)))
      expect(Array.from(writeAt(writes, 2))).toEqual(Array.from(nextFrame))
      batcher.detach()
    }
  })

  it('parses a synchronized burst in order and paces only its newest frame', () => {
    const writes: Uint8Array[] = []
    const deferredWriteCallbacks: Array<() => void> = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes, { deferredWriteCallbacks }))
    const firstFrame = synchronizedFrame('first')
    const secondFrame = synchronizedFrame('second')
    const combinedFrames = new Uint8Array(firstFrame.byteLength + secondFrame.byteLength)
    combinedFrames.set(firstFrame)
    combinedFrames.set(secondFrame, firstFrame.byteLength)

    batcher.pushBytes(combinedFrames)

    expect(writes).toHaveLength(2)
    expect(Array.from(writeAt(writes, 0))).toEqual(Array.from(firstFrame))
    expect(Array.from(writeAt(writes, 1))).toEqual(Array.from(secondFrame))
    expect(deferredWriteCallbacks).toHaveLength(1)

    deferredWriteCallbacks.shift()?.()
    expect(pendingCb).toBeTruthy()
    batcher.detach()
  })

  it('coalesces a completed local burst behind the current frame', () => {
    const writes: Uint8Array[] = []
    const deferredWriteCallbacks: Array<() => void> = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes, { deferredWriteCallbacks }))
    const firstFrame = synchronizedFrame('first')
    const secondFrame = synchronizedFrame('second')
    const thirdFrame = synchronizedFrame('third')
    const completedBacklog = new Uint8Array(secondFrame.byteLength + thirdFrame.byteLength)
    completedBacklog.set(secondFrame)
    completedBacklog.set(thirdFrame, secondFrame.byteLength)

    batcher.pushBytes(firstFrame)
    batcher.pushBytes(secondFrame)
    batcher.pushBytes(thirdFrame)

    expect(writes).toHaveLength(2)
    expect(Array.from(writeAt(writes, 0))).toEqual(Array.from(firstFrame))
    expect(Array.from(writeAt(writes, 1))).toEqual(Array.from(completedBacklog))
    expect(deferredWriteCallbacks).toHaveLength(2)

    const frameCountBeforeParseCallbacks = rafCount
    deferredWriteCallbacks.shift()?.()
    expect(rafCount).toBe(frameCountBeforeParseCallbacks)

    deferredWriteCallbacks.shift()?.()
    expect(rafCount).toBe(frameCountBeforeParseCallbacks + 1)
    batcher.detach()
  })

  it('drains a large pending-write backlog in order', () => {
    const writes: Uint8Array[] = []
    const deferredWriteCallbacks: Array<() => void> = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes, { deferredWriteCallbacks }))
    const backlogLength =
      OUTPUT_PENDING_WRITE_COMPACTION_THRESHOLD_WRITES +
      OUTPUT_PENDING_WRITE_COMPACTION_THRESHOLD_WRITES

    batcher.pushBytes(synchronizedFrame('first'))
    for (let writeIndex = 0; writeIndex < backlogLength; writeIndex += 1) {
      batcher.pushBytes(new Uint8Array([65]))
    }
    const penultimateFrame = synchronizedFrame('penultimate')
    const finalFrame = synchronizedFrame('final')
    batcher.pushBytes(penultimateFrame)
    batcher.pushBytes(finalFrame)

    expect(writes).toHaveLength(2)
    expect(writeAt(writes, 1).byteLength).toBe(
      backlogLength + penultimateFrame.byteLength + finalFrame.byteLength,
    )
    expect(Array.from(writeAt(writes, 1).subarray(0, backlogLength))).toEqual(
      new Array(backlogLength).fill(65),
    )
    expect(
      Array.from(writeAt(writes, 1).subarray(backlogLength, backlogLength + penultimateFrame.byteLength)),
    ).toEqual(Array.from(penultimateFrame))
    expect(Array.from(writeAt(writes, 1).subarray(backlogLength + penultimateFrame.byteLength))).toEqual(
      Array.from(finalFrame),
    )
    expect(deferredWriteCallbacks).toHaveLength(2)
    batcher.detach()
  })

  it('bypasses a pending frame wait when the user sends input', () => {
    const writes: Uint8Array[] = []
    const deferredWriteCallbacks: Array<() => void> = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes, { deferredWriteCallbacks }))

    const firstFrame = synchronizedFrame('first')
    const incompleteSecondFrame = withoutSynchronizedOutputEnd(synchronizedFrame('second'))
    const inputResponseFrame = synchronizedFrame('input-response')
    batcher.pushBytes(firstFrame)
    batcher.pushBytes(incompleteSecondFrame)
    expect(writes).toHaveLength(1)

    batcher.noteUserInput()
    batcher.pushBytes(inputResponseFrame)

    expect(writes).toHaveLength(3)
    expect(Array.from(writeAt(writes, 1))).toEqual(Array.from(incompleteSecondFrame))
    expect(Array.from(writeAt(writes, 2))).toEqual(Array.from(inputResponseFrame))
    expect(deferredWriteCallbacks).toHaveLength(1)
    batcher.detach()
  })

  it('does not pace synchronized frames in a hidden document', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))
    vi.stubGlobal('document', { hidden: true })

    try {
      batcher.pushBytes(synchronizedFrame('first'))
      batcher.pushBytes(synchronizedFrame('second'))

      expect(writes).toHaveLength(2)
      expect(rafCount).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
    batcher.detach()
  })
})

describe('OutputBatcher keep-warm rAF cadence', () => {
  it('pauses keep-warm through an immediate response and re-arms for autonomous output', () => {
    const { batcher, writes, readRenderFlushCount } = createRenderFlushHarness()
    batcher.setInteractiveRenderingEnabled(true)

    batcher.pushBytes(new Uint8Array([65]))
    const initialKeepWarmFrameId = rafCount

    batcher.noteUserInput()

    expect(canceledFrameIds).toContain(initialKeepWarmFrameId)
    const frameCountBeforeResponse = rafCount

    batcher.pushBytes(new Uint8Array([66]))

    expect(writes).toHaveLength(2)
    expect(readRenderFlushCount()).toBe(1)
    expect(rafCount).toBe(frameCountBeforeResponse)

    batcher.pushBytes(new Uint8Array([67]))

    expect(rafCount).toBeGreaterThan(frameCountBeforeResponse)
    batcher.detach()
  })

  it('re-arms the rAF within OUTPUT_KEEP_WARM_MS of the last output', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    batcher.pushBytes(new Uint8Array([65, 66, 67]))
    expect(rafCount).toBe(1)
    const firstFrame = pendingCb
    expect(firstFrame).toBeTruthy()

    firstFrame!(performance.now())

    expect(writes).toHaveLength(1)
    expect(rafCount).toBe(2)
    expect(pendingCb).not.toBeNull()
    batcher.detach()
  })

  it('lets the rAF lapse once output goes idle past OUTPUT_KEEP_WARM_MS', async () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    batcher.pushBytes(new Uint8Array([65]))
    expect(rafCount).toBe(1)
    const firstFrame = pendingCb
    expect(firstFrame).toBeTruthy()

    // Let real wall-clock time elapse past the keep-warm window with no fresh
    // output, then fire the queued frame: onKeepWarm must NOT re-arm.
    await new Promise(resolve => setTimeout(resolve, OUTPUT_KEEP_WARM_MS + 50))
    firstFrame!(performance.now())

    expect(writes).toHaveLength(1)
    expect(rafCount).toBe(1)
  })
})

describe('OutputBatcher background-tab flush', () => {
  it('flushes synchronously (no rAF) while the document is hidden', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    vi.stubGlobal('document', { hidden: true })

    try {
      batcher.pushBytes(new Uint8Array([65, 66, 67]))
      // A hidden document must not arm a (paused) rAF: it writes immediately so
      // xterm can answer a query before the probing program's read times out.
      expect(rafCount).toBe(0)
      expect(writes).toHaveLength(1)
      expect(Array.from(writeAt(writes, 0))).toEqual([65, 66, 67])
    } finally {
      vi.unstubAllGlobals()
    }
    batcher.detach()
  })

  it('flushes each hidden push separately with no rAF', () => {
    const writes: Uint8Array[] = []
    const batcher = new OutputBatcher()
    batcher.attach(createFakeTerminal(writes))

    vi.stubGlobal('document', { hidden: true })

    try {
      batcher.pushBytes(new Uint8Array([65]))
      batcher.pushBytes(new Uint8Array([66, 67]))
      // Each hidden push flushes on arrival — two writes — and no rAF is armed.
      expect(rafCount).toBe(0)
      expect(writes).toHaveLength(2)
      expect(Array.from(writeAt(writes, 0))).toEqual([65])
      expect(Array.from(writeAt(writes, 1))).toEqual([66, 67])
    } finally {
      vi.unstubAllGlobals()
    }
    batcher.detach()
  })
})
