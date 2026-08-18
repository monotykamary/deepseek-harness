# Agent Note: Web identity and per-user session partitioning (SSO)

Status: implemented

English | [中文](2026-08-17-web-identity-sso.zh.md)

## Problem

The browser surface reached remote origins (tailnet, portless) through [web remote-surface resolution](2026-08-17-web-remote-surface-resolution.md), but the `/api` browser-trust fence is DNS-rebinding defense, explicitly not an authentication layer: every caller that passed the fence saw every session, and the privileged plane was pinned to loopback for lack of any other principal to grant it to. A shared gateway — several people reaching one `dsh web` — needs remote users who reach only their own sessions, an operator tier that keeps full access, and a login story. localterm's identity design (its identity docs and server identity sources) is the proven reference implementation for exactly this posture.

## Decision

Port localterm's identity layer onto `dsh web` as the new `@monotykamary/dsh-web-identity` package plus the optional `ctx.identity` service, and adopt localterm's defaults for the three open product decisions:

- **Privileged plane** — the operator tier (owner `null`) IS the privileged plane. Authenticated non-operator users reach ordinary RPC only, from any origin; the `PRIVILEGED_METHODS` set additionally requires owner `null` AND (loopback or a deployment trusted authority, or admission through the operator bearer token). The surface grant (loopback or a trusted authority) is the [privileged-plane trusted surfaces](../architecture/2026-08-18-privileged-plane-trusted-surfaces.md) default — identity's token extends it to any surface; a partitioned user is refused privileged methods even on loopback, so in passkey mode the token is how the operator works.
- **Per-user session partitioning** (not shared) — a session records a durable `owner` on its header at creation; `session.list`/`search` return exactly the requesting user's sessions; every other session-addressing RPC and the typert `session`/`agent` lookups answer `session-not-found` for a cross-tenant id, indistinguishable from an unknown id.
- **Operator bearer token** — `header`: none (`denyUnauthenticated: false`; a trusted-proxy request with no header is the operator tier). `passkey`: auto-generated on first boot when not configured, persisted in the state directory, printed once, and accepted as `Authorization: Bearer` from anywhere.

Two providers ship: **`header`** (default `x-forwarded-user`, honored only from a source allowlist, default `loopback`) and **`passkey`** (WebAuthn register/login under `/auth/passkey/*`, HMAC-signed session cookie, `denyUnauthenticated: true` — the gate rejects unauthenticated `/api` requests and WebSocket upgrades with 401, and the static `/auth` login page runs the ceremony). OIDC is deferred.

Enforcement points: the gate lives in `client-connection`'s `/api` route and both WebSocket upgrades (reading `ctx.identity.admit`); the admission rides an `AsyncLocalStorage` the downstream dispatch reads (`ctx.identity.current()` / `mayAccess` in the api-proxy and the session lookups); the mux/host streams take the upgrade-time owner as an explicit parameter because their listeners fire long after the request context unwinds. The browser connection half attaches a stored operator token (`localStorage['dsh.operatorToken']`) and redirects to `/auth/passkey/login` on 401. `dsh web` gains the `--identity header|passkey` flag family (`--identity-header`, `--identity-trusted-proxy`, `--identity-registration`, `--identity-rp-name`), plumbed through the web-app bundle patch.

Durable format: `SessionHeader` gains the optional validated `owner` string — JSONL header line and a new SQLite `sessions.owner` column (`SCHEMA_VERSION` 15→16). `SESSION_FORMAT_VERSION` stays `0` per the pre-release stance (no external consumers, no compatibility promise); the version note's writer-decides rule governs released readers.

## Alternatives considered

- **Keep the loopback pin and add no identity** — rejected: remote surfaces stay single-authority; the shared-gateway goal is unserved.
- **Trust the identity header from any source IP** — rejected: a direct caller could forge the header; the `trustedProxy` allowlist (default `loopback`) is what localterm's design uses.
- **Shared session pool with per-user metadata** — rejected: the whole point is partition; localterm partitions the registry by owner and surfaces cross-tenant ids as not-found.
- **A separate privileged plane for authenticated remote users** — rejected: localterm grants the privileged tier to the operator only (owner `null`); giving remote users a second privileged plane would widen the attack surface without a use case.
- **Gate only `/api`, not the WebSocket upgrades** — rejected: the mux/host streams leak session events and workspace snapshots, so a stream without the gate would defeat the partition.
- **`operatorToken` always auto-generated, even for `header`** — rejected: `header` has no gate (the proxy vouches), so a token would be dead config; localterm keeps `operatorToken: null` there.

## Consequences

- Without `identity` config the plugin provides nothing: every request is the operator tier and behavior is byte-identical to the pre-identity deployment.
- In passkey mode even the loopback browser must log in (passkey or operator token); the operator token is printed once at generation and stored under the harness home's `identity/` state directory (`auth-secret`, `users.json`, `credentials.json`, `operator-token`).
- Live `host/workspace-changed` pushes are operator-only; a partitioned user's workspace picker re-baselines through the filtered `workspace.list` RPC (documented in the package README's Known Limitations).
- Passkeys bind to the RP origin (loopback vs tailnet/portless surfaces need separate registrations; `127.0.0.1` is not a registrable RP ID).
- The earlier surface-resolution note's consequence "the privileged /api plane stays loopback-pinned" is superseded in two steps: this layer adds the operator bearer token, and the [privileged-plane trusted surfaces note](../architecture/2026-08-18-privileged-plane-trusted-surfaces.md) extends the surface grant to deployment trusted authorities; that note now cross-links here.
- Coverage: provider/cookie/allowlist/gate unit suites in the new package, `identity-gate.host.spec` (real identity plugin through the connection route), `api-proxy-identity.spec` (list/create/rename/mux/workspace partitioning over the real api-proxy), the client-half token/redirect spec, owner round-trips in the JSONL/SQLite persistence suites, and `identity-header.e2e.ts` (a real `dsh web` boot partitions listing/creation/history by the proxy header).
