/**
 * Trailing low-latency batching for raw browser terminal output.
 * Adapted from localterm revision 8de7394; MIT license in THIRD_PARTY_NOTICES.md.
 */

import { Buffer } from 'node:buffer'

/** Atomic transport-frame boundary sent around a redraw split across binary chunks. */
export type TerminalAtomicOutputFrameBoundary = 'output-frame-start' | 'output-frame-end'

/** Timing and size limits consumed by {@link TerminalOutputBatcher}. */
export interface TerminalOutputBatcherConfig {
  /** Bytes that force an immediate delivery. */
  readonly outputBatchBytes: number
  /** Idle milliseconds after the latest chunk before delivery. */
  readonly outputBatchWindowMs: number
  /** Maximum milliseconds a continuous partial burst can remain buffered. */
  readonly outputStreamThresholdMs: number
}

/**
 * Coalesces kernel PTY fragments at a trailing idle edge while bounding a
 * continuous stream. A redraw that crosses the byte cap is bracketed by
 * ordered atomic-frame controls, so browser clients can commit the redraw in
 * one xterm write; a sustained stream crosses the duration bound and returns
 * to progressive delivery. The first delivery starts in timer or caller
 * context; later deliveries retain FIFO order through one promise tail.
 */
export class TerminalOutputBatcher {
  private readonly chunks: Buffer[] = []
  private byteLength = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private burstStartedAt: number | undefined
  private burstIsStream = false
  private atomicFrameOpen = false
  private tail: Promise<void> = Promise.resolve()
  private stopped = false

  /**
   * @param config - validated batching limits.
   * @param deliver - ordered binary-frame sender.
   * @param fail - terminal connection failure owner.
   * @param onAtomicFrameBoundary - ordered control-frame sender.
   */
  constructor(
    private readonly config: TerminalOutputBatcherConfig,
    private readonly deliver: (bytes: Buffer) => Promise<void>,
    private readonly fail: (error: unknown) => void,
    private readonly onAtomicFrameBoundary: (
      boundary: TerminalAtomicOutputFrameBoundary,
    ) => Promise<void> = () => Promise.resolve(),
  ) {}

  /**
   * Retain one immutable PTY output buffer until the active burst flushes.
   * @param chunk - output buffer retained until delivery.
   */
  push(chunk: Buffer): void {
    if (this.stopped || chunk.byteLength === 0) return
    const pushedAt = Date.now()
    const burstStartedAt = this.burstStartedAt ?? pushedAt
    this.burstStartedAt = burstStartedAt
    this.chunks.push(chunk)
    this.byteLength += chunk.byteLength
    const burstAgeMs = pushedAt - burstStartedAt
    if (burstAgeMs >= this.config.outputStreamThresholdMs) this.burstIsStream = true

    if (this.byteLength >= this.config.outputBatchBytes || this.burstIsStream) {
      if (!this.burstIsStream && this.byteLength >= this.config.outputBatchBytes) {
        this.openAtomicFrame()
      }
      this.flushBytes()
      if (this.burstIsStream) {
        this.clearTimer()
        this.closeAtomicFrame()
        this.resetBurst()
        return
      }
      this.scheduleCloseTimer()
      return
    }

    this.clearTimer()
    const delayMs = Math.min(
      this.config.outputBatchWindowMs,
      this.config.outputStreamThresholdMs - burstAgeMs,
    )
    this.timer = setTimeout(() => { this.timer = undefined; this.flush() }, delayMs)
    this.timer.unref()
  }

  /** Deliver buffered bytes, close an open atomic frame, and end the current burst. */
  flush(): void {
    if (this.stopped) return
    this.clearTimer()
    this.flushBytes()
    this.closeAtomicFrame()
    this.resetBurst()
  }

  /** Flush and await every accepted delivery and frame boundary before stopping. */
  async finish(): Promise<void> {
    this.flush()
    await this.tail
    this.stopped = true
  }

  /** Drop undelivered bytes and stop accepting output without sending a frame end. */
  abort(): void {
    this.stopped = true
    this.clearTimer()
    this.chunks.length = 0
    this.byteLength = 0
    this.resetBurst()
    this.atomicFrameOpen = false
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private scheduleCloseTimer(): void {
    this.clearTimer()
    this.timer = setTimeout(() => { this.timer = undefined; this.flush() }, this.config.outputBatchWindowMs)
    this.timer.unref()
  }

  private flushBytes(): void {
    if (this.byteLength === 0) return
    const bytes = Buffer.concat(this.chunks, this.byteLength)
    this.chunks.length = 0
    this.byteLength = 0
    this.enqueue(() => this.deliver(bytes))
  }

  private openAtomicFrame(): void {
    if (this.atomicFrameOpen) return
    this.atomicFrameOpen = true
    this.enqueue(() => this.onAtomicFrameBoundary('output-frame-start'))
  }

  private closeAtomicFrame(): void {
    if (!this.atomicFrameOpen) return
    this.atomicFrameOpen = false
    this.enqueue(() => this.onAtomicFrameBoundary('output-frame-end'))
  }

  private resetBurst(): void {
    this.burstStartedAt = undefined
    this.burstIsStream = false
  }

  private enqueue(operation: () => Promise<void>): void {
    this.tail = this.tail.then(operation)
      .catch((error: unknown) => { this.fail(error) })
  }
}
