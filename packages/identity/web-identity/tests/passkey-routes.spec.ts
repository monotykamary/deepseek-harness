import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebRoute } from '@monotykamary/dsh-host-webserver'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(async (
    options: { rpName: string; rpID: string; userName: string; excludeCredentials: unknown[] },
  ) => ({
    challenge: 'reg-challenge',
    rp: { name: options.rpName, id: options.rpID },
    user: { id: 'dXNlcg', name: options.userName, displayName: options.userName },
    pubKeyCredParams: [],
    timeout: 60000,
    excludeCredentials: options.excludeCredentials,
  })),
  generateAuthenticationOptions: vi.fn(async (options: { rpID: string; allowCredentials?: unknown[] }) => ({
    challenge: 'login-challenge',
    rpId: options.rpID,
    userVerification: 'preferred',
    timeout: 60000,
    ...(options.allowCredentials === undefined ? {} : { allowCredentials: options.allowCredentials }),
  })),
  verifyRegistrationResponse: vi.fn(async (options: { expectedChallenge: (c: string) => boolean }) => {
    const live = options.expectedChallenge('reg-challenge')
    return live
      ? { verified: true, registrationInfo: { credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0 } } }
      : { verified: false }
  }),
  verifyAuthenticationResponse: vi.fn(async (options: { expectedChallenge: (c: string) => boolean }) => {
    const live = options.expectedChallenge('login-challenge')
    return live
      ? { verified: true, authenticationInfo: { newCounter: 1 } }
      : { verified: false }
  }),
}))

import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import { CredentialStore } from '../src/credential-store.ts'
import { ChallengeStore, createPasskeyIdentityProvider, createPasskeyRoutes } from '../src/passkey-routes.ts'
import { signSessionToken } from '../src/session-cookie.ts'
import { UserStore } from '../src/user-store.ts'

const mockedGenerateRegistrationOptions = vi.mocked(generateRegistrationOptions)
const mockedGenerateAuthenticationOptions = vi.mocked(generateAuthenticationOptions)
const mockedVerifyRegistrationResponse = vi.mocked(verifyRegistrationResponse)
const mockedVerifyAuthenticationResponse = vi.mocked(verifyAuthenticationResponse)

interface ResponseStub {
  status: number
  body: string
  headers: Record<string, unknown>
}

async function invoke(route: WebRoute, init: { headers?: Record<string, string>; body?: unknown }): Promise<ResponseStub> {
  const out: ResponseStub = { status: 0, body: '', headers: {} }
  const bodyBuffer = Buffer.from(init.body === undefined ? '' : JSON.stringify(init.body))
  const req = {
    headers: init.headers ?? {},
    socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]() {
      let sent = false
      return {
        next: (): Promise<IteratorResult<Buffer>> => {
          if (sent) return Promise.resolve({ value: undefined, done: true })
          sent = true
          return Promise.resolve({ value: bodyBuffer, done: false })
        },
      }
    },
    destroy(): void {},
  }
  const res = {
    headersSent: false,
    writeHead(status: number, headers?: Record<string, string>): void {
      out.status = status
      if (headers !== undefined) Object.assign(out.headers, headers)
    },
    setHeader(name: string, value: string): void {
      out.headers[name] = value
    },
    end(data?: string): void {
      out.body = data ?? ''
    },
  }
  await route.handler(req as never, res as never)
  return out
}

const REGISTER_OPTIONS = '/auth/passkey/register/options'
const REGISTER_VERIFY = '/auth/passkey/register/verify'
const LOGIN_OPTIONS = '/auth/passkey/login/options'
const LOGIN_VERIFY = '/auth/passkey/login/verify'
const ME = '/auth/passkey/me'
const LOGOUT = '/auth/passkey/logout'

const responseOf = {
  id: 'cred-1',
  rawId: 'Y3JlZC0x',
  type: 'public-key' as const,
  clientExtensionResults: {},
  response: {
    attestationObject: 'YQ',
    clientDataJSON: 'Y2xpZW50',
    authenticatorData: 'YXV0aA',
    signature: 'c2ln',
  },
}

function routeByPath(routes: readonly WebRoute[], path: string): WebRoute {
  const route = routes.find(candidate => candidate.path === path)
  if (route === undefined) throw new Error('missing route ' + path)
  return route
}

