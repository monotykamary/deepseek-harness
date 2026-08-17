/**
 * The passkey provider's HTTP routes: the WebAuthn register/login flow under
 * `/auth/passkey/*` plus the static login page. dsh is its own identity
 * authority here — the routes run the ceremony through simplewebauthn, the
 * session cookie they set is what `identify` reads.
 * @module @monotykamary/dsh-web-identity/passkey-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type WebAuthnCredential,
} from '@simplewebauthn/server'
import type { WebRoute } from '@monotykamary/dsh-host-webserver'
import {
  AUTH_CHALLENGE_TTL_MS,
  AUTH_MAX_BODY_BYTES,
  IDENTITY_USERNAME_MAX_LENGTH,
  IDENTITY_USERNAME_MIN_LENGTH,
} from './constants.ts'
import { CredentialStore } from './credential-store.ts'
import { clearSessionCookie, readSessionUser, setSessionCookie } from './session-cookie.ts'
import { UserStore } from './user-store.ts'
import { renderLoginPage } from './login-page.ts'
import type { Identity, IdentityProviderDeps } from './types.ts'

/** Passkey route paths, in one place so the gate exemption and tests agree. */
export const PASSKEY_ROUTE_PREFIX = '/auth/passkey'
/** The static login page route. */
export const PASSKEY_LOGIN_PATH = PASSKEY_ROUTE_PREFIX + '/login'

/**
 * Ephemeral, in-memory WebAuthn challenge store with a short TTL. A challenge
 * is issued with the options, single-use-consumed at verify (so a captured
 * options blob cannot be replayed), and swept lazily on each set. Lost on
 * restart — fine, a challenge is only valid for minutes.
 */
export class ChallengeStore {
  private readonly challenges = new Map<string, { kind: 'register' | 'login'; expiresAt: number }>()

  /**
   * Record one challenge of a kind.
   * @param challenge - the challenge string the client echoes back.
   * @param kind - the ceremony kind the challenge was issued for.
   */
  set(challenge: string, kind: 'register' | 'login'): void {
    this.challenges.set(challenge, { kind, expiresAt: Date.now() + AUTH_CHALLENGE_TTL_MS })
    const now = Date.now()
    for (const [key, entry] of this.challenges) {
      if (entry.expiresAt < now) this.challenges.delete(key)
    }
  }

