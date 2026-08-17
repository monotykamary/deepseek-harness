/**
 * Type-only face of the web identity domain: the resolved identity, the
 * provider contract, the configuration union, and the Cordis service the
 * connection layer consumes. No runtime code lives here.
 * @module @monotykamary/dsh-web-identity/types
 */

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { WebRoute } from '@monotykamary/dsh-host-webserver'

/** The resolved identity for one HTTP/WS-upgrade request. */
export interface Identity {
  /** The partition key the session registry scopes by. */
  user: string
  /** Human-readable form for logs; absent when the provider has none. */
  displayName?: string
}

/**
 * The owner key sessions are partitioned by. `null` is the operator/legacy
 * tier — full access, the byte-identical-to-no-identity behavior — and is what
 * a request resolves to when no provider is configured, or when a configured
 * provider admits it as the operator (a trusted-proxy request with no identity
 * header in `header` mode, or the operator bearer token in `passkey` mode). A
 * non-null value scopes every session read to that user.
 */
export type SessionOwner = string | null

/** The provider kinds the identity authority implements. */
export type IdentityProviderKind = 'header' | 'passkey'

/** One request's gate outcome: who it runs as, and how it was admitted. */
export interface Admission {
  /** `null` = operator tier; a string = partitioned user. */
  readonly owner: SessionOwner
  /** True only when admitted through the operator bearer token. */
  readonly operator: boolean
}

/**
 * A strategy for turning an incoming request into an {@link Identity}.
 *   - `header` trusts a proxy-set header (default `x-forwarded-user`) only
 *     when the request's source IP is inside the configured proxy allowlist
 *     (default `loopback`). A trusted-proxy request with no header is the
 *     operator tier, so `denyUnauthenticated` is false — there is an external
 *     proxy vouching for the caller, and silence means the operator.
 *   - `passkey` makes dsh its own identity authority via WebAuthn: a
 *     register/login flow under `/auth/passkey/*` issues a signed session
 *     cookie `identify` reads. `denyUnauthenticated` is true: a request with
 *     no valid session is rejected at the gate, never silently granted
 *     operator access — dsh IS the authority here. The operator bearer token
 *     admits the CLI/scripts as the operator tier instead.
 */
export interface IdentityProvider {
  readonly kind: IdentityProviderKind
  /** Whether a request with no resolvable identity is rejected at the gate. */
  readonly denyUnauthenticated: boolean
  /**
   * Static bearer token granting the operator tier — full access, no session
   * cookie. `null` for `header` (no gate) and when no token is configured.
   */
  readonly operatorToken: string | null
  /**
   * Resolve the identity a request carries, or null when it carries none.
   * @param req - the node:http request (headers and cookies).
   * @param sourceIp - the caller-resolved source IP; the `header` provider
   *   requires it inside its proxy allowlist.
   * @returns the identity, or null when the request proves none.
   */
  identify(req: IncomingMessage, sourceIp?: string | null): Identity | null
  /** Optional HTTP routes the provider owns under `/auth` (passkey login flow). */
  routes?: () => readonly WebRoute[]
}

/** `header` provider configuration. */
export interface HeaderIdentityConfig {
  /** Provider discriminant: trust a reverse-proxy-set identity header. */
  provider: 'header'
  /** Identity header the trusted proxy sets; defaults to `x-forwarded-user`. */
  header?: string
  /**
   * Source-IP allowlist the identity header is honored from: `loopback`
   * (default), `private`, a CIDR, or a bare address.
   */
  trustedProxy?: string
}

/** `passkey` provider configuration. */
export interface PasskeyIdentityConfig {
  /** Provider discriminant: self-contained WebAuthn authority. */
  provider: 'passkey'
  /** WebAuthn relying-party display name; defaults to `dsh`. */
  rpName?: string
  /**
   * `open` (default) = anyone who can reach the server may register a passkey;
   * `closed` = registration disabled. Open registration is gated by the same
   * network reachability every other route inherits, so it is "anyone already
   * trusted enough to use dsh", not the open internet.
   */
  registration?: 'open' | 'closed'
  /**
   * Bearer token granting the operator tier. Absent, the plugin generates one
   * on first boot, persists it in the state directory, and prints it once.
   */
  operatorToken?: string
}

/** The identity configuration union; absent config = no provider, legacy tier. */
export type IdentityConfig = HeaderIdentityConfig | PasskeyIdentityConfig

/**
 * Server-owned resources injected into providers that need them: the persisted
 * HMAC secret for the session cookie and the state directory for the
 * user/credential stores.
 */
export interface IdentityProviderDeps {
  secret: string
  stateDirectory: string
}

/**
 * The Cordis service the connection layer consumes. Absent (no identity
 * configured) every request is the operator tier with no gate — the
 * byte-identical legacy behavior.
 */
export interface WebIdentityService {
  /** The active provider kind, or null when no provider is configured. */
  readonly providerKind: IdentityProviderKind | null
  /** Whether requests without a resolvable identity are rejected at the gate. */
  readonly denyUnauthenticated: boolean
  /** The operator bearer token, or null when none is configured. */
  readonly operatorToken: string | null
  /**
   * Admit one request through the identity gate.
   * @param req - the node:http request (headers, cookies, socket).
   * @param socket - the upgraded socket when admitting a WebSocket upgrade;
   *   undefined for ordinary HTTP.
   * @returns the admission, or undefined to reject the request (401 / WS
   *   policy violation) — only possible when {@link denyUnauthenticated}.
   */
  admit(req: IncomingMessage, socket?: Duplex): Admission | undefined
  /**
   * Whether the request currently being dispatched may access a session owned
   * by `sessionOwner`. The operator tier sees every session; a partitioned
   * user sees exactly the sessions they own.
   * @param sessionOwner - the session's durable owner field; absent = created
   *   by the operator tier.
   */
  mayAccess(sessionOwner: string | undefined): boolean
  /**
   * Run `fn` with `admission` bound as the current request's identity context.
   * @param admission - the gate outcome the downstream dispatch reads.
   * @param fn - the dispatch body (the /api bridge, or null for none).
   * @returns fn's result.
   */
  runWith<T>(admission: Admission | null, fn: () => T | Promise<T>): T | Promise<T>
  /**
   * The admission bound by the enclosing {@link runWith} — `{ owner: null,
   * operator: false }` when dispatch runs outside any identity context.
   */
  current(): Admission
  /**
   * Resolve the identity a request carries without gating (the `/auth/me`
   * read).
   * @param req - the node:http request.
   * @returns the identity, or null when the request proves none.
   */
  identify(req: IncomingMessage): Identity | null
}

/** `GET /auth/provider` response: which login flow a browser should offer. */
export interface IdentityProviderInfo {
  provider: IdentityProviderKind | null
  /** Only meaningful for passkey: whether self-registration is open. */
  registration?: 'open' | 'closed'
}

/** `GET /auth/<provider>/me` response: the currently-authenticated user. */
export interface AuthSession {
  user: string | null
}
