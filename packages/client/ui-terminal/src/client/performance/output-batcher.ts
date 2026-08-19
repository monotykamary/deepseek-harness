/** Adapted from localterm revision 8de7394; MIT license in THIRD_PARTY_NOTICES.md. */

import {
  INTERACTIVE_OUTPUT_RENDER_MAX_BYTES,
  INTERACTIVE_OUTPUT_RENDER_WINDOW_MS,
  OUTPUT_BATCHER_INITIAL_CAPACITY_BYTES,
  OUTPUT_KEEP_WARM_MS,
  OUTPUT_PENDING_WRITE_COMPACTION_THRESHOLD_WRITES,
  SYNCHRONIZED_OUTPUT_END_SEQUENCE,
  SYNCHRONIZED_OUTPUT_PREEMPTION_MINIMUM_COMPLETED_FRAMES,
} from './constants.ts'
import type { Terminal as XtermTerminal } from '@xterm/xterm'
import type { TerminalOutputScrollController } from './output-scroll-controller.ts'

interface XtermRenderDebouncer {
  _animationFrame?: number
  _innerRefresh?: () => void
}

interface XtermRenderService {
  _renderDebouncer?: XtermRenderDebouncer
}

interface XtermCore {
  _renderService?: XtermRenderService
}

interface XtermTerminalWithCore extends XtermTerminal {
  _core?: XtermCore
}

interface PendingTerminalWrite {
  bytes: Uint8Array
  endsSynchronizedOutput: boolean
}

const SYNCHRONIZED_OUTPUT_END_BYTES = Uint8Array.from(
  SYNCHRONIZED_OUTPUT_END_SEQUENCE,
  character => character.charCodeAt(0),
)
const SYNCHRONIZED_OUTPUT_END_FINAL_BYTE = SYNCHRONIZED_OUTPUT_END_SEQUENCE.charCodeAt(
  SYNCHRONIZED_OUTPUT_END_SEQUENCE.length - 1,
)
const SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY = SYNCHRONIZED_OUTPUT_END_BYTES.length - 1

const performanceNow = () => performance.now()

const isDocumentHidden = (): boolean => typeof document !== 'undefined' && document.hidden

// xterm exposes synchronous redraw internally but not through its public API.
// Consume the render range its parser already queued instead of requesting a
// second full render; canceling that range's rAF prevents duplicate GPU work.
// Missing internals degrade to xterm's normal scheduled render.
const flushPendingInteractiveRender = (terminal: XtermTerminal): void => {
  const renderDebouncer = (terminal as XtermTerminalWithCore)._core?._renderService
    ?._renderDebouncer
  if (!renderDebouncer?._innerRefresh) return
  if (renderDebouncer._animationFrame !== undefined) {
    cancelAnimationFrame(renderDebouncer._animationFrame)
  }
  renderDebouncer._innerRefresh()
}

/** Per-xterm raw output scheduler preserving synchronized frame and scroll semantics. */
export class OutputBatcher {
  private terminal: XtermTerminal | null = null
  private outputScrollController: TerminalOutputScrollController | null = null
  private buffer = new Uint8Array(OUTPUT_BATCHER_INITIAL_CAPACITY_BYTES)
  private byteLength = 0
  private pendingWrites: Array<PendingTerminalWrite | undefined> = []
  private pendingWriteIndex = 0
  private pendingSynchronizedFrameCount = 0
  private synchronizedOutputTrailingBytes = new Uint8Array(
    SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY,
  )
  private synchronizedOutputTrailingByteLength = 0
  private synchronizedOutputBoundaryCandidate = new Uint8Array(
    SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY + SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY,
  )
  private awaitingSynchronizedFrameRender = false
  private synchronizedFrameGeneration = 0
  private synchronizedFrameReleaseId: number | null = null
  private synchronizedFramePacingBypassAtMs = Number.NEGATIVE_INFINITY
  // No-op vsync commit that keeps Chrome's compositor frame loop warm across
  // the gaps between animation frames. Carries no parse work — the flush is
  // synchronous in pushBytes — so it can't starve xterm's render rAF.
  private keepWarmFrameId: number | null = null
  private lastOutputAtMs = 0
  private lastUserInputAtMs = Number.NEGATIVE_INFINITY
  private interactiveRenderingEnabled = false
  private afterFlush: (() => void) | null = null
  // Re-entrancy guard for test rAF stubs that fire the callback synchronously
  // inside requestAnimationFrame, which would infinite-recurse via the
  // keep-warm re-arm. Checked at entry: a synchronous inner fire skips; the
  // next vsync (or time advance in tests) picks up the re-arm the outer set.
  private isDispatching = false

