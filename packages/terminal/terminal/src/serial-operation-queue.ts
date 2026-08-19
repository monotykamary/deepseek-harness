/** Synchronous-first serialization for latency-sensitive terminal operations. */

interface PendingOperation {
  readonly run: () => Promise<void>
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

/**
 * Runs the first accepted operation in the caller's task, then preserves FIFO
 * order across asynchronous providers. Failed operations reject only their own
 * caller and do not block later work.
 */
export class SerialOperationQueue {
  private readonly pending: PendingOperation[] = []
  private readonly idleWaiters = new Set<() => void>()
  private active = false

  /**
   * Accept one operation and start it immediately when the queue is idle.
   * @param run - operation whose returned promise marks its settlement.
   * @returns a promise carrying that operation's outcome.
   */
  enqueue(run: () => Promise<void>): Promise<void> {
    const result = Promise.withResolvers<void>()
    this.pending.push({ run, resolve: result.resolve, reject: result.reject })
    this.drain()
    return result.promise
  }

  /**
   * Wait until every operation accepted before settlement has completed.
   * @returns a promise that resolves at quiescence regardless of operation failures.
   */
  idle(): Promise<void> {
    if (!this.active && this.pending.length === 0) return Promise.resolve()
    const result = Promise.withResolvers<void>()
    this.idleWaiters.add(result.resolve)
    return result.promise
  }

  private drain(): void {
    if (this.active) return
    const operation = this.pending.shift()
    if (operation === undefined) {
      for (const resolve of this.idleWaiters) resolve()
      this.idleWaiters.clear()
      return
    }
    this.active = true
    let running: Promise<void>
    try {
      running = operation.run()
    } catch (error: unknown) {
      operation.reject(error)
      this.active = false
      this.drain()
      return
    }
    void running.then(operation.resolve, operation.reject).then(() => {
      this.active = false
      this.drain()
    })
  }
}
