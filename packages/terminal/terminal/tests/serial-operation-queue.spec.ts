import { describe, expect, it, vi } from 'vitest'
import { SerialOperationQueue } from '../src/serial-operation-queue.ts'

describe('SerialOperationQueue', () => {
  it('starts idle work synchronously and serializes successors through failures', async () => {
    const queue = new SerialOperationQueue()
    const firstGate = Promise.withResolvers<undefined>()
    const events: string[] = []

    const first = queue.enqueue(async () => {
      events.push('first:start')
      await firstGate.promise
      events.push('first:end')
    })
    const second = queue.enqueue(async () => {
      events.push('second')
      throw new Error('second failed')
    })
    const third = queue.enqueue(async () => { events.push('third') })

    expect(events).toEqual(['first:start'])
    const idle = vi.fn()
    void queue.idle().then(idle)
    firstGate.resolve(undefined)
    await first
    await expect(second).rejects.toThrow('second failed')
    await third
    await queue.idle()
    expect(events).toEqual(['first:start', 'first:end', 'second', 'third'])
    expect(idle).toHaveBeenCalledOnce()
  })

  it('turns a synchronous operation throw into its result rejection', async () => {
    const queue = new SerialOperationQueue()
    const failure = queue.enqueue(() => { throw new Error('synchronous failure') })
    await expect(failure).rejects.toThrow('synchronous failure')
    await expect(queue.idle()).resolves.toBeUndefined()
  })
})