  /**
   * Attach one xterm and reset all prior scheduling state.
   * @param terminal - exclusive output destination for this batcher.
   * @param outputScrollController - optional user-scroll anchor owner.
   */
  attach = (
    terminal: XtermTerminal,
    outputScrollController: TerminalOutputScrollController | null = null,
  ) => {
    this.terminal = terminal
    this.outputScrollController = outputScrollController
    this.pendingWrites = []
    this.pendingWriteIndex = 0
    this.pendingSynchronizedFrameCount = 0
    this.synchronizedOutputTrailingByteLength = 0
    this.awaitingSynchronizedFrameRender = false
    this.synchronizedFrameGeneration += 1
    this.synchronizedFrameReleaseId = null
    this.synchronizedFramePacingBypassAtMs = Number.NEGATIVE_INFINITY
    this.lastUserInputAtMs = Number.NEGATIVE_INFINITY
    this.interactiveRenderingEnabled = false
  }

  /**
   * Enable the bounded post-input synchronous WebGL render path.
   * @param enabled - true only while a live WebGL renderer exists.
   */
  setInteractiveRenderingEnabled = (enabled: boolean) => {
    this.interactiveRenderingEnabled = enabled
  }

  /** Mark successful PTY input and cancel autonomous compositor pacing. */
  noteUserInput = () => {
    const inputAtMs = performanceNow()
    this.lastUserInputAtMs = inputAtMs
    this.synchronizedFramePacingBypassAtMs = inputAtMs
    // Chromium can defer inbound WebSocket delivery to the next vsync while
    // the no-op frame loop is armed. Autonomous output re-arms it later.
    this.cancelKeepWarm()
    this.cancelSynchronizedFrameWait()
  }

  /**
   * Set an observer called after each xterm write dispatch.
   * @param callback - observer or null to clear it.
   */
  setAfterFlush = (callback: (() => void) | null) => {
    this.afterFlush = callback
  }

  /** Flush pending bytes, cancel frame callbacks, and release the xterm reference. */
  detach = () => {
    this.cancelKeepWarm()
    this.cancelSynchronizedFrameWait()
    this.lastUserInputAtMs = Number.NEGATIVE_INFINITY
    this.interactiveRenderingEnabled = false
    this.flushPending(true)
    this.pendingWrites = []
    this.pendingWriteIndex = 0
    this.pendingSynchronizedFrameCount = 0
    this.synchronizedOutputTrailingByteLength = 0
    this.synchronizedFramePacingBypassAtMs = Number.NEGATIVE_INFINITY
    this.terminal = null
    this.outputScrollController = null
    this.afterFlush = null
  }

  /**
   * Parse one raw UTF-8 transport frame at the earliest safe render boundary.
   * @param bytes - terminal output bytes in PTY delivery order.
   */
  pushBytes = (bytes: Uint8Array) => {
    this.enqueueBytes(bytes)
    this.lastOutputAtMs = performanceNow()
    // Raw in/out: flush on arrival. Ordinary output enters as one server chunk
    // capped at OUTPUT_BATCH_FLUSH_BYTES. When a redraw crosses that cap, the
    // output session retains its bracketed transport chunks and calls pushBytes
    // once with the complete logical frame, so unsynchronized tmux output is one
    // xterm parse action and cannot paint between its pieces. DEC 2026 boundaries
    // inside that frame still feed the completed-frame gate below, which holds
    // the next complete frame until xterm presents the current one. Multiple
    // newer completions prove a real backlog rather than a normal vsync phase
    // overlap; only then does the backlog preempt the stale wait and collapse to
    // its newest state, preventing an upstream scheduler from phase-locking
    // behind the browser's render cadence. Ordinary messages remain one
    // terminal.write in their WS message task; only a backlog ending in a proven
    // completion is copied into one parse transaction, so xterm cannot yield
    // between its pieces with synchronized mode still active. xterm's parse
    // never runs inside a vsync and can't starve the render rAF. xterm's own
    // render rAF is the single vsync gate for normal output. A bounded response
    // immediately following PTY input consumes that pending WebGL render in the
    // write callback, letting it make the current compositor frame without
    // changing the parse or batching path for autonomous output. Flushing on arrival
    // gives every other frame the earliest possible render rAF: no latency
    // window to shift a frame past a vsync boundary and skip it (the visible
    // jank on a 60fps TUI animation such as the opentui golden-star demo). A
    // backgrounded browser tab pauses rAF and throttles setTimeout to ~1Hz, but
    // ordinary ≤64 KiB writes still parse within xterm's 12ms budget in the same
    // task — answering terminal queries before the probing program times out. A
    // larger bracketed redraw is intentionally one WriteBuffer chunk; xterm runs
    // its parse action before checking that budget, so no renderer task can expose
    // the intermediate screen. There is no paint cost while hidden.
    const shouldCoalesceCompletedFrameBacklog =
      this.preemptSynchronizedFrameWaitForCompletedBacklog()
    const didRenderImmediately = this.flushPending(false, shouldCoalesceCompletedFrameBacklog)
    // The bounded WebGL fast path already draws in this task. Re-arming the
    // no-op frame loop here makes Chromium defer the next response to vsync.
    if (!isDocumentHidden() && !didRenderImmediately) this.armKeepWarm()
  }

