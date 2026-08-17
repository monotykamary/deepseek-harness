# `@monotykamary/dsh-web-identity`

English | [中文](README.zh.md)

Web identity authority for `dsh web`: a function plugin that resolves a per-request identity, exposes it as the optional `ctx.identity` service the connection layer gates through, partitions sessions by user, and (for passkey) mounts the `/auth/*` login flow. With no `identity` config the plugin provides nothing and every request is the operator tier — behavior byte-identical to a deployment without this package.

Two providers, with the defaults the localterm identity design established:

- **`header`** trusts a proxy-set identity header (default `x-forwarded-user`) only from a trusted-proxy source allowlist (default `loopback`). No gate: a trusted-proxy request with no header is the operator tier, so a reverse proxy (Cloudflare Access, Pomerium, Authelia) can front the server without any in-app login.
- **`passkey`** makes dsh its own identity authority via WebAuthn. A register/login flow under `/auth/passkey/*` issues a signed HMAC session cookie, and the gate rejects unauthenticated `/api` requests and WebSocket upgrades with 401. The operator bearer token — configured, or auto-generated on first boot, persisted in the state directory, and printed once — admits the operator tier from anywhere.

Every request admitted as a non-operator user is scoped to that user's partition: `session.list` and search return exactly the user's sessions, every other session-addressing RPC answers `session-not-found` for a cross-tenant id, the mux/host streams carry only the user's frames, and created sessions record the owner durably on the session header so the partition survives restart. The operator tier (owner `null`) sees everything and keeps the privileged method plane; a partitioned user is refused privileged methods even on loopback — the token is how the operator works in passkey mode.

The browser half of the connection layer attaches a stored operator token (`localStorage['dsh.operatorToken']`, set by the login page's operator form) as an `Authorization: Bearer` header and redirects to `/auth/passkey/login` on HTTP 401.

## Model Experience

None, as the package gates HTTP requests and partitions sessions; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Workspace live pushes are operator-only** — a partitioned user's workspace picker re-baselines through the filtered `workspace.list` RPC instead of receiving `host/workspace-changed` frames.
- **Passkeys bind to the RP origin** — a passkey registered on the loopback surface does not work on the tailnet/portless surface and vice versa (inherent to WebAuthn), and `127.0.0.1` is not a registrable RP ID (use `localhost` or a tailnet/portless https origin).
- **OIDC is deferred** — the provider union covers `header` and `passkey`; an OIDC provider would add a redirect flow over the same signed cookie.
