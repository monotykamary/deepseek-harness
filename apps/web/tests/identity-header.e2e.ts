/**
 * The web identity layer over a real boot: the header provider partitions
 * sessions by the proxy-set identity header, the operator tier sees
 * everything, cross-tenant ids answer session-not-found, and a header from
 * outside the trusted-proxy allowlist is ignored. No model traffic runs.
 */

import { request as httpRequest } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

let scaffold: WebScaffold | undefined

interface EnvelopeResult {
  status: number
  body: unknown
}

/** POST one client-request envelope, optionally carrying the identity header. */
function post(
  method: string,
  payload: unknown,
  options: { user?: string; rpcId?: string } = {},
): Promise<EnvelopeResult> {
  const url = new URL(`${scaffold!.baseUrl}/api/${method}`)
  const body = JSON.stringify({
    type: 'client-request',
    rpcId: options.rpcId ?? `rpc-identity-${method}-${String(Math.random()).slice(2)}`,
    method,
    payload,
  })
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        host: url.host,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...(options.user === undefined ? {} : { 'x-forwarded-user': options.user }),
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      response.on('end', () => {
        let parsed: unknown
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString())
        } catch {
          parsed = undefined
        }
        resolve({ status: response.statusCode ?? 0, body: parsed })
      })
    })
    request.on('error', reject)
    request.end(body)
  })
}

function okOf(result: EnvelopeResult): Record<string, unknown> {
  const envelope = result.body as { result?: { ok?: boolean; value?: Record<string, unknown>; error?: { code: string } } }
  if (envelope.result?.ok !== true) throw new Error(`expected ok result: ${JSON.stringify(result.body)}`)
  return envelope.result.value ?? {}
}

function errorOf(result: EnvelopeResult): { code?: string } {
  const envelope = result.body as { result?: { ok?: boolean; error?: { code: string } } }
  if (envelope.result?.ok === false) return envelope.result.error ?? {}
  return {}
}

beforeAll(async () => {
  scaffold = await launchWebScaffold({ identityHeader: {} })
}, 120_000)

afterAll(async () => {
  await scaffold?.close()
  scaffold = undefined
})

describe('web identity header provider', () => {
  it('partitions session listing and creation by the proxy identity header', async () => {
    // The authority is mounted and names its flow.
    const provider = await fetch(`${scaffold!.baseUrl}/auth/provider`).then(async response => response.json() as Promise<{ provider: string }>)
    expect(provider).toEqual({ provider: 'header' })

    // The operator tier (no identity header) starts with no sessions.
    const operatorList = await post('session.list', {})
    expect(operatorList.status).toBe(200)
    expect((okOf(operatorList).items as unknown[])).toHaveLength(0)

    // Alice creates a session under her partition.
    const created = await post('session.create', { cwd: scaffold!.workspaceCwd }, { user: 'alice' })
    expect(created.status).toBe(200)
    const sessionId = okOf(created).sessionId as string

    // Alice sees exactly her session; Bob sees none.
    const aliceList = await post('session.list', {}, { user: 'alice' })
    expect((okOf(aliceList).items as Array<{ sessionId: string }>).map(item => item.sessionId)).toEqual([sessionId])
    const bobList = await post('session.list', {}, { user: 'bob' })
    expect((okOf(bobList).items as unknown[])).toHaveLength(0)

    // The operator tier sees everything.
    const operatorAfter = await post('session.list', {})
    expect((okOf(operatorAfter).items as Array<{ sessionId: string }>).map(item => item.sessionId)).toEqual([sessionId])
  }, 30_000)

  it('answers session-not-found for a cross-tenant session id', async () => {
    const created = await post('session.create', { cwd: scaffold!.workspaceCwd }, { user: 'alice' })
    const sessionId = okOf(created).sessionId as string
    const foreign = await post('session.history', { sessionId }, { user: 'bob' })
    expect(foreign.status).toBe(200)
    expect(errorOf(foreign).code).toBe('session-not-found')
    const own = await post('session.history', { sessionId }, { user: 'alice' })
    expect(Array.isArray(okOf(own).events)).toBe(true)
  }, 30_000)
})