  private ensureCapacity = (additionalBytes: number) => {
    if (this.buffer.byteLength - this.byteLength >= additionalBytes) return
    const grown = new Uint8Array(
      Math.max(this.buffer.byteLength * 2, this.byteLength + additionalBytes),
    )
    grown.set(this.buffer.subarray(0, this.byteLength))
    this.buffer = grown
  }

  private appendBytes = (bytes: Uint8Array) => {
    this.ensureCapacity(bytes.byteLength)
    this.buffer.set(bytes, this.byteLength)
    this.byteLength += bytes.byteLength
  }

  private enqueueBytes = (bytes: Uint8Array) => {
    let segmentStart = 0
    const crossingSequenceEnd = this.findCrossingSynchronizedOutputEnd(bytes)
    if (crossingSequenceEnd !== -1) {
      this.enqueueWrite(bytes.subarray(0, crossingSequenceEnd), true)
      segmentStart = crossingSequenceEnd
    }

    let sequenceEndIndex = bytes.indexOf(
      SYNCHRONIZED_OUTPUT_END_FINAL_BYTE,
      Math.max(
        SYNCHRONIZED_OUTPUT_END_BYTES.length - 1,
        segmentStart + SYNCHRONIZED_OUTPUT_END_BYTES.length - 1,
      ),
    )
    while (sequenceEndIndex !== -1) {
      const sequenceStartIndex = sequenceEndIndex - SYNCHRONIZED_OUTPUT_END_BYTES.length + 1
      if (
        sequenceStartIndex >= segmentStart &&
        this.matchesSynchronizedOutputEnd(bytes, sequenceStartIndex)
      ) {
        const sequenceEndOffset = sequenceEndIndex + 1
        this.enqueueWrite(bytes.subarray(segmentStart, sequenceEndOffset), true)
        segmentStart = sequenceEndOffset
      }
      sequenceEndIndex = bytes.indexOf(SYNCHRONIZED_OUTPUT_END_FINAL_BYTE, sequenceEndIndex + 1)
    }

    if (segmentStart < bytes.byteLength) {
      this.enqueueWrite(bytes.subarray(segmentStart), false)
    }
    this.updateSynchronizedOutputTrailingBytes(bytes)
  }

  private findCrossingSynchronizedOutputEnd = (bytes: Uint8Array): number => {
    const prefixLength = Math.min(SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY, bytes.byteLength)
    if (this.synchronizedOutputTrailingByteLength === 0 || prefixLength === 0) return -1

    const trailingLength = this.synchronizedOutputTrailingByteLength
    const candidate = this.synchronizedOutputBoundaryCandidate
    candidate.set(this.synchronizedOutputTrailingBytes.subarray(0, trailingLength), 0)
    candidate.set(bytes.subarray(0, prefixLength), trailingLength)
    const candidateLength = trailingLength + prefixLength
    const firstStartIndex = Math.max(0, trailingLength - SYNCHRONIZED_OUTPUT_END_BYTES.length + 1)
    const lastStartIndex = Math.min(
      trailingLength - 1,
      candidateLength - SYNCHRONIZED_OUTPUT_END_BYTES.length,
    )
    for (let startIndex = firstStartIndex; startIndex <= lastStartIndex; startIndex += 1) {
      if (this.matchesSynchronizedOutputEnd(candidate, startIndex)) {
        return startIndex + SYNCHRONIZED_OUTPUT_END_BYTES.length - trailingLength
      }
    }
    return -1
  }