describe('passkey routes', () => {
  let dir = ''
  const secret = 'test-secret'

  const routes = (registrationOpen = true): readonly WebRoute[] => createPasskeyRoutes({
    rpName: 'dsh test',
    registrationOpen,
    userStore: new UserStore(join(dir, 'users.json')),
    credentialStore: new CredentialStore(join(dir, 'credentials.json')),
    challenges: new ChallengeStore(),
    secret,
  })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-identity-passkey-'))
    vi.clearAllMocks()
  })

  it('registers a user: options, verify, cookie, and durable stores', async () => {
    const table = routes()
    const options = await invoke(routeByPath(table, REGISTER_OPTIONS), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice' },
    })
    expect(options.status).toBe(200)
    expect((JSON.parse(options.body) as { challenge: string }).challenge).toBe('reg-challenge')
    expect(mockedGenerateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({ rpID: 'localhost', rpName: 'dsh test', userName: 'alice' }))

    const verify = await invoke(routeByPath(table, REGISTER_VERIFY), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice', response: responseOf },
    })
    expect(verify.status).toBe(200)
    expect(JSON.parse(verify.body)).toEqual({ user: 'alice' })
    expect(String(verify.headers['set-cookie'])).toContain('dsh-identity=')
    expect(mockedVerifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedOrigin: 'http://localhost:3080',
      expectedRPID: 'localhost',
      requireUserVerification: true,
    }))
    const users = JSON.parse(readFileSync(join(dir, 'users.json'), 'utf8')) as { users: Record<string, { credentialIds: string[] }> }
    expect(users.users.alice?.credentialIds).toEqual(['cred-1'])
    const credentials = JSON.parse(readFileSync(join(dir, 'credentials.json'), 'utf8')) as { credentials: Record<string, { username: string; counter: number }> }
    expect(credentials.credentials['cred-1']).toMatchObject({ username: 'alice', counter: 0 })

    // The challenge was single-use: replaying the same response fails verification.
    const replay = await invoke(routeByPath(table, REGISTER_VERIFY), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice', response: responseOf },
    })
    expect(replay.status).toBe(400)
    expect(JSON.parse(replay.body)).toEqual({ error: 'verification_failed' })
  })

  it('refuses registration when closed', async () => {
    const table = routes(false)
    const options = await invoke(routeByPath(table, REGISTER_OPTIONS), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice' },
    })
    expect(options.status).toBe(403)
    expect(JSON.parse(options.body)).toEqual({ error: 'registration_closed' })
    const verify = await invoke(routeByPath(table, REGISTER_VERIFY), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice', response: responseOf },
    })
    expect(verify.status).toBe(403)
  })

  it('rejects an invalid username and a missing origin', async () => {
    const table = routes()
    const badUsername = await invoke(routeByPath(table, REGISTER_OPTIONS), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: '   ' },
    })
    expect(badUsername.status).toBe(400)
    expect(JSON.parse(badUsername.body)).toEqual({ error: 'invalid_username' })
    const noOrigin = await invoke(routeByPath(table, REGISTER_OPTIONS), {
      body: { username: 'alice' },
    })
    expect(noOrigin.status).toBe(400)
    expect(JSON.parse(noOrigin.body)).toEqual({ error: 'invalid_origin' })
  })

  it('rejects a structurally invalid registration body', async () => {
    const table = routes()
    const bad = await invoke(routeByPath(table, REGISTER_VERIFY), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice', response: { nope: true } },
    })
    expect(bad.status).toBe(400)
    expect(JSON.parse(bad.body)).toEqual({ error: 'invalid_body' })
  })

  it('maps a throwing verifier to verification_failed', async () => {
    mockedVerifyRegistrationResponse.mockRejectedValueOnce(new Error('bad'))
    const table = routes()
    await invoke(routeByPath(table, REGISTER_OPTIONS), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice' },
    })
    const verify = await invoke(routeByPath(table, REGISTER_VERIFY), {
      headers: { origin: 'http://localhost:3080' },
      body: { username: 'alice', response: responseOf },
    })
    expect(verify.status).toBe(400)
    expect(JSON.parse(verify.body)).toEqual({ error: 'verification_failed' })
  })

  it('logs in with a stored credential and updates the counter', async () => {
    const credentialStore = new CredentialStore(join(dir, 'credentials.json'))
    credentialStore.put({ id: 'cred-1', publicKey: 'AQID', counter: 0, username: 'alice' })
    const userStore = new UserStore(join(dir, 'users.json'))
    userStore.findOrCreate('alice')
    userStore.addCredential('alice', 'cred-1')
    const table = createPasskeyRoutes({
      rpName: 'dsh test',
      registrationOpen: true,
      userStore,
      credentialStore,
      challenges: new ChallengeStore(),
      secret,
    })
    const options = await invoke(routeByPath(table, LOGIN_OPTIONS), {
      headers: { origin: 'https://x.ts.net' },
      body: { username: 'alice' },
    })
    expect(options.status).toBe(200)
    expect(mockedGenerateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({ allowCredentials: [{ id: 'cred-1' }] }))
    const verify = await invoke(routeByPath(table, LOGIN_VERIFY), {
      headers: { origin: 'https://x.ts.net' },
      body: { response: responseOf },
    })
    expect(verify.status).toBe(200)
    expect(JSON.parse(verify.body)).toEqual({ user: 'alice' })
    const expectedVerify: { expectedOrigin: string; expectedRPID: string; credential: unknown } = {
      expectedOrigin: 'https://x.ts.net',
      expectedRPID: 'x.ts.net',
      credential: expect.objectContaining({ id: 'cred-1' }),
    }
    expect(mockedVerifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining(expectedVerify))
    expect(credentialStore.get('cred-1')?.counter).toBe(1)
  })

  it('rejects a login for an unknown credential', async () => {
    const table = routes()
    await invoke(routeByPath(table, LOGIN_OPTIONS), {
      headers: { origin: 'http://localhost:3080' },
      body: {},
    })
    const verify = await invoke(routeByPath(table, LOGIN_VERIFY), {
      headers: { origin: 'http://localhost:3080' },
      body: { response: responseOf },
    })
    expect(verify.status).toBe(400)
    expect(JSON.parse(verify.body)).toEqual({ error: 'unknown_credential' })
  })

  it('serves me from the session cookie and clears it on logout', async () => {
    const table = routes()
    const authed = await invoke(routeByPath(table, ME), {
      headers: { cookie: 'dsh-identity=' + signSessionToken(secret, 'alice') },
    })
    expect(JSON.parse(authed.body)).toEqual({ user: 'alice' })
    const anon = await invoke(routeByPath(table, ME), { headers: {} })
    expect(JSON.parse(anon.body)).toEqual({ user: null })
    const logout = await invoke(routeByPath(table, LOGOUT), { headers: {} })
    expect(logout.status).toBe(200)
    expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0')
  })

  it('serves the login page at /auth/passkey/login', async () => {
    const table = routes()
    const page = await invoke(routeByPath(table, '/auth/passkey/login'), { headers: {} })
    expect(page.status).toBe(200)
    expect(page.body).toContain('<!DOCTYPE html>')
  })
})

