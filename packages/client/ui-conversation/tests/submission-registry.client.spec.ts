import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@monotykamary/dsh-client-runtime/client'
import type { ComposerSubmissionMiddleware } from '../src/client/input/submissions.ts'
import { ComposerSubmissionRegistry } from '../src/client/input/submissions.ts'

const request = {
  sessionId: 'session:one' as SessionId,
  text: 'Inspect the workspace',
  images: [],
  mode: 'queue' as const,
  signal: new AbortController().signal,
}

describe('ComposerSubmissionRegistry', () => {
  it('wraps the Host sink by order while preserving same-order registration order', async () => {
    const registry = new ComposerSubmissionRegistry()
    const calls: string[] = []
    registry.register({ order: 10, async submit(_request, next) { calls.push('later:before'); const result = await next(); calls.push('later:after'); return result } })
    registry.register({ order: -5, async submit(_request, next) { calls.push('first:before'); const result = await next(); calls.push('first:after'); return result } })
    registry.register({ order: 10, async submit(_request, next) { calls.push('last:before'); const result = await next(); calls.push('last:after'); return result } })

    await expect(registry.dispatch(request, () => { calls.push('sink'); return Promise.resolve({ kind: 'success' }) })).resolves.toEqual({ kind: 'success' })
    expect(calls).toEqual(['first:before', 'later:before', 'last:before', 'sink', 'last:after', 'later:after', 'first:after'])
  })

  it('allows a middleware to consume submission without reaching the Host', async () => {
    const registry = new ComposerSubmissionRegistry()
    const sink = vi.fn(() => Promise.resolve({ kind: 'success' as const }))
    registry.register({ submit: () => Promise.resolve({ kind: 'error', text: 'consumed' }) })

    await expect(registry.dispatch(request, sink)).resolves.toEqual({ kind: 'error', text: 'consumed' })
    expect(sink).not.toHaveBeenCalled()
  })

  it('removes registrations through their disposer', async () => {
    const registry = new ComposerSubmissionRegistry()
    const middleware = vi.fn<ComposerSubmissionMiddleware['submit']>(async (_request, next) => next())
    const dispose = registry.register({ submit: middleware })
    dispose()

    await registry.dispatch(request, () => Promise.resolve({ kind: 'success' }))
    expect(middleware).not.toHaveBeenCalled()
  })

  it('rejects a middleware that continues the same submission twice', async () => {
    const registry = new ComposerSubmissionRegistry()
    registry.register({
      async submit(_request, next) {
        await next()
        return next()
      },
    })

    await expect(registry.dispatch(request, () => Promise.resolve({ kind: 'success' }))).rejects.toThrow(/more than once/u)
  })
})
