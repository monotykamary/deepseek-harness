# Web 身份

[English](web-identity.md) | 中文

[`dsh-web-identity`](../../packages/identity/web-identity) 是 GUI 主机的 Web 身份权威：一个为每个请求解析身份（受信代理头，或 passkey 会话 Cookie）的插件，以可选的 `ctx.identity` 服务暴露身份，并按用户分区会话注册表。连接层读取该服务：其 `/api` 路由与 WebSocket 升级让每个请求通过门禁，放行结果通过 `AsyncLocalStorage` 传递，供下游分发读取，api-proxy 与 typert 会话查找据此限定每次会话读取。未配置提供者时插件不提供任何服务，每个请求都是运营者层级——与不安装该包的部署逐字节一致。提供者语义、配置与运营者令牌流程详见[包 README](../../packages/identity/web-identity/README.md)；决策记录见 [Web 身份 Agent Note](../../.agents/notes/implemented/feature/2026-08-17-web-identity-sso.md)。

来源：[`packages/identity/web-identity/src/types.ts`](../../packages/identity/web-identity/src/types.ts)

## 类型

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

`SessionOwner` 是分区键：`null` 是运营者层级（完全访问，会话无属主），字符串把每次会话读取限定到该用户。`Identity` 是每次门禁放行所依据的提供者解析结果。`Admission` 把属主与门禁的放行方式配对——只有运营者 Bearer 令牌会置 `operator`，特权方法面读取的正是它。`WebIdentityService` 是连接层面对的契约：`admit` 执行提供者策略（passkey 模式下拒绝未认证请求），`runWith` 把放行结果绑定到异步上下文中，下游每次会话读取通过 `current()`/`mayAccess` 查询它，`identify` 为 `/auth` 读取提供无门禁的身份解析。提供者配置联合类型与 `/auth` 线上的响应属于[配置目录](../config-catalog.md)与包 README 的词汇。
