import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileSaveCoordinator } from '../src/client/file-save-coordinator.ts'

function deferred() {
  let resolve = (_value: boolean): void => {}
  const promise = new Promise<boolean>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('FileSaveCoordinator', () => {
  it('debounces edits and confirms only the newest complete value', async () => {
    vi.useFakeTimers()
    const persist = vi.fn(async () => true)
    const onPendingChange = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange,
      onError: vi.fn(),
    })

    coordinator.saveNow()
    coordinator.change('first')
    await vi.advanceTimersByTimeAsync(300)
    coordinator.change('latest')
    await vi.advanceTimersByTimeAsync(499)
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(persist).toHaveBeenCalledOnce()
    expect(persist).toHaveBeenCalledWith('latest')
    expect(onPendingChange.mock.calls).toEqual([[true], [true], [false]])
    coordinator.dispose()
    expect(persist).toHaveBeenCalledOnce()
  })

  it('keeps one write in flight and saves a newer edit after its remaining debounce', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const persist = vi.fn<(value: string) => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(true)
    const onPendingChange = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange,
      onError: vi.fn(),
    })

    coordinator.change('first')
    await vi.advanceTimersByTimeAsync(500)
    coordinator.saveNow()
    coordinator.change('latest')
    await vi.advanceTimersByTimeAsync(500)
    expect(persist).toHaveBeenCalledOnce()
    first.resolve(true)
    await vi.runAllTimersAsync()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenLastCalledWith('latest')
    expect(onPendingChange.mock.calls.at(-1)).toEqual([false])
  })

  it('keeps failed work pending and reports thrown persistence errors', async () => {
    vi.useFakeTimers()
    const error = new Error('write failed')
    const onError = vi.fn()
    const onPendingChange = vi.fn()
    const coordinator = new FileSaveCoordinator({
      debounceMs: 1,
      persist: vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(error),
      onPendingChange,
      onError,
    })

    coordinator.change('refused')
    await vi.advanceTimersByTimeAsync(1)
    expect(onPendingChange).not.toHaveBeenCalledWith(false)
    coordinator.change('throws')
    await vi.advanceTimersByTimeAsync(1)
    expect(onError).toHaveBeenCalledWith(error)
    expect(onPendingChange).not.toHaveBeenCalledWith(false)
  })

  it('flushes the newest edit once when disposed during an older write', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const persist = vi.fn<(value: string) => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(true)
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onError: vi.fn(),
    })

    coordinator.change('first')
    coordinator.saveNow()
    coordinator.change('last')
    coordinator.dispose()
    first.resolve(false)
    await vi.runAllTimersAsync()
    expect(persist.mock.calls).toEqual([['first'], ['last']])
  })
})
