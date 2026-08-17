/** Browser RPC caller: operator-token attachment and the 401 login redirect. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebConnectionRpc } from '../src/client/rpc.ts'

interface MemoryStorage {
  getItem(key: string): string | null
}

const storage = (value: string | null): MemoryStorage => ({
  getItem: (key: string) => key === 'dsh.operatorToken' ? value : null,
})

function stubFetch(status: number): {
  fn: ReturnType<typeof vi.fn>
  lastInit: () => RequestInit | undefined
} {
  const calls: RequestInit[] = []
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push(init ?? {})
    if (status !== 200) return new Response('gate', { status })
    const body = typeof init?.body === 'string' ? init.body : ''
    const request = JSON.parse(body) as { rpcId: string }
    return new Response(JSON.stringify({
      type: 'server-response',
      rpcId: request.rpcId,
      result: { ok: true, value: { items: [] } },
    }), { status })
  })
  return { fn, lastInit: () => calls.at(-1) }
}

describe('web connection rpc caller identity support', () => {
  const originalFetch = globalThis.fetch
  const originalLocation = (globalThis as { location?: unknown }).location
  const originalStorage = (globalThis as { localStorage?: unknown }).localStorage

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
    ;(globalThis as { location?: unknown }).location = originalLocation
    ;(globalThis as { localStorage?: unknown }).localStorage = originalStorage
  })

  it('attaches the stored operator token as a bearer header', async () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = storage('op-token')
    const { fn, lastInit } = stubFetch(200)
    globalThis.fetch = fn as typeof fetch
    const rpc = createWebConnectionRpc()
    const result = await rpc.call('/api', 'session.list', {})
    expect(result).toEqual({ ok: true, value: { items: [] } })
    expect(lastInit()?.headers).toMatchObject({ authorization: 'Bearer op-token' })
    const init = (fn.mock.calls[0] as [string, RequestInit] | undefined)?.[1]
    const body = typeof init?.body === 'string' ? init.body : ''
    const sent = JSON.parse(body) as { method: string; payload: unknown }
    expect(sent).toMatchObject({ method: 'session.list', payload: {} })
  })

  it('omits the authorization header without a stored token', async () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = storage(null)
    const { fn, lastInit } = stubFetch(200)
    globalThis.fetch = fn as typeof fetch
    const rpc = createWebConnectionRpc()
    await rpc.call('/api', 'session.list', {})
    expect(lastInit()?.headers).not.toHaveProperty('authorization')
  })

  it('redirects to the passkey login page on HTTP 401 and still throws', async () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = storage(null)
    const replaced: string[] = []
    ;(globalThis as { location?: unknown }).location = { replace: (url: string) => { replaced.push(url) } }
    const { fn } = stubFetch(401)
    globalThis.fetch = fn as typeof fetch
    const rpc = createWebConnectionRpc()
    await expect(rpc.call('/api', 'session.list', {})).rejects.toThrow(/HTTP 401/)
    expect(replaced).toEqual(['/auth/passkey/login'])
  })

  it('survives 401 without a browser location (no redirect, still throws)', async () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = storage(null)
    ;(globalThis as { location?: unknown }).location = undefined
    const { fn } = stubFetch(401)
    globalThis.fetch = fn as typeof fetch
    const rpc = createWebConnectionRpc()
    await expect(rpc.call('/api', 'session.list', {})).rejects.toThrow(/HTTP 401/)
  })
})
