import type { CallId } from '@monotykamary/dsh-llm'
import { stableJsonHash } from './key.js'
import type { ToolDefinition, ToolRunContext } from '../index.js'
import type { ToolSpeculationConfig, ToolSpeculationResult, ToolSpeculationStats } from './types.js'

/** Unforgeable identity shared only by one streamed root and its natural nested dispatches. */
export type ToolSpeculationOwner = symbol

interface SpeculationEntry {
  readonly owner: ToolSpeculationOwner
  readonly rootCallId: CallId
  readonly name: string
  readonly arguments: Record<string, unknown>
  readonly definition: ToolDefinition
  readonly birthEpoch: number
  readonly controller: AbortController
  promise: Promise<ToolSpeculationResult | undefined>
  timer: ReturnType<typeof setTimeout> | undefined
  retainedBytes: number
  active: boolean
  failed: boolean
  settled: boolean
}

/** Take-once cache lookup result and the conservative reason for every miss. */
export type ToolSpeculationServeResult =
  | { hit: true; value: unknown }
  | { hit: false; reason: 'absent' | 'epoch' | 'freshness' | 'definition' | 'failed' }

/** Bounded, owner-scoped, take-once cache for hidden calls launched from streamed programs. */
export class ToolSpeculationStore {
  private readonly epochs = new Map<ToolSpeculationOwner, number>()
  private readonly entries = new Map<ToolSpeculationOwner, Map<string, SpeculationEntry>>()
  private readonly liveEntries = new Set<SpeculationEntry>()
  private readonly inFlight = new Set<SpeculationEntry>()
  private retainedBytes = 0
  private readonly counters: ToolSpeculationStats = {
    launched: 0,
    served: 0,
    epochInvalidated: 0,
    freshnessInvalidated: 0,
    definitionInvalidated: 0,
    failed: 0,
    wasted: 0,
    skipped: 0,
  }

  constructor(private config: ToolSpeculationConfig) {}

  /**
   * Invalidate all work before installing a new bounded-cache policy.
   * @param config - the complete validated speculation policy.
   */
  reconfigure(config: ToolSpeculationConfig): void {
    this.reset('tool speculation settings changed')
    this.config = config
  }

  /**
   * Read one root owner's current mutation epoch.
   * @param owner - the unforgeable streamed-root identity.
   * @returns the current epoch, starting at zero.
   */
  epoch(owner: ToolSpeculationOwner): number {
    return this.epochs.get(owner) ?? 0
  }

  /**
   * Snapshot lifetime outcomes and current bounded-cache pressure.
   * @returns detached counters, pending work, concurrency, and retained bytes.
   */
  stats(): ToolSpeculationStats & { pending: number; inFlight: number; retainedBytes: number } {
    let pending = 0
    for (const ownerEntries of this.entries.values()) pending += ownerEntries.size
    return { ...this.counters, pending, inFlight: this.inFlight.size, retainedBytes: this.retainedBytes }
  }

  /**
   * Invalidate observations born before one owner's latest mutation.
   * @param owner - the streamed-root identity whose epoch advances.
   */
  bumpEpoch(owner: ToolSpeculationOwner): void {
    this.epochs.set(owner, this.epoch(owner) + 1)
  }

  /**
   * Admit one bounded hidden acquisition if capacity and deduplication permit it.
   * @param input - owner, canonical call identity, snapshotted definition, and acquisition callbacks.
   * @returns whether a new cache entry was launched.
   */
  launch(input: {
    owner: ToolSpeculationOwner
    rootCallId: CallId
    name: string
    arguments: Record<string, unknown>
    definition: ToolDefinition
    execute(signal: AbortSignal): Promise<ToolSpeculationResult>
    validate(result: ToolSpeculationResult): ToolSpeculationResult
  }): boolean {
    if (this.pendingCount() >= this.config.maxEntries || this.inFlight.size >= this.config.maxConcurrent) {
      this.counters.skipped += 1
      return false
    }
    const ownerEntries = this.entries.get(input.owner) ?? new Map<string, SpeculationEntry>()
    const key = ToolSpeculationStore.key(input.name, input.arguments)
    if (ownerEntries.has(key)) {
      this.counters.skipped += 1
      return false
    }

    const controller = new AbortController()
    const entry = {} as SpeculationEntry
    Object.assign(entry, {
      owner: input.owner,
      rootCallId: input.rootCallId,
      name: input.name,
      arguments: input.arguments,
      definition: input.definition,
      birthEpoch: this.epoch(input.owner),
      controller,
      timer: undefined,
      retainedBytes: 0,
      active: true,
      failed: false,
      settled: false,
    } satisfies Omit<SpeculationEntry, 'promise'>)
    entry.promise = Promise.resolve()
      .then(() => input.execute(controller.signal))
      .then((result) => {
        if (!entry.active || controller.signal.aborted) return undefined
        const validated = input.validate(result)
        const bytes = retainedJsonBytes(validated.value)
        if (bytes > this.config.maxRetainedBytes - this.retainedBytes) {
          entry.failed = true
          return undefined
        }
        entry.retainedBytes = bytes
        this.retainedBytes += bytes
        return validated
      })
      .catch(() => {
        entry.failed = true
        return undefined
      })
      .finally(() => {
        entry.settled = true
        this.inFlight.delete(entry)
        if (entry.failed && entry.active) {
          this.counters.failed += 1
          this.discard(entry)
        }
      })

    ownerEntries.set(key, entry)
    this.entries.set(input.owner, ownerEntries)
    this.liveEntries.add(entry)
    this.inFlight.add(entry)
    entry.timer = setTimeout(() => {
      if (!entry.active) return
      this.discard(entry, 'speculation entry expired')
      this.counters.wasted += 1
    }, this.config.entryTtlMs)
    entry.timer.unref()
    this.counters.launched += 1
    return true
  }