describe('ChallengeStore', () => {
  it('consumes a challenge once, for its kind only, and expires entries', () => {
    const store = new ChallengeStore()
    store.set('a', 'register')
    expect(store.consume('a', 'login')).toBe(false)
    store.set('a', 'register')
    expect(store.consume('a', 'register')).toBe(true)
    expect(store.consume('a', 'register')).toBe(false)
    expect(store.consume('missing', 'register')).toBe(false)
    store.set('old', 'register')
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    expect(store.consume('old', 'register')).toBe(false)
    vi.useRealTimers()
  })
})

describe('createPasskeyIdentityProvider', () => {
  it('is denyUnauthenticated with the configured operator token and identifies from the cookie', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-identity-provider-'))
    try {
      const provider = createPasskeyIdentityProvider({ registration: 'open', operatorToken: 'op-token' }, { secret: 's', stateDirectory: dir })
      expect(provider.kind).toBe('passkey')
      expect(provider.denyUnauthenticated).toBe(true)
      expect(provider.operatorToken).toBe('op-token')
      expect(provider.identify({ headers: {} } as never)).toBeNull()
      const token = signSessionToken('s', 'bob')
      expect(provider.identify({ headers: { cookie: 'dsh-identity=' + token } } as never)).toEqual({ user: 'bob' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
