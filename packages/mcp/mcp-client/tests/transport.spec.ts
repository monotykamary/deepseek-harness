/**
 * Unit tests for the stdio send serializer: one backpressure wait in
 * flight at a time, preserved wire order, rejection isolation, and
 * argument pass-through.
 * @module
 */
import { describe, expect, it } from 'vitest'
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js'

import { serializeSends } from '../src/transport.ts'

/** A JSON-RPC-shaped message stand-in; the serializer never inspects it. */
function msg(id: number): { jsonrpc: '2.0'; id: number; method: string } {
  return { jsonrpc: '2.0', id, method: 'ping' }
}

interface BackpressuredFake {
  readonly transport: Transport
  /** Settle the oldest in-flight send successfully. */
  settle(): void
  /** Settle the oldest in-flight send with the given error. */
  break(error: Error): void
  readonly arrivals: number[]
  peakInFlight(): number
}

/**
 * A transport whose send blocks until settled, recording concurrency and
 * arrival order so the assertions observe real interleaving rather than
 * promise-scheduling accidents.
 */
function backpressuredFake(): BackpressuredFake {
  const arrivals: number[] = []
  const gates: PromiseWithResolvers<boolean>[] = []
  let inFlight = 0
  let peak = 0
  const transport = {
    start: () => Promise.resolve(),
    close: () => Promise.resolve(),
    onclose: undefined,
    onerror: undefined,
    send(message: unknown): Promise<void> {
      const id = (message as { id: number }).id
      const gate = Promise.withResolvers<boolean>()
      gates.push(gate)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      return gate.promise.then(() => {
        inFlight -= 1
        arrivals.push(id)
      })
    },
  } as unknown as Transport
  return {
    transport,
    arrivals,
    settle: () => { gates.shift()?.resolve(true) },
    break: (error) => { gates.shift()?.reject(error) },
    peakInFlight: () => peak,
  }
}

/** Let every queued microtask hop (serializer chain links) complete. */
function flush(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve) })
}

describe('serializeSends', () => {
  it('keeps at most one send waiting on the transport while backpressured', async () => {
    const fake = backpressuredFake()
    const guarded = serializeSends(fake.transport)
    const pending = Array.from({ length: 15 }, (_, index) => guarded.send(msg(index + 1)))
    await flush()
    expect(fake.peakInFlight()).toBe(1)
    for (let index = 0; index < 15; index += 1) {
      fake.settle()
      await flush()
    }
    await Promise.all(pending)
    expect(fake.peakInFlight()).toBe(1)
  })

  it('delivers messages in submission order', async () => {
    const fake = backpressuredFake()
    const guarded = serializeSends(fake.transport)
    const ids = Array.from({ length: 12 }, (_, index) => index + 1)
    const pending = ids.map(id => guarded.send(msg(id)))
    await flush()
    for (let index = 0; index < ids.length; index += 1) {
      fake.settle()
      await flush()
    }
    await Promise.all(pending)
    expect(fake.arrivals).toEqual(ids)
  })

  it('settles a rejected send at its own caller without stalling the queue', async () => {
    const fake = backpressuredFake()
    const guarded = serializeSends(fake.transport)
    const failing = guarded.send(msg(1))
    void guarded.send(msg(2))
    await flush()
    fake.break(new Error('pipe broke'))
    await expect(failing).rejects.toThrow('pipe broke')
    await flush()
    fake.settle()
    const third = guarded.send(msg(3))
    await flush()
    fake.settle()
    await third
    expect(fake.arrivals).toEqual([2, 3])
  })

  it('forwards the message and call options to the underlying transport', async () => {
    const seen: { message: unknown; options: unknown }[] = []
    const options: TransportSendOptions = { relatedRequestId: 99 }
    const raw = {
      start: () => Promise.resolve(),
      close: () => Promise.resolve(),
      onclose: undefined,
      onerror: undefined,
      send: (message: unknown, passed?: unknown) => {
        seen.push({ message, options: passed })
        return Promise.resolve()
      },
    } as unknown as Transport
    const guarded = serializeSends(raw)
    await guarded.send(msg(7), options)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.message).toEqual(msg(7))
    expect(seen[0]?.options).toBe(options)
  })
})
