# Agent Note: Web remote-surface resolution (tailnet and portless)

Status: implemented

English | [中文](2026-08-17-web-remote-surface-resolution.zh.md)

## Problem

`dsh web` bound loopback-only and announced one URL. Reaching the GUI through `tailscale serve` (Host = the ts.net name) or the portless HTTPS alias (`dsh.localhost`) failed the /api browser-trust fence with 403 on every RPC: the browser loaded the static shell, but the session list and every other API call were refused, because the fence trusts only loopback plus explicitly declared `--trusted-host` authorities.

## Decision

The `web-runtime` glue plugin gains `tailnet` and `portless` config flags (CLI `--tailnet` / `--portless`, default off). After the Loader tree settles — the bound port and the connection fence owner exist by then — `resolveRemoteSurfaces()` (src/surfaces.ts) probes in parallel: `tailscale serve status --json` plus `tailscale status --json` derive the node DNS name (canonical 443 Web handler or a TCP HTTPS listener, bound port preferred), and `portless alias dsh <port> --force` plus a loopback :443 liveness probe (either IP family) derive the `dsh.localhost` surface. Every probe is best-effort environment detection, not configuration validation: a missing binary, offline node, unmatched route, or dead proxy produces a boot-log warning and no surface — never a failed boot, and resolution never rejects. Derived authorities enter the fence through the new `HostConnectionHandle.addTrustedAuthority()`, which runs the same `assertTrustedAuthority` validation as config and pushes into a live per-request-read list the /api route and WebSocket upgrades close over (the route previously captured the config array, which late adds could not reach). The fence itself is unchanged from the [browser-trust boundary decision](../architecture/2026-07-28-api-browser-trust-boundary.md): this adds a late-bound authority entry, not a second policy. A derived authority failing validation is dropped from the announcement with a warning instead of silently widening trust. The URL line always leads with the canonical `http://127.0.0.1:<port>` (supervisors parse that prefix) and appends `LAN`, `tailnet`, and `portless` entries as they resolve.

## Alternatives considered

**Derive authorities into `webRuntime.trustedHosts` before the connection row applies.** Rejected: surface resolution is async (binary probes) and completes after the connection row has read the static lazy-config expression; a mutable service list with an explicit add method keeps one owner and one commit point.

**Trust derived names without validation.** Rejected: tooling output is an untrusted boundary like config; `addTrustedAuthority` reuses `assertTrustedAuthority`, so a non-canonical name is refused loudly instead of broadening trust.

**Fail the boot when a requested surface's tooling is absent.** Rejected: the flags name opportunistic deployment surfaces, not required referents; localterm's own resolution warns and falls back, and a hard failure would take the loopback GUI down with a missing third-party binary.

**Expose the GUI by binding all interfaces (`--host 0.0.0.0`).** Already refused by the CLI for safety. The surface flags preserve the loopback bind and front it through `tailscale serve` or the portless proxy — the remote-access posture localterm uses.

## Consequences

- `dsh web --tailnet` resolves, trusts, and announces `https://<node>.ts.net` (any serve port); `--portless` does the same for `https://dsh.localhost`. Both flags off leaves behavior byte-identical: no probes, unchanged URL line.
- The privileged /api plane stays loopback-pinned: a tailnet or portless authority reaches ordinary RPC only, per the fence's posture until a real authentication layer exists.
- `HostConnectionHandle.addTrustedAuthority` is the late-bound entry the identity layer can reuse for derived authorities.
- Coverage: surfaces.spec (probe matrix and warning paths), web-app.spec (settlement, fence add, URL line, refusal), node-half.host.spec (live-list fence and validation). Assembled-app proof: tailnet-surface.e2e shims `tailscale` on PATH in a real boot and asserts the derived name passes the fence while an underived authority still 403s.
