/**
 * Identity scoping over createApiProxy: owner-tagged creation, partitioned
 * listing, cross-tenant not-found refusals, owner-scoped mux streams, and the
 * filtered workspace baseline.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@monotykamary/cordis'
import AgentRegistry from '@monotykamary/dsh-agent'
import AgentLoop from '@monotykamary/dsh-agent-loop'
import SessionStore, { SessionId } from '@monotykamary/dsh-session'
import SystemPrompt from '@monotykamary/dsh-system-prompt'
import ToolRuntime from '@monotykamary/dsh-tools'
import UserQuestionService from '@monotykamary/dsh-user-questions'
import LlmRuntime from '@monotykamary/dsh-llm'
import type { Admission, Identity, WebIdentityService } from '@monotykamary/dsh-web-identity'
import type { MuxFrame } from '../src/api/index.ts'
import type { RpcRequest, RpcResponse } from '../src/api/rpc.ts'
import { RpcId } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'

const DEFAULTS = { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId('req-' + String(nextRpc++)), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

function expectErr<T>(response: RpcResponse<T>): { code: string; message: string } {
  expect(response.result.ok).toBe(false)
  if (response.result.ok) throw new Error('unreachable')
  return response.result.error
}

/** Minimal identity authority: the ALS owner drives mayAccess like the real service. */
class FakeIdentity implements WebIdentityService {
  private readonly als = new AsyncLocalStorage<Admission | null>()
  readonly providerKind = 'header' as const
  readonly denyUnauthenticated = false
  readonly operatorToken = null

  admit(_req: IncomingMessage): Admission | undefined {
    return undefined
  }

  identify(_req: IncomingMessage): Identity | null {
    return null
  }

  runWith<T>(admission: Admission | null, fn: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(admission, fn)
  }

  current(): Admission {
    return this.als.getStore() ?? { owner: null, operator: false }
  }

  mayAccess(sessionOwner: string | undefined): boolean {
    const owner = this.current().owner
    return owner === null || sessionOwner === owner
  }
}

let dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-identity-proxy-'))
  dirs.push(dir)
  return dir
}

async function harness(): Promise<{ ctx: Context; api: ReturnType<typeof createApiProxy>; identity: FakeIdentity }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(AgentLoop, { agents: [] })
  const identity = new FakeIdentity()
  ctx.provide('identity', identity)
  ctx.provide('workspaceRegistry', {
    list: () => [{
      id: 'ws1',
      path: '/shared',
      title: 'shared',
      sessionIds: [SessionId('s-alice'), SessionId('s-bob'), SessionId('s-orphan')],
      createdAt: 1,
      updatedAt: 1,
    }],
    archivedSessionIds: [SessionId('s-bob')],
  } as never)
  const api = createApiProxy(ctx, DEFAULTS)
  return { ctx, api, identity }
}

const as = async <T>(identity: FakeIdentity, owner: string | null, fn: () => T | Promise<T>): Promise<T> =>
  await identity.runWith({ owner, operator: false }, fn)

describe('identity scoping over the api proxy', () => {
  it('tags created sessions with the request owner and lists them partitioned', async () => {
    const { api, identity } = await harness()
    const aliceDir = tempDir()
    const bobDir = tempDir()
    const opDir = tempDir()
    const aliceId = expectOk(await as(identity, 'alice', () => api.sessions.create(request({ cwd: aliceDir })))).sessionId
    const bobId = expectOk(await as(identity, 'bob', () => api.sessions.create(request({ cwd: bobDir })))).sessionId
    const opId = expectOk(await as(identity, null, () => api.sessions.create(request({ cwd: opDir })))).sessionId

    const aliceList = expectOk(await as(identity, 'alice', () => api.sessions.list(request({}))))
    expect(aliceList.items.map(item => item.sessionId)).toEqual([aliceId])
    const bobList = expectOk(await as(identity, 'bob', () => api.sessions.list(request({}))))
    expect(bobList.items.map(item => item.sessionId)).toEqual([bobId])
    const operatorList = expectOk(await as(identity, null, () => api.sessions.list(request({}))))
    expect(operatorList.items.map(item => item.sessionId).sort()).toEqual([aliceId, bobId, opId].sort())
  })

  it('refuses cross-tenant session reads as session-not-found', async () => {
    const { api, identity } = await harness()
    const aliceDir = tempDir()
    const opDir = tempDir()
    const aliceId = expectOk(await as(identity, 'alice', () => api.sessions.create(request({ cwd: aliceDir })))).sessionId
    const opId = expectOk(await as(identity, null, () => api.sessions.create(request({ cwd: opDir })))).sessionId

    // Alice reading her own session works.
    const own = expectOk(await as(identity, 'alice', () => api.sessions.history(request({ sessionId: aliceId }))))
    expect(own.events).toEqual([])
    // Alice renaming the operator's session answers not-found, like an unknown id.
    const foreign = await as(identity, 'alice', () => api.sessions.rename(request({ sessionId: opId, title: 'stolen' })))
    expect(expectErr(foreign as never).code).toBe('session-not-found')
    // The operator tier still reaches everything.
    const operatorView = expectOk(await as(identity, null, () => api.sessions.history(request({ sessionId: aliceId }))))
    expect(operatorView.events).toEqual([])
  })

  it('scopes the mux stream baseline and event pushes to the connection owner', async () => {
    const { ctx, api, identity } = await harness()
    const aliceDir = tempDir()
    const opDir = tempDir()
    const aliceId = expectOk(await as(identity, 'alice', () => api.sessions.create(request({ cwd: aliceDir })))).sessionId
    const opId = expectOk(await as(identity, null, () => api.sessions.create(request({ cwd: opDir })))).sessionId
    const abort = new AbortController()
    const frames: MuxFrame[] = []
    const stream = api.events.mux(request({}), abort.signal, 'alice')
    const consume = (async () => {
      for await (const frame of stream) frames.push(frame.payload)
    })()
    // Baseline: only alice's session is subscribed.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(frames).toEqual([{ type: 'session/subscribed', sessionId: aliceId, lastSeq: -1 }])

    // An operator-session append never reaches alice's stream.
    ctx.sessions.get(opId)?.append('plan/mode', { active: true })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(frames.filter(frame => frame.type === 'session/event' && frame.sessionId === opId)).toEqual([])
    // Alice's own session streams.
    ctx.sessions.get(aliceId)?.append('plan/mode', { active: true })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(frames.filter(frame => frame.type === 'session/event' && frame.sessionId === aliceId)).toHaveLength(1)
    abort.abort()
    await consume
  })

  it('filters workspace session ids for a partitioned request', async () => {
    const { api, identity } = await harness()
    // Attach live sessions for the two visible ids: alice owns s-alice, an
    // operator session owns s-orphan, s-bob stays cold and absent.
    await as(identity, 'alice', () => api.sessions.create(request({ cwd: tempDir(), sessionId: SessionId('s-alice') })))
    await as(identity, null, () => api.sessions.create(request({ cwd: tempDir(), sessionId: SessionId('s-orphan') })))
    const view = expectOk(await as(identity, 'alice', () => api.workspace.list(request({}))))
    expect(view.items).toHaveLength(1)
    expect(view.items[0]?.sessionIds).toEqual(['s-alice'])
    expect(view.archivedSessionIds).toEqual([])
    const operatorView = expectOk(await as(identity, null, () => api.workspace.list(request({}))))
    expect(operatorView.items[0]?.sessionIds).toEqual(['s-alice', 's-bob', 's-orphan'])
    expect(operatorView.archivedSessionIds).toEqual(['s-bob'])
  })
})
