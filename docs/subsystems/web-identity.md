# Web identity

English | [中文](web-identity.zh.md)

[`dsh-web-identity`](../../packages/identity/web-identity) is the web identity authority for the GUI host: a plugin that resolves a per-request identity (a trusted-proxy header, or the passkey session cookie), exposes it as the optional `ctx.identity` service, and partitions the session registry by user. The connection layer reads the service: its `/api` route and WebSocket upgrades admit every request through the gate, and the admission rides an `AsyncLocalStorage` the downstream dispatch reads so the api-proxy and the typert session lookups can scope every session read. With no provider configured the plugin provides nothing and every request is the operator tier — byte-identical to a deployment without it. Full provider semantics, config, and the operator-token flow live in the [package README](../../packages/identity/web-identity/README.md); the decision record is the [web identity Agent Note](../../.agents/notes/implemented/feature/2026-08-17-web-identity-sso.md).

Source: [`packages/identity/web-identity/src/types.ts`](../../packages/identity/web-identity/src/types.ts)

## Types

```ts type-equiv
/**
 * The owner key sessions are partitioned by. `null` is the operator/legacy
 * tier — full access, the byte-identical-to-no-identity behavior — and is what
 * a request resolves to when no provider is configured, or when a configured
 * provider admits it as the operator (a trusted-proxy request with no identity
 * header in `header` mode, or the operator bearer token in `passkey` mode). A
 * non-null value scopes every session read to that user.
 */
type SessionOwner = string | null
```

```ts type-equiv
/** The resolved identity for one HTTP/WS-upgrade request. */
interface Identity {
  /** The partition key the session registry scopes by. */
  user: string
  /** Human-readable form for logs; absent when the provider has none. */
  displayName?: string
}
```

```ts type-equiv
/** One request's gate outcome: who it runs as, and how it was admitted. */
interface Admission {
  /** `null` = operator tier; a string = partitioned user. */
  readonly owner: SessionOwner
  /** True only when admitted through the operator bearer token. */
  readonly operator: boolean
}
```

```ts type-equiv
/**
 * The Cordis service the connection layer consumes. Absent (no identity
 * configured) every request is the operator tier with no gate — the
 * byte-identical legacy behavior.
 */
interface WebIdentityService {
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
```

`SessionOwner` is the partition key: `null` is the operator tier (full access, sessions unowned), a string scopes every session read to that user. `Identity` is the provider-resolution result each gate admission derives from. `Admission` pairs the owner with how the gate admitted it — only the operator bearer token sets `operator`, which is what the privileged-method plane reads. `WebIdentityService` is the connection-facing contract: `admit` runs the provider policy (rejecting unauthenticated requests in passkey mode), `runWith` binds the admission into the async context every downstream session read consults through `current()`/`mayAccess`, and `identify` serves the `/auth` reads without gating. The provider configuration union and the `/auth` wire responses are the [config catalog](../config-catalog.md) and the package README's vocabulary.
