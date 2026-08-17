/** Host half: the identity gate on the /api route and WebSocket upgrades. */
import { EventEmitter, once } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@monotykamary/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiProxy, RpcResponse } from '@monotykamary/dsh-host-apiproxy/api'
import { RpcId } from '@monotykamary/dsh-host-apiproxy/api'
import type { WebServer, WebRoute, WebUpgradeRoute } from '@monotykamary/dsh-host-webserver'
import { signSessionToken } from '@monotykamary/dsh-web-identity'
import { apply as applyIdentity, Config as IdentityConfig } from '@monotykamary/dsh-web-identity'
import { API_PATH, apply, inject, MUX_EVENTS_PATH } from '../src/index.ts'

function fakeHttpServer(
  routes: WebRoute[],
  upgrades: WebUpgradeRoute[],
): Pick<WebServer, 'register' | 'registerUpgrade' | 'tapIndex' | 'port'> {
  return {
    register(route: WebRoute) {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
    registerUpgrade(route: WebUpgradeRoute) {
      upgrades.push(route)
      return () => { upgrades.splice(upgrades.indexOf(route), 1) }
    },
    tapIndex: () => () => {},
    port: 0,
  }
}

function fakePost(headers: Record<string, string>, url: string, body: unknown): IncomingMessage {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage
  Object.assign(request, {
    url,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  })
  return request
}

function fakeResponse(): { response: ServerResponse; state: { status?: number; body?: unknown } } {
  const state: { status?: number; body?: unknown } = {}
  const chunks: Buffer[] = []
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(value: number) { state.status = value; return this },
    write(value: string | Uint8Array) { chunks.push(Buffer.from(value)); return true },
    end(this: { writableEnded: boolean }, value?: unknown) {
      if (typeof value === 'string' || value instanceof Uint8Array) chunks.push(Buffer.from(value))
      else if (value !== undefined) throw new TypeError('fake response only accepts string or Uint8Array bodies')
      if (chunks.length > 0) state.body = Buffer.concat(chunks).toString()
      this.writableEnded = true
      return this
    },
  }) as unknown as ServerResponse
  return { response, state }
}

const ENVELOPE = { type: 'client-request', rpcId: RpcId('gate-1'), method: 'session.list', payload: {} }

/** The connection-owned /api prefix route (the identity plugin adds /auth routes too). */
function apiRoute(routes: WebRoute[]): WebRoute {
  const route = routes.find(candidate => candidate.kind === 'prefix' && candidate.path === API_PATH)
  if (route === undefined) throw new Error('missing /api route')
  return route
}

let dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
})

async function mounted(config?: { trustedHosts?: string[] }): Promise<{
  ctx: Context
  routes: WebRoute[]
  upgrades: WebUpgradeRoute[]
  stateDirectory: string
  seenOwners: (string | null)[]
  dispose: () => Promise<void>
}> {
  const stateDirectory = mkdtempSync(join(tmpdir(), 'dsh-gate-'))
  dirs.push(stateDirectory)
  const ctx = new Context()
  const routes: WebRoute[] = []
  const upgrades: WebUpgradeRoute[] = []
  ctx.provide('webServer', fakeHttpServer(routes, upgrades) as WebServer)
  // Passkey mode with a fixed operator token: the gate denies everything but
  // the bearer token and a valid session cookie.
  applyIdentity(ctx, new IdentityConfig({
    identity: { provider: 'passkey', operatorToken: 'op-token' },
    stateDirectory,
  }))
  const seenOwners: (string | null)[] = []
  const apiProxy = {
    sessions: {
      async list(request: { rpcId: unknown }): Promise<RpcResponse<{ items: unknown[] }>> {
        seenOwners.push(ctx.get('identity')?.current().owner ?? null)
        return { rpcId: request.rpcId as never, result: { ok: true, value: { items: [] } } }
      },
    },
    settings: {
      async describe(request: { rpcId: unknown }): Promise<RpcResponse<{ namespaces: unknown[] }>> {
        seenOwners.push(ctx.get('identity')?.current().owner ?? null)
        return { rpcId: request.rpcId as never, result: { ok: true, value: { namespaces: [] } } }
      },
    },
    events: {
      async *mux(): AsyncGenerator<never, void, undefined> {},
      async *host(): AsyncGenerator<never, void, undefined> {},
    },
  }
  ctx.provide('apiProxy', apiProxy as unknown as ApiProxy)
  const fiber = ctx.plugin({ inject: [...inject], apply }, config)
  await fiber.await()
  return { ctx, routes, upgrades, stateDirectory, seenOwners, dispose: () => fiber.dispose() }
}

