/**
 * Plugin composition behavior: the optional service, gate admission per
 * provider, operator-token generation, route mounting and disposal.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@monotykamary/cordis'
import type { WebRoute, WebServer } from '@monotykamary/dsh-host-webserver'
import { signSessionToken } from '../src/session-cookie.ts'
import { apply, Config } from '../src/index.ts'

function fakeWebServer(routes: WebRoute[]): WebServer {
  return {
    register(route: WebRoute) {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
  } as unknown as WebServer
}

function requestWith(headers: Record<string, string | undefined>): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage
}

let dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
  vi.restoreAllMocks()
})

function stateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-identity-compose-'))
  dirs.push(dir)
  return dir
}

describe('web-identity plugin', () => {
  it('provides nothing when no identity is configured', () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeWebServer(routes))
    apply(ctx, new Config({}))
    expect(ctx.get('identity')).toBeUndefined()
    expect(routes).toEqual([])
  })

  it('header mode: admit matrix, /auth/provider, and scoped mayAccess', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeWebServer(routes))
    apply(ctx, new Config({ identity: { provider: 'header' } }))
    const identity = ctx.identity
    expect(identity).toBeDefined()
    expect(identity?.providerKind).toBe('header')
    expect(identity?.denyUnauthenticated).toBe(false)
    expect(identity?.operatorToken).toBeNull()

    // A trusted-proxy request with no header is the operator tier.
    expect(identity?.admit(requestWith({}))).toEqual({ owner: null, operator: false })
    // A header from the trusted proxy becomes the user partition.
    expect(identity?.admit(requestWith({ 'x-forwarded-user': 'alice' }))).toEqual({ owner: 'alice', operator: false })
    // A header from an untrusted source is ignored — still the operator tier.
    const remote = requestWith({ 'x-forwarded-user': 'alice' })
    ;(remote.socket as { remoteAddress: string }).remoteAddress = '198.51.100.7'
    expect(identity?.admit(remote)).toEqual({ owner: null, operator: false })

    // /auth/provider names the active flow.
    expect(routes.some(route => route.path === '/auth/provider')).toBe(true)

    // mayAccess outside a dispatch context is the legacy tier.
    expect(identity?.mayAccess(undefined)).toBe(true)
    expect(identity?.mayAccess('bob')).toBe(true)

    // Inside a dispatch context the owner scopes session reads.
    await identity?.runWith({ owner: 'alice', operator: false }, async () => {
      expect(identity.mayAccess('alice')).toBe(true)
      expect(identity.mayAccess('bob')).toBe(false)
      expect(identity.mayAccess(undefined)).toBe(false)
      expect(identity.current()).toEqual({ owner: 'alice', operator: false })
    })
    // The operator admission sees every session.
    await identity?.runWith({ owner: null, operator: false }, async () => {
      expect(identity.mayAccess('alice')).toBe(true)
      expect(identity.mayAccess(undefined)).toBe(true)
    })
    await ctx.fiber.dispose()
  })

  it('header mode: disposal removes the registered routes', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeWebServer(routes))
    apply(ctx, new Config({ identity: { provider: 'header' } }))
    expect(routes.length).toBe(1)
    await ctx.fiber.dispose()
    expect(routes.length).toBe(0)
  })

  it('passkey mode: denies anonymous requests, admits cookie and operator token', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeWebServer(routes))
    const dir = stateDir()
    apply(ctx, new Config({ identity: { provider: 'passkey', operatorToken: 'op-token' }, stateDirectory: dir }))
    const identity = ctx.identity
    expect(identity?.providerKind).toBe('passkey')
    expect(identity?.denyUnauthenticated).toBe(true)
    expect(identity?.operatorToken).toBe('op-token')

    // Anonymous requests are rejected at the gate.
    expect(identity?.admit(requestWith({}))).toBeUndefined()
    // The operator bearer token admits the operator tier.
    expect(identity?.admit(requestWith({ authorization: 'Bearer op-token' }))).toEqual({ owner: null, operator: true })
    // A wrong token is still anonymous.
    expect(identity?.admit(requestWith({ authorization: 'Bearer wrong' }))).toBeUndefined()
    // A valid session cookie admits the user partition.
    const token = signSessionToken(readFileSync(join(dir, 'auth-secret'), 'utf8').trim(), 'alice')
    expect(identity?.admit(requestWith({ cookie: 'dsh-identity=' + token }))).toEqual({ owner: 'alice', operator: false })

    // The provider page and the full passkey flow are mounted.
    expect(routes.some(route => route.path === '/auth/passkey/login')).toBe(true)
    expect(routes.some(route => route.path === '/auth/passkey/register/options')).toBe(true)
    expect(routes.some(route => route.path === '/auth/passkey/login/verify')).toBe(true)
    await ctx.fiber.dispose()
  })

  it('passkey mode: generates, persists, and prints the operator token once', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const dir = stateDir()
    const ctx = new Context()
    ctx.provide('webServer', fakeWebServer([]))
    apply(ctx, new Config({ identity: { provider: 'passkey' }, stateDirectory: dir }))
    expect(ctx.identity?.operatorToken).not.toBeNull()
    const persisted = readFileSync(join(dir, 'operator-token'), 'utf8').trim()
    expect(persisted).toBe(ctx.identity?.operatorToken)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[0]).toContain('operator token generated')
    log.mockClear()

    // A second boot reads the persisted token and does not print again.
    const second = new Context()
    second.provide('webServer', fakeWebServer([]))
    apply(second, new Config({ identity: { provider: 'passkey' }, stateDirectory: dir }))
    expect(second.identity?.operatorToken).toBe(persisted)
    expect(log).not.toHaveBeenCalled()
  })

  it('passkey mode: a configured token wins over the persisted file', () => {
    const dir = stateDir()
    const ctx = new Context()
    ctx.provide('webServer', fakeWebServer([]))
    apply(ctx, new Config({ identity: { provider: 'passkey', operatorToken: 'configured' }, stateDirectory: dir }))
    expect(ctx.identity?.operatorToken).toBe('configured')
  })

  it('passkey mode: /auth/provider reports the registration policy', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeWebServer(routes))
    apply(ctx, new Config({ identity: { provider: 'passkey', registration: 'closed' }, stateDirectory: stateDir() }))
    const providerRoute = routes.find(route => route.path === '/auth/provider')
    expect(providerRoute).toBeDefined()
    const body: string[] = []
    const res = {
      writeHead(_status: number, _headers: Record<string, string>): void {},
      end(data: string): void { body.push(data) },
    }
    await providerRoute?.handler({} as never, res as never)
    expect(JSON.parse(body.join(''))).toEqual({ provider: 'passkey', registration: 'closed' })
  })
})
