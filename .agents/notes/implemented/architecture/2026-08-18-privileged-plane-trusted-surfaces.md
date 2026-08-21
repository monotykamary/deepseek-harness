# Agent Note: Privileged plane trusts the deployment's surfaces

Status: implemented

English | [中文](2026-08-18-privileged-plane-trusted-surfaces.zh.md)

## Problem

`dsh web` reaches remote surfaces (tailnet, portless, `--trusted-host`) that pass the ordinary `/api` browser-trust fence, but the privileged method plane (`PRIVILEGED_METHODS` in `packages/client/connection`) refused every one of them: the gate re-ran the fence with an empty trust list, pinning settings, credentials, native dialogs, and the agent-preset authoring calls to loopback. A deployment that reached its own GUI over `https://dsh.localhost` or `https://<node>.ts.net` could list sessions but could not load or save the Models provider directory (`settings.describe`), edit any settings namespace (`settings.update`), manage credentials, or author agent presets — every such call answered HTTP 403. The [web identity layer](../feature/2026-08-17-web-identity-sso.md) added one sanctioned remote path (the operator bearer token), but with no identity configured the configuration page had no working surface at all. The passkey login also traps a first-time operator: registering or logging in with a passkey creates a partitioned user, whom the plane refuses even on loopback — only the login page's operator form stores the token.

## Decision

Admit the privileged plane like the ordinary fence: **loopback or any authority in the deployment's live trusted list** (`trustedHosts`, or the tailnet/portless authorities `dsh web` derives), plus the existing operator-bearer-token grant when an identity authority is configured. The gate now reads `connection.trustedAuthorities` instead of a hard-coded empty list, so late-bound derived surfaces take effect without a restart. Two invariants stand: a **partitioned user** (session owner non-null) is refused privileged methods even on loopback, and the outermost DNS-rebinding and cross-site markers still bind every caller — the grant is the surface the deployment named, not a new authentication layer.

The grant is deliberate: `--tailnet`, `--portless`, and `--trusted-host` are explicit operator choices, and the cross-site fence keeps a malicious remote page out. The deployment gives up reachability from other principals: any device that can reach a trusted surface (for example another machine on the tailnet) can read and mutate settings and credentials, drive host dialogs, and issue `llm.discoverModels` probes, on the same trust the deployment already extended to ordinary RPC. Deployments that need per-user boundaries keep them with an identity provider — partitioned users are still refused the plane entirely.

## Alternatives considered

- **Keep loopback-only and fix the UX** — rejected: the Models/settings page had no working remote path without configuring identity, and the passkey login traps users into a partitioned session that is refused even on the intended surface.
- **Relax only when no identity is configured** — rejected as an unstable posture: the plane's shape would flip on a config change, and the operator token is already the identity-aware escape hatch.
- **Add a separate privileged plane for partitioned users** — rejected: the [identity SSO note](../feature/2026-08-17-web-identity-sso.md) already refuses this; it would let one tenant read or mutate another's settings and credentials.

## Consequences

- `dsh web --tailnet`/`--portless` surfaces can now load and save the Models provider directory and use all `settings.*`, `credentials.*`, `host.*`, and agent-preset authoring calls without an identity provider.
- A configured identity provider narrows the surface: partitioned users (`owner` non-null) are refused everywhere; the operator tier keeps loopback, every trusted surface, and the operator bearer token.
- The surface-resolution and identity-SSO notes' "the privileged /api plane stays loopback-pinned" consequences are superseded; both cross-link here.
- Coverage: node-half.host.spec asserts a declared authority now reaches every privileged method while an undeclared one still 403s; identity-gate.host.spec adds the legacy-tier trusted-surface grant and keeps the partitioned-user refusal.
- The browser half of the plane — the settings transport and its consumers following the handshake's operator-eligibility verdict instead of the loopback hostname classifier — is recorded in [client settings plane follows operator-eligible surfaces](../bug-fix/2026-08-21-client-settings-plane-operator-eligible.md).