  /**
   * Single-use consume: a register challenge cannot satisfy a login verify
   * (and vice versa), and a consumed challenge cannot be replayed.
   * @param challenge - the challenge the client echoes.
   * @param kind - the ceremony kind the challenge must have been issued for.
   * @returns true only for a live matching challenge.
   */
  consume(challenge: string, kind: 'register' | 'login'): boolean {
    const entry = this.challenges.get(challenge)
    this.challenges.delete(challenge)
    return entry?.kind === kind && entry.expiresAt >= Date.now()
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read a bounded JSON body; answers 400 itself and returns null on failure. */
async function readBody(req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let received = 0
  try {
    for await (const chunk of req) {
      const buffer = chunk as Buffer
      received += buffer.byteLength
      if (received > AUTH_MAX_BODY_BYTES) {
        writeJson(res, 400, { error: 'invalid_body' })
        req.destroy()
        return null
      }
      chunks.push(buffer)
    }
  } catch {
    /* client dropped the body; the response is already unusable */
    return null
  }
  try {
    const json: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return isObject(json) ? json : {}
  } catch {
    writeJson(res, 400, { error: 'invalid_body' })
    return null
  }
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  if (res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/**
 * Answer registration_closed and return false when self-registration is
 * closed; the register handlers call this before reading their body.
 * @param res - the response to write the refusal on.
 * @param registrationOpen - the provider's registration policy.
 * @returns whether the handler may continue.
 */
function allowRegistration(res: ServerResponse, registrationOpen: boolean): boolean {
  if (registrationOpen) return true
  writeJson(res, 403, { error: 'registration_closed' })
  return false
}

/** Trim and bound one submitted username; null on invalid input. */
function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < IDENTITY_USERNAME_MIN_LENGTH || trimmed.length > IDENTITY_USERNAME_MAX_LENGTH) {
    return null
  }
  return trimmed
}

// The RP origin/id come from the browser's own Origin header (the surface the
// user is actually on). A passkey is bound to the RP ID (hostname), so a
// passkey registered on the loopback origin does not work on the tailnet
// origin and vice versa — inherent to WebAuthn. There is no announced-origin
// fallback: dsh web has no single stable announceable origin, and the WebAuthn
// fetch always carries an Origin.
function resolveRp(req: IncomingMessage): { origin: string; rpID: string } | null {
  const raw = req.headers.origin
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    if (!url.hostname) return null
    return { origin: url.origin, rpID: url.hostname }
  } catch {
    return null
  }
}

// Quick structural reject for the credential response the browser sends; the
// real validation is simplewebauthn's verify (which throws on malformed
// input, caught by the route). Call sites cast to the library type after this
// shape check.
function isCredentialResponse(value: unknown): value is { id: string; response: object } {
  return isObject(value) && typeof value.id === 'string' && isObject(value.response)
}

interface PasskeyRoutesDeps {
  rpName: string
  registrationOpen: boolean
  userStore: UserStore
  credentialStore: CredentialStore
  challenges: ChallengeStore
  secret: string
}

/**
 * Build the provider's `/auth/passkey/*` route table.
 * @param deps - the provider's stores, secret, and policy.
 * @returns exact WebRoutes the plugin mounts.
 */
export function createPasskeyRoutes(deps: PasskeyRoutesDeps): readonly WebRoute[] {
  return [
    {
      kind: 'exact',
      path: PASSKEY_ROUTE_PREFIX + '/me',
      handler: (req, res) => {
        const user = readSessionUser(req, deps.secret)
        writeJson(res, 200, { user })
      },
    },
    {
      kind: 'exact',
      path: PASSKEY_ROUTE_PREFIX + '/register/options',
      handler: async (req, res) => {
        if (!allowRegistration(res, deps.registrationOpen)) return
        const body = await readBody(req, res)
        if (body === null) return
        const username = normalizeUsername(body.username)
        if (username === null) {
          writeJson(res, 400, { error: 'invalid_username' })
          return
        }
        const rp = resolveRp(req)
        if (rp === null) {
          writeJson(res, 400, { error: 'invalid_origin' })
          return
        }
        const excludeCredentials = (deps.userStore.get(username)?.credentialIds ?? [])
          .map(id => ({ id }))
        const options = await generateRegistrationOptions({
          rpName: deps.rpName,
          rpID: rp.rpID,
          userName: username,
          excludeCredentials,
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
        })
        deps.challenges.set(options.challenge, 'register')
        writeJson(res, 200, options)
      },
    },
    {
      kind: 'exact',
      path: PASSKEY_ROUTE_PREFIX + '/register/verify',
      handler: async (req, res) => {
        if (!allowRegistration(res, deps.registrationOpen)) return
        const body = await readBody(req, res)
        if (body === null) return
        const username = normalizeUsername(body.username)
        if (username === null || !isCredentialResponse(body.response)) {
          writeJson(res, 400, { error: 'invalid_body' })
          return
        }
        const rp = resolveRp(req)
        if (rp === null) {
          writeJson(res, 400, { error: 'invalid_origin' })
          return
        }
        const response = body.response as RegistrationResponseJSON
        let verified: VerifiedRegistrationResponse
        try {
          verified = await verifyRegistrationResponse({
            response,
            expectedChallenge: challenge => deps.challenges.consume(challenge, 'register'),
            expectedOrigin: rp.origin,
            expectedRPID: rp.rpID,
            requireUserVerification: true,
          })
        } catch {
          writeJson(res, 400, { error: 'verification_failed' })
          return
        }
        if (!verified.verified) {
          writeJson(res, 400, { error: 'verification_failed' })
          return
        }
        const credential = verified.registrationInfo.credential
        deps.userStore.findOrCreate(username)
        deps.userStore.addCredential(username, credential.id)
        deps.credentialStore.put({
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString('base64'),
          counter: credential.counter,
          username,
        })
        setSessionCookie(req, res, deps.secret, username)
        writeJson(res, 200, { user: username })
      },
    },
    {
      kind: 'exact',
      path: PASSKEY_ROUTE_PREFIX + '/login/options',
      handler: async (req, res) => {
        const body = await readBody(req, res)
        if (body === null) return
        const username = normalizeUsername(body.username)
        const rp = resolveRp(req)
        if (rp === null) {
          writeJson(res, 400, { error: 'invalid_origin' })
          return
        }
        const allowCredentials = username === null
          ? undefined
          : (deps.userStore.get(username)?.credentialIds ?? []).map(id => ({ id }))
        const options = await generateAuthenticationOptions({
          rpID: rp.rpID,
          ...allowCredentials === undefined ? {} : { allowCredentials },
          userVerification: 'preferred',
        })
        deps.challenges.set(options.challenge, 'login')
        writeJson(res, 200, options)
      },
    },
    {
      kind: 'exact',
      path: PASSKEY_ROUTE_PREFIX + '/login/verify',
      handler: async (req, res) => {
        const body = await readBody(req, res)
        if (body === null) return
        if (!isCredentialResponse(body.response)) {
          writeJson(res, 400, { error: 'invalid_body' })
          return
        }
        const response = body.response as AuthenticationResponseJSON
        const rp = resolveRp(req)
        if (rp === null) {
          writeJson(res, 400, { error: 'invalid_origin' })
          return
        }
        const stored = deps.credentialStore.get(response.id)
        if (stored === null) {
          writeJson(res, 400, { error: 'unknown_credential' })
          return
        }
        const credential: WebAuthnCredential = {
          id: stored.id,
          publicKey: Buffer.from(stored.publicKey, 'base64'),
          counter: stored.counter,
        }
        let verified: VerifiedAuthenticationResponse
        try {
          verified = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challenge => deps.challenges.consume(challenge, 'login'),
            expectedOrigin: rp.origin,
            expectedRPID: rp.rpID,
            credential,
            requireUserVerification: true,
          })
        } catch {
          writeJson(res, 400, { error: 'verification_failed' })
          return
        }
        if (!verified.verified) {
          writeJson(res, 400, { error: 'verification_failed' })
          return
        }
        deps.credentialStore.updateCounter(stored.id, verified.authenticationInfo.newCounter)
        setSessionCookie(req, res, deps.secret, stored.username)
        writeJson(res, 200, { user: stored.username })
      },
    },
    {
      kind: 'exact',
      path: PASSKEY_ROUTE_PREFIX + '/logout',
      handler: (req, res) => {
        clearSessionCookie(req, res)
        writeJson(res, 200, { ok: true })
      },
    },
    {
      kind: 'exact',
      path: PASSKEY_LOGIN_PATH,
      handler: (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(renderLoginPage())
      },
    },
  ]
}

