import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalOutputBatcher } from '../src/output-batcher.ts'

afterEach(() => { vi.useRealTimers() })

describe('TerminalOutputBatcher', () => {
  it('resets the two-millisecond idle window after every kernel fragment', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const delivered: Buffer[] = []
    const batcher = new TerminalOutputBatcher(
      { outputBatchBytes: 64 * 1024, outputBatchWindowMs: 2, outputStreamThresholdMs: 100 },
      async (bytes) => { delivered.push(bytes) },
      vi.fn(),
    )

    batcher.push(Buffer.from('a'))
    await vi.advanceTimersByTimeAsync(1)
    batcher.push(Buffer.from('b'))
    await vi.advanceTimersByTimeAsync(1)
    expect(delivered).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(delivered.map(bytes => bytes.toString())).toEqual(['ab'])
  })

  it('drops an aborted partial batch and ignores empty or stopped input', async () => {
    vi.useFakeTimers()
    const deliver = vi.fn<(bytes: Buffer) => Promise<undefined>>(async () => undefined)
    const batcher = new TerminalOutputBatcher(
      { outputBatchBytes: 64, outputBatchWindowMs: 2, outputStreamThresholdMs: 100 },
      deliver,
      vi.fn(),
    )

    batcher.push(Buffer.alloc(0))
    batcher.push(Buffer.from('pending'))
    batcher.abort()
    batcher.push(Buffer.from('ignored'))
    batcher.flush()
    await vi.runAllTimersAsync()
    await batcher.finish()
    expect(deliver).not.toHaveBeenCalled()
  })

  it('clears an idle timer on a size flush and reports delivery failure', async () => {
    vi.useFakeTimers()
    const fail = vi.fn()
    const batcher = new TerminalOutputBatcher(
      { outputBatchBytes: 4, outputBatchWindowMs: 2, outputStreamThresholdMs: 100 },
      async () => { throw new Error('send failed') },
      fail,
    )

    batcher.push(Buffer.from('a'))
    batcher.push(Buffer.from('bcd'))
    await batcher.finish()
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'send failed' }))
    const idle = new TerminalOutputBatcher(
      { outputBatchBytes: 4, outputBatchWindowMs: 2, outputStreamThresholdMs: 100 },
      async () => {},
      fail,
    )
    idle.abort()
  })

  it('bounds a continuous partial burst and preserves asynchronous delivery order', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = Promise.withResolvers<undefined>()
    const delivered: string[] = []
    const batcher = new TerminalOutputBatcher(
      { outputBatchBytes: 64, outputBatchWindowMs: 10, outputStreamThresholdMs: 25 },
      async (bytes) => {
        delivered.push(bytes.toString())
        if (delivered.length === 1) await first.promise
      },
      vi.fn(),
    )

    batcher.push(Buffer.from('a'))
    await vi.advanceTimersByTimeAsync(9)
    batcher.push(Buffer.from('b'))
    await vi.advanceTimersByTimeAsync(9)
    batcher.push(Buffer.from('c'))
    await vi.advanceTimersByTimeAsync(7)
    batcher.push(Buffer.alloc(64, 'd'))
    expect(delivered).toEqual(['abc'])
    first.resolve(undefined)
    await batcher.finish()
    expect(delivered).toEqual(['abc', 'd'.repeat(64)])
  })
})