describe('connection identity gate', () => {
  it('denies an anonymous request in passkey mode with HTTP 401', async () => {
    const { routes, dispose } = await mounted()
    const { response, state } = fakeResponse()
    await apiRoute(routes).handler(fakePost({ host: '127.0.0.1:3080' }, API_PATH + '/session.list', ENVELOPE), response)
    expect(state.status).toBe(401)
    expect(state.body).toBe('{"error":"unauthenticated"}')
    await dispose()
  })

  it('admits the operator bearer token as the operator tier', async () => {
    const { routes, seenOwners, dispose } = await mounted()
    const { response, state } = fakeResponse()
    await apiRoute(routes).handler(fakePost({
      host: '127.0.0.1:3080', authorization: 'Bearer op-token',
    }, API_PATH + '/session.list', ENVELOPE), response)
    expect(state.status).toBe(200)
    expect(seenOwners).toEqual([null])
    await dispose()
  })

  it('admits a valid session cookie as the user partition and scopes the dispatch context', async () => {
    const { routes, stateDirectory, seenOwners, dispose } = await mounted()
    const secret = readFileSync(join(stateDirectory, 'auth-secret'), 'utf8').trim()
    const token = signSessionToken(secret, 'alice')
    const { response, state } = fakeResponse()
    await apiRoute(routes).handler(fakePost({
      host: '127.0.0.1:3080', cookie: 'dsh-identity=' + token,
    }, API_PATH + '/session.list', ENVELOPE), response)
    expect(state.status).toBe(200)
    expect(seenOwners).toEqual(['alice'])
    await dispose()
  })

  it('keeps privileged methods operator-only: a partitioned user is refused even on loopback', async () => {
    // The trusted-host fence still applies before the identity gate: the
    // remote surface must be a declared authority of this deployment.
    const { routes, stateDirectory, seenOwners, dispose } = await mounted({ trustedHosts: ['x.ts.net'] })
    const secret = readFileSync(join(stateDirectory, 'auth-secret'), 'utf8').trim()
    const token = signSessionToken(secret, 'alice')
    const envelope = { type: 'client-request', rpcId: RpcId('gate-2'), method: 'settings.describe', payload: {} }
    const { response, state } = fakeResponse()
    await apiRoute(routes).handler(fakePost({
      host: '127.0.0.1:3080', cookie: 'dsh-identity=' + token,
    }, API_PATH + '/settings.describe', envelope), response)
    expect(state.status).toBe(403)
    expect(seenOwners).toEqual([])

    // The operator token reaches the privileged plane from a trusted surface.
    const op = fakeResponse()
    await apiRoute(routes).handler(fakePost({
      host: 'x.ts.net', authorization: 'Bearer op-token', origin: 'https://x.ts.net', 'sec-fetch-site': 'same-origin',
    }, API_PATH + '/settings.describe', envelope), op.response)
    expect(op.state.status).toBe(200)
    expect(seenOwners).toEqual([null])
    await dispose()
  })

  it('rejects an anonymous WebSocket upgrade with 401 before protocol negotiation', async () => {
    const { upgrades, dispose } = await mounted()
    const socket = new PassThrough()
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    const ended = once(socket, 'end')
    await upgrades[0]!.handler(fakePost({
      host: '127.0.0.1:3080',
    }, MUX_EVENTS_PATH, {}), socket, Buffer.alloc(0))
    await ended
    expect(Buffer.concat(chunks).toString()).toContain('HTTP/1.1 401 Unauthorized')
    await dispose()
  })
})
