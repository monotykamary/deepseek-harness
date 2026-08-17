/**
 * @monotykamary/dsh-web-identity — the web identity authority for `dsh web`.
 * With no `identity` config the plugin provides nothing: every request is the
 * operator/legacy tier and behavior is byte-identical to today. With a
 * provider configured it resolves a per-request identity, exposes it as the
 * optional `ctx.identity` service the connection layer gates through, and
 * (for passkey) mounts the `/auth/*` login flow.
 *
 * Two providers, with the defaults the localterm identity design established:
 *   - `header` trusts a proxy-set identity header (default
 *     `x-forwarded-user`) only from a trusted-proxy source allowlist
 *     (default `loopback`). No gate: a trusted-proxy request with no header
 *     is the operator tier.
 *   - `passkey` makes dsh its own identity authority via WebAuthn. The gate
 *     rejects unauthenticated /api and WebSocket requests; the operator bearer
 *     token (configured, or auto-generated and persisted on first boot,
 *     printed once) admits the operator tier from anywhere.
 * @module @monotykamary/dsh-web-identity
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { Context, Service } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import { dshHomePath } from '@monotykamary/dsh-home-paths'
import type {} from '@monotykamary/dsh-host-webserver'
import {
  AUTH_OPERATOR_TOKEN_FILENAME,
  AUTH_SECRET_FILENAME,
  IDENTITY_HEADER_NAME_MAX_LENGTH,
  IDENTITY_PROXY_SPEC_MAX_LENGTH,
  IDENTITY_RP_NAME_MAX_LENGTH,
} from './constants.ts'
import { createIdentityProvider } from './factory.ts'
import { loadOrCreateAuthSecret } from './session-cookie.ts'
import type {
  Admission,
  Identity,
  IdentityConfig,
  IdentityProvider,
  IdentityProviderInfo,
  PasskeyIdentityConfig,
  WebIdentityService,
} from './types.ts'

export type {
  Admission,
  AuthSession,
  HeaderIdentityConfig,
  Identity,
  IdentityConfig,
  IdentityProvider,
  IdentityProviderInfo,
  IdentityProviderKind,
  PasskeyIdentityConfig,
  SessionOwner,
  WebIdentityService,
} from './types.ts'

export { createIdentityProvider } from './factory.ts'
export { createHeaderIdentityProvider } from './header-provider.ts'
export { createProxyAllowlist } from './proxy-allowlist.ts'
export { createPasskeyIdentityProvider, createPasskeyRoutes, ChallengeStore, PASSKEY_LOGIN_PATH, PASSKEY_ROUTE_PREFIX } from './passkey-routes.ts'
export {
  clearSessionCookie, generateAuthSecret, loadOrCreateAuthSecret, readCookie,
  readSessionUser, setSessionCookie, signSessionToken, verifySessionToken,
} from './session-cookie.ts'
export { OPERATOR_TOKEN_STORAGE_KEY } from './constants.ts'

/** Stable Cordis plugin name. */
export const name = 'web-identity'

/** Service required before the identity authority can mount its routes. */
export const inject = ['webServer']

/** Plugin config: the optional identity provider and its state directory. */
export interface Config {
  /**
   * The identity provider to activate. Absent, the plugin provides nothing and
   * every request is the operator/legacy tier — the byte-identical default.
   */
  identity?: IdentityConfig
  /**
   * Directory for the passkey stores, the cookie secret, and the generated
   * operator token; defaults to `identity/` under the harness home.
   */
  stateDirectory?: string
}

export const Config: z<Config> = z.object({
  identity: z.union([
    z.object({
      provider: z.const('header').required(),
      header: z.string().max(IDENTITY_HEADER_NAME_MAX_LENGTH),
      trustedProxy: z.string().max(IDENTITY_PROXY_SPEC_MAX_LENGTH),
    }),
    z.object({
      provider: z.const('passkey').required(),
      rpName: z.string().max(IDENTITY_RP_NAME_MAX_LENGTH),
      registration: z.union([z.const('open'), z.const('closed')]),
      operatorToken: z.string(),
    }),
  ]),
  stateDirectory: z.string(),
})

declare module '@monotykamary/cordis' {
  interface Context {
    /** Optional web identity authority; absent = legacy single-authority tier. */
    identity?: WebIdentityService
  }
}

/** The admission bound when dispatch runs outside any identity context. */
const LEGACY_ADMISSION: Admission = Object.freeze({ owner: null, operator: false })

/** Constant-time UTF-8 equality for the operator token comparison. */
function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, 'utf8')
  const bBytes = Buffer.from(b, 'utf8')
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes)
}

