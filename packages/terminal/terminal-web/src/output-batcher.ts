/** Trailing low-latency batching for raw browser terminal output. */

import { Buffer } from 'node:buffer'

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
 * continuous stream. The first delivery starts in timer or caller context;
 * later asynchronous deliveries retain FIFO order.
 */
export class TerminalOutputBatcher {
  private readonly chunks: Buffer[] = []
  private byteLength = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private burstStartedAt: number | undefined
  private tail: Promise<void> = Promise.resolve()
  private stopped = false

  /**
   * @param config - validated batching limits.
   * @param deliver - ordered binary-frame sender.
   * @param fail - terminal connection failure owner.
   */
  constructor(
    private readonly config: TerminalOutputBatcherConfig,
    private readonly deliver: (bytes: Buffer) => Promise<void>,
    private readonly fail: (error: unknown) => void,
  ) {}

  /**
   * Retain one immutable PTY output buffer until the active burst flushes.
   * @param chunk - output buffer retained until delivery.
   */
  push(chunk: Buffer): void {
    if (this.stopped || chunk.byteLength === 0) return
    this.burstStartedAt ??= Date.now()
    this.chunks.push(chunk)
    this.byteLength += chunk.byteLength
    const burstAgeMs = Date.now() - this.burstStartedAt
    if (this.byteLength >= this.config.outputBatchBytes || burstAgeMs >= this.config.outputStreamThresholdMs) {
      this.flush()
      return
    }
    if (this.timer !== undefined) clearTimeout(this.timer)
    const delayMs = Math.min(
      this.config.outputBatchWindowMs,
      this.config.outputStreamThresholdMs - burstAgeMs,
    )
    this.timer = setTimeout(() => { this.timer = undefined; this.flush() }, delayMs)
    this.timer.unref()
  }

  /** Deliver all buffered bytes and preserve ordering with an in-flight send. */
  flush(): void {
    if (this.stopped || this.byteLength === 0) return
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    const bytes = Buffer.concat(this.chunks, this.byteLength)
    this.chunks.length = 0
    this.byteLength = 0
    this.burstStartedAt = undefined
    this.tail = this.tail.then(() => this.deliver(bytes))
      .catch((error: unknown) => { this.fail(error) })
  }

  /** Flush and await every accepted delivery before stopping. */
  async finish(): Promise<void> {
    this.flush()
    await this.tail
    this.stopped = true
  }

  /** Drop undelivered bytes and stop accepting output. */
  abort(): void {
    this.stopped = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.chunks.length = 0
    this.byteLength = 0
    this.burstStartedAt = undefined
  }
}