/**
 * Build the self-contained identity provider: dsh is the identity authority.
 * `identify` reads the signed session cookie the register/login flow set;
 * `denyUnauthenticated: true` makes the gate reject any request without a
 * valid session — unlike `header`, there is no operator fallback, because
 * there is no external proxy to vouch for one. The operator bearer token
 * admits the operator tier instead.
 * @param config - the validated passkey configuration.
 * @param deps - secret and state directory.
 * @returns the provider with its route table.
 */
export function createPasskeyIdentityProvider(
  config: { rpName?: string; registration?: 'open' | 'closed'; operatorToken?: string },
  deps: IdentityProviderDeps,
): {
  kind: 'passkey'
  denyUnauthenticated: true
  operatorToken: string | null
  identify: (req: IncomingMessage) => Identity | null
  routes: () => readonly WebRoute[]
} {
  const rpName = config.rpName?.trim() || 'dsh'
  const registrationOpen = (config.registration ?? 'open') === 'open'
  const userStore = new UserStore(deps.stateDirectory + '/users.json')
  const credentialStore = new CredentialStore(deps.stateDirectory + '/credentials.json')
  const challenges = new ChallengeStore()
  const secret = deps.secret

  return {
    kind: 'passkey',
    denyUnauthenticated: true,
    operatorToken: config.operatorToken ?? null,
    identify: (req: IncomingMessage): Identity | null => {
      const user = readSessionUser(req, secret)
      return user === null ? null : { user }
    },
    routes: () =>
      createPasskeyRoutes({
        rpName,
        registrationOpen,
        userStore,
        credentialStore,
        challenges,
        secret,
      }),
  }
}