  private matchesSynchronizedOutputEnd = (bytes: Uint8Array, startIndex: number): boolean => {
    for (
      let sequenceIndex = 0;
      sequenceIndex < SYNCHRONIZED_OUTPUT_END_BYTES.length;
      sequenceIndex += 1
    ) {
      if (bytes[startIndex + sequenceIndex] !== SYNCHRONIZED_OUTPUT_END_BYTES[sequenceIndex]) {
        return false
      }
    }
    return true
  }

  private updateSynchronizedOutputTrailingBytes = (bytes: Uint8Array) => {
    if (bytes.byteLength >= SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY) {
      this.synchronizedOutputTrailingBytes.set(
        bytes.subarray(bytes.byteLength - SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY),
      )
      this.synchronizedOutputTrailingByteLength = SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY
      return
    }

    const retainedLength = Math.min(
      this.synchronizedOutputTrailingByteLength,
      SYNCHRONIZED_OUTPUT_TRAILING_BYTE_CAPACITY - bytes.byteLength,
    )
    if (retainedLength > 0) {
      this.synchronizedOutputTrailingBytes.copyWithin(
        0,
        this.synchronizedOutputTrailingByteLength - retainedLength,
        this.synchronizedOutputTrailingByteLength,
      )
    }
    this.synchronizedOutputTrailingBytes.set(bytes, retainedLength)
    this.synchronizedOutputTrailingByteLength = retainedLength + bytes.byteLength
  }

  private enqueueWrite = (bytes: Uint8Array, endsSynchronizedOutput: boolean) => {
    if (bytes.byteLength === 0) return
    this.appendBytes(bytes)
    this.pendingWrites.push({
      bytes: this.buffer.subarray(0, this.byteLength).slice(),
      endsSynchronizedOutput,
    })
    if (endsSynchronizedOutput) this.pendingSynchronizedFrameCount += 1
    this.byteLength = 0
  }

  private hasPendingWrites = (): boolean => this.pendingWriteIndex < this.pendingWrites.length

  private dequeuePendingWrite = (): PendingTerminalWrite | null => {
    if (!this.hasPendingWrites()) return null
    const pendingWrite = this.pendingWrites[this.pendingWriteIndex]
    this.pendingWrites[this.pendingWriteIndex] = undefined
    this.pendingWriteIndex += 1
    if (pendingWrite?.endsSynchronizedOutput) this.pendingSynchronizedFrameCount -= 1

    if (this.pendingWriteIndex === this.pendingWrites.length) {
      this.pendingWrites = []
      this.pendingWriteIndex = 0
    } else if (
      this.pendingWriteIndex >= OUTPUT_PENDING_WRITE_COMPACTION_THRESHOLD_WRITES &&
      this.pendingWriteIndex >= this.pendingWrites.length - this.pendingWriteIndex
    ) {
      this.pendingWrites = this.pendingWrites.slice(this.pendingWriteIndex)
      this.pendingWriteIndex = 0
    }

    return pendingWrite ?? null
  }

  private dequeuePendingWritesThroughNewestSynchronizedFrame = (): PendingTerminalWrite | null => {
    const completedFrameWrites: PendingTerminalWrite[] = []
    let completedFrameByteLength = 0
    while (this.hasPendingWrites()) {
      const pendingWrite = this.dequeuePendingWrite()
      if (!pendingWrite) break
      completedFrameWrites.push(pendingWrite)
      completedFrameByteLength += pendingWrite.bytes.byteLength
      if (pendingWrite.endsSynchronizedOutput && this.pendingSynchronizedFrameCount === 0) break
    }
    if (completedFrameWrites.length === 0) return null
    if (completedFrameWrites.length === 1) return completedFrameWrites.at(0) ?? null

    const completedFrameBytes = new Uint8Array(completedFrameByteLength)
    let completedFrameByteOffset = 0
    for (const completedFrameWrite of completedFrameWrites) {
      completedFrameBytes.set(completedFrameWrite.bytes, completedFrameByteOffset)
      completedFrameByteOffset += completedFrameWrite.bytes.byteLength
    }
    const newestCompletedFrameWrite = completedFrameWrites[completedFrameWrites.length - 1]
    if (!newestCompletedFrameWrite) return null
    return {
      bytes: completedFrameBytes,
      endsSynchronizedOutput: newestCompletedFrameWrite.endsSynchronizedOutput,
    }
  }