  /**
   * Take one matching entry, revalidate it at the natural dispatch point, and replay deferred observations.
   * @param owner - the streamed-root identity authorized to consume the entry.
   * @param name - the authoritative tool name.
   * @param argumentsValue - the authoritative parsed arguments.
   * @param definition - the currently registered tool definition.
   * @param exec - the natural tool execution context used for cancellation and replay.
   * @returns a hit value or a conservative miss reason.
   */
  async tryServe(
    owner: ToolSpeculationOwner,
    name: string,
    argumentsValue: Record<string, unknown>,
    definition: ToolDefinition,
    exec: ToolRunContext,
  ): Promise<ToolSpeculationServeResult> {
    const ownerEntries = this.entries.get(owner)
    if (ownerEntries === undefined) return { hit: false, reason: 'absent' }
    const key = ToolSpeculationStore.key(name, argumentsValue)
    const entry = ownerEntries.get(key)
    if (entry === undefined || entry.owner !== owner) return { hit: false, reason: 'absent' }
    ownerEntries.delete(key)
    if (ownerEntries.size === 0) this.entries.delete(owner)
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entry.timer = undefined

    if (entry.definition !== definition) {
      this.counters.definitionInvalidated += 1
      this.discard(entry, 'tool definition changed')
      return { hit: false, reason: 'definition' }
    }
    if (entry.birthEpoch !== this.epoch(owner)) {
      this.counters.epochInvalidated += 1
      this.discard(entry, 'mutation epoch advanced')
      return { hit: false, reason: 'epoch' }
    }

    const abort = (): void => { entry.controller.abort(exec.signal.reason) }
    if (exec.signal.aborted) abort()
    else exec.signal.addEventListener('abort', abort, { once: true })
    const result = await entry.promise.finally(() => { exec.signal.removeEventListener('abort', abort) })
    if (!entry.active || entry.failed || result === undefined || exec.signal.aborted) {
      if (!entry.failed) this.counters.failed += 1
      this.discard(entry)
      return { hit: false, reason: 'failed' }
    }
    if (entry.birthEpoch !== this.epoch(owner)) {
      this.counters.epochInvalidated += 1
      this.discard(entry)
      return { hit: false, reason: 'epoch' }
    }
    if (result.isFresh !== undefined) {
      let fresh = false
      try {
        fresh = await result.isFresh(exec)
      } catch {
        fresh = false
      }
      if (!fresh) {
        this.counters.freshnessInvalidated += 1
        this.discard(entry)
        return { hit: false, reason: 'freshness' }
      }
    }
    if (!this.canServe(entry, exec.signal)) {
      this.counters.failed += 1
      this.discard(entry)
      return { hit: false, reason: 'failed' }
    }
    try {
      await result.replay?.(exec)
    } catch {
      this.counters.failed += 1
      this.discard(entry)
      return { hit: false, reason: 'failed' }
    }
    this.counters.served += 1
    this.discard(entry)
    return { hit: true, value: result.value }
  }

  /**
   * Abort and discard every entry owned by a completed root call.
   * @param owner - the streamed-root identity to retire.
   */
  cancelRoot(owner: ToolSpeculationOwner): void {
    for (const entry of [...this.liveEntries]) {
      if (entry.owner !== owner) continue
      this.discard(entry, 'owning run_code call ended')
      this.counters.wasted += 1
    }
    this.entries.delete(owner)
    this.epochs.delete(owner)
  }

  /**
   * Abort and discard all owners and entries.
   * @param reason - the cancellation reason delivered to active acquisitions.
   */
  reset(reason = 'tool runtime disposed'): void {
    for (const entry of [...this.liveEntries]) {
      this.discard(entry, reason)
      this.counters.wasted += 1
    }
    this.entries.clear()
    this.epochs.clear()
  }

  private static key(name: string, argumentsValue: Record<string, unknown>): string {
    return `${name}\n${stableJsonHash(argumentsValue)}`
  }

  private pendingCount(): number {
    let count = 0
    for (const ownerEntries of this.entries.values()) count += ownerEntries.size
    return count
  }

  private canServe(entry: SpeculationEntry, signal: AbortSignal): boolean {
    return entry.active && !signal.aborted
  }

  private discard(entry: SpeculationEntry, reason?: string): void {
    if (!entry.active) return
    entry.active = false
    if (reason !== undefined) entry.controller.abort(reason)
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entry.timer = undefined
    const ownerEntries = this.entries.get(entry.owner)
    if (ownerEntries !== undefined) {
      ownerEntries.delete(ToolSpeculationStore.key(entry.name, entry.arguments))
      if (ownerEntries.size === 0) this.entries.delete(entry.owner)
    }
    this.liveEntries.delete(entry)
    if (entry.retainedBytes > 0) {
      this.retainedBytes -= entry.retainedBytes
      entry.retainedBytes = 0
    }
  }
}

function retainedJsonBytes(value: unknown): number {
  const encoded: unknown = JSON.stringify(value)
  if (typeof encoded !== 'string') throw new TypeError('speculative result must be lossless JSON')
  return Buffer.byteLength(encoded, 'utf8')
}