/** Best-effort source-IP read: the upgraded socket first, then the HTTP socket. */
function sourceIpOf(req: IncomingMessage, socket?: Duplex): string | null {
  const remote = socket !== undefined
    ? (socket as { remoteAddress?: string }).remoteAddress
    : req.socket.remoteAddress
  return typeof remote === 'string' ? remote : null
}

/**
 * Resolve the passkey operator bearer token: the configured value wins, then
 * the persisted file, then a freshly generated token that is persisted and
 * printed once. The operator stores it — losing the file loses the operator's
 * scripted access, never the server.
 * @param config - the validated passkey configuration.
 * @param stateDirectory - the state directory holding the token file.
 * @returns the operator token.
 */
function resolveOperatorToken(config: PasskeyIdentityConfig, stateDirectory: string): string {
  const configured = config.operatorToken?.trim()
  if (configured) return configured
  const filePath = join(stateDirectory, AUTH_OPERATOR_TOKEN_FILENAME)
  try {
    const existing = readFileSync(filePath, 'utf8').trim()
    if (existing) return existing
  } catch {
    /* no file yet */
  }
  const token = randomBytes(32).toString('base64url')
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, token, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmpPath, filePath)
  console.log('dsh web: passkey operator token generated (printed once; store it safely): ' + token)
  return token
}

/**
 * The connection-facing service: per-request gate admission plus the
 * async-context binding the downstream dispatch reads for session scoping.
 */
export class WebIdentity extends Service implements WebIdentityService {
  private readonly als = new AsyncLocalStorage<Admission | null>()

  readonly providerKind: WebIdentityService['providerKind']
  readonly denyUnauthenticated: boolean
  readonly operatorToken: string | null

  /**
   * Build the service over one configured provider.
   * @param ctx - owning plugin context.
   * @param provider - the configured provider.
   */
  constructor(ctx: Context, private readonly provider: IdentityProvider) {
    super(ctx, 'identity')
    this.providerKind = provider.kind
    this.denyUnauthenticated = provider.denyUnauthenticated
    this.operatorToken = provider.operatorToken
  }

  admit(req: IncomingMessage, socket?: Duplex): Admission | undefined {
    if (this.provider.denyUnauthenticated) {
      if (this.operatorToken !== null && isOperatorAuthorization(req, this.operatorToken)) {
        return { owner: null, operator: true }
      }
      const identity = this.provider.identify(req, sourceIpOf(req, socket))
      if (identity === null) return undefined
      return { owner: identity.user, operator: false }
    }
    const identity = this.provider.identify(req, sourceIpOf(req, socket))
    return { owner: identity?.user ?? null, operator: false }
  }

  mayAccess(sessionOwner: string | undefined): boolean {
    const owner = this.current().owner
    return owner === null || sessionOwner === owner
  }

  runWith<T>(admission: Admission | null, fn: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(admission, fn)
  }

  current(): Admission {
    return this.als.getStore() ?? LEGACY_ADMISSION
  }

  identify(req: IncomingMessage): Identity | null {
    return this.provider.identify(req, sourceIpOf(req))
  }
}

/**
 * Whether a request presents the operator bearer token as its authorization.
 * @param req - the node:http request.
 * @param operatorToken - the configured token.
 */
function isOperatorAuthorization(req: IncomingMessage, operatorToken: string): boolean {
  const authorization = req.headers.authorization
  return typeof authorization === 'string'
    && timingSafeEqualString(authorization, 'Bearer ' + operatorToken)
}

/**
 * Mount the identity authority: build the provider, resolve the operator
 * token, register `ctx.identity`, and mount the `/auth/*` routes.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const identityConfig = config.identity
  if (identityConfig === undefined) return
  const stateDirectory = resolve(config.stateDirectory ?? dshHomePath('identity'))
  const secret = loadOrCreateAuthSecret(join(stateDirectory, AUTH_SECRET_FILENAME))
  const providerConfig: IdentityConfig = identityConfig.provider === 'passkey'
    ? { ...identityConfig, operatorToken: resolveOperatorToken(identityConfig, stateDirectory) }
    : identityConfig
  const provider = createIdentityProvider(providerConfig, { secret, stateDirectory })
  // The Service constructor registers ctx.identity itself.
  new WebIdentity(ctx, provider)
  const providerInfo: IdentityProviderInfo = {
    provider: provider.kind,
    ...provider.kind === 'passkey'
      ? { registration: (identityConfig as PasskeyIdentityConfig).registration ?? 'open' }
      : {},
  }
  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact',
        path: '/auth/provider',
        handler: (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(providerInfo))
        },
      }),
      ...(provider.routes?.() ?? []).map(route => ctx.webServer.register(route)),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'web-identity: /auth routes')
}