  // Re-arm a no-op vsync commit after a flush so a run of frames keeps the
  // compositor's frame loop warm (a hidden-tab hibernation here would stall
  // the next frame ~100ms). The armed rAF's onKeepWarm finds the buffer empty
  // (already flushed), no-ops, and re-arms within OUTPUT_KEEP_WARM_MS. No-op
  // when output has lapsed past the window.
  private armKeepWarm = () => {
    if (this.keepWarmFrameId !== null) return
    if (performanceNow() - this.lastOutputAtMs >= OUTPUT_KEEP_WARM_MS) return
    this.keepWarmFrameId = requestAnimationFrame(this.onKeepWarm)
  }

  private cancelKeepWarm = () => {
    if (this.keepWarmFrameId === null) return
    cancelAnimationFrame(this.keepWarmFrameId)
    this.keepWarmFrameId = null
  }

  // A no-op rAF: carries no flush work (the flush is synchronous in pushBytes),
  // so it never runs a parse inside a vsync and can't clash with xterm's render
  // rAF. It only asserts needsBeginFrame so Chrome's compositor never
  // hibernates the frame loop between animation frames. Re-arm within
  // OUTPUT_KEEP_WARM_MS of the last output; let it lapse once output is idle so
  // a static terminal rests. Keep-warm is visible-only: a hidden tab renders
  // nothing and flushes synchronously in pushBytes, so there is no frame loop
  // to keep warm while hidden.
  private onKeepWarm = () => {
    if (this.isDispatching) return
    this.isDispatching = true
    try {
      this.keepWarmFrameId = null
      if (performanceNow() - this.lastOutputAtMs < OUTPUT_KEEP_WARM_MS) {
        this.keepWarmFrameId = requestAnimationFrame(this.onKeepWarm)
      }
    } finally {
      this.isDispatching = false
    }
  }

  // xterm mutates its live buffer while DEC 2026 suppresses rendering. Preserve
  // one completed successor so ordinary producer/browser phase overlap cannot
  // reintroduce skipped render opportunities. Once multiple completed successors
  // accumulate, the browser is genuinely behind: preempt the stale wait and hand
  // xterm every byte through the newest completion as one parse transaction.
  private preemptSynchronizedFrameWaitForCompletedBacklog = (): boolean => {
    if (
      !this.awaitingSynchronizedFrameRender ||
      this.pendingSynchronizedFrameCount < SYNCHRONIZED_OUTPUT_PREEMPTION_MINIMUM_COMPLETED_FRAMES
    ) {
      return false
    }
    this.cancelSynchronizedFrameWait()
    return true
  }

  private cancelSynchronizedFrameWait = () => {
    this.synchronizedFrameGeneration += 1
    this.awaitingSynchronizedFrameRender = false
    if (this.synchronizedFrameReleaseId === null) return
    cancelAnimationFrame(this.synchronizedFrameReleaseId)
    this.synchronizedFrameReleaseId = null
  }

  private waitForSynchronizedFrameRender = (terminal: XtermTerminal, generation: number) => {
    if (
      this.terminal !== terminal ||
      this.synchronizedFrameGeneration !== generation ||
      !this.awaitingSynchronizedFrameRender
    ) {
      return
    }
    if (isDocumentHidden()) {
      this.releaseSynchronizedFrame(terminal, generation)
      return
    }
    this.synchronizedFrameReleaseId = requestAnimationFrame(() => {
      this.releaseSynchronizedFrame(terminal, generation)
    })
  }

  private releaseSynchronizedFrame = (terminal: XtermTerminal, generation: number) => {
    if (
      this.terminal !== terminal ||
      this.synchronizedFrameGeneration !== generation ||
      !this.awaitingSynchronizedFrameRender
    ) {
      return
    }
    this.synchronizedFrameReleaseId = null
    this.awaitingSynchronizedFrameRender = false
    const didRenderImmediately = this.flushPending()
    if (!isDocumentHidden() && !didRenderImmediately) this.armKeepWarm()
  }

  private consumeSynchronizedFramePacingBypass = (endsSynchronizedOutput: boolean): boolean => {
    if (!endsSynchronizedOutput) return false
    const elapsedSinceInputMs = performanceNow() - this.synchronizedFramePacingBypassAtMs
    this.synchronizedFramePacingBypassAtMs = Number.NEGATIVE_INFINITY
    return elapsedSinceInputMs >= 0 && elapsedSinceInputMs <= INTERACTIVE_OUTPUT_RENDER_WINDOW_MS
  }

  private consumeInteractiveRender = (byteLength: number): boolean => {
    if (this.lastUserInputAtMs === Number.NEGATIVE_INFINITY) return false
    const elapsedSinceInputMs = performanceNow() - this.lastUserInputAtMs
    this.lastUserInputAtMs = Number.NEGATIVE_INFINITY
    return (
      this.interactiveRenderingEnabled &&
      !isDocumentHidden() &&
      byteLength <= INTERACTIVE_OUTPUT_RENDER_MAX_BYTES &&
      elapsedSinceInputMs >= 0 &&
      elapsedSinceInputMs <= INTERACTIVE_OUTPUT_RENDER_WINDOW_MS
    )
  }

  private flushInteractiveRender = (terminal: XtermTerminal) => {
    if (this.terminal !== terminal || !this.interactiveRenderingEnabled) return
    flushPendingInteractiveRender(terminal)
  }

  private flushPending = (
    bypassSynchronizedFramePacing = false,
    shouldCoalesceCompletedFrameBacklog = false,
  ): boolean => {
    const terminal = this.terminal
    if (
      !terminal ||
      !this.hasPendingWrites() ||
      (this.awaitingSynchronizedFrameRender && !bypassSynchronizedFramePacing)
    ) {
      return false
    }

    let didRenderImmediately = false
    while (
      this.hasPendingWrites() &&
      (!this.awaitingSynchronizedFrameRender || bypassSynchronizedFramePacing)
    ) {
      const pendingWrite = shouldCoalesceCompletedFrameBacklog
        ? this.dequeuePendingWritesThroughNewestSynchronizedFrame()
        : this.dequeuePendingWrite()
      shouldCoalesceCompletedFrameBacklog = false
      if (!pendingWrite) break
      const hasNewerCompletedSynchronizedFrame = this.pendingSynchronizedFrameCount > 0
      const shouldRenderImmediately =
        !hasNewerCompletedSynchronizedFrame &&
        this.consumeInteractiveRender(pendingWrite.bytes.byteLength)
      const shouldBypassSynchronizedFramePacing =
        !hasNewerCompletedSynchronizedFrame &&
        this.consumeSynchronizedFramePacingBypass(pendingWrite.endsSynchronizedOutput)
      const shouldPaceNextSynchronizedFrame =
        pendingWrite.endsSynchronizedOutput &&
        !hasNewerCompletedSynchronizedFrame &&
        !bypassSynchronizedFramePacing &&
        !isDocumentHidden() &&
        !shouldRenderImmediately &&
        !shouldBypassSynchronizedFramePacing
      let synchronizedFrameGeneration = 0
      if (shouldPaceNextSynchronizedFrame) {
        this.awaitingSynchronizedFrameRender = true
        synchronizedFrameGeneration = ++this.synchronizedFrameGeneration
      }
      const outputScrollController = this.outputScrollController
      const outputScrollSnapshot = outputScrollController?.capture()
      const afterWrite =
        outputScrollSnapshot || shouldRenderImmediately || shouldPaceNextSynchronizedFrame
          ? () => {
            if (outputScrollSnapshot) {
              outputScrollController?.restore(outputScrollSnapshot)
            }
            if (shouldRenderImmediately) this.flushInteractiveRender(terminal)
            if (shouldPaceNextSynchronizedFrame) {
              this.waitForSynchronizedFrameRender(terminal, synchronizedFrameGeneration)
            }
          }
          : undefined
      terminal.write(pendingWrite.bytes, afterWrite)
      this.afterFlush?.()
      didRenderImmediately ||= shouldRenderImmediately
    }
    return didRenderImmediately
  }
}
