# Agent Note: Client settings plane follows operator-eligible surfaces

Status: implemented

English | [中文](2026-08-21-client-settings-plane-operator-eligible.zh.md)

## Problem

The [privileged-plane trusted-surfaces decision](../architecture/2026-08-18-privileged-plane-trusted-surfaces.md) admitted the whole configuration plane — `settings.*`, `credentials.*`, `host.*`, agent-preset authoring — at the /api fence from the deployment's trusted surfaces (tailnet, portless, `--trusted-host`), and promised that `dsh web --portless`/--tailnet surfaces could load and save the Models provider directory. The fence half shipped; the browser half did not. The client settings transport was still gated on `connection.isLoopback`, which classifies only exact `localhost` / 127/8 / `[::1]` hostnames (`isLoopbackHostname`): on `https://dsh.localhost` (the portless alias, which resolves to loopback) and `https://<node>.ts.net`, the describe mirror stayed process-local ('memory'), never issued `settings.describe`, and the Models page failed with "Loading the provider directory failed: settings are unavailable in this browser". The fence was never the blocker — `llm.providers` (not privileged) succeeded from those surfaces; the client simply never asked.

## Decision

The /api carrier annotates each `host.describe` answer with the request's operator-eligibility verdict: `operatorEligible`, computed with the exact admission expression the privileged gate uses (owner null AND (operator bearer token OR trusted surface)). Raw and in-process carriers leave the field absent. `ctx.connection.isOperatorEligible` is tri-state: loopback is `true` from boot, a non-loopback page is `undefined` until its handshake resolves to the annotated `true` or `false`, and generation loss returns it to `undefined` with the description. Pending is distinct from refusal so first-paint consumers never treat a trusted surface as terminally ineligible before its verdict arrives.

`dsh-client-ui-settings` constructs the describe mirror and every bound scope against this source instead of a construction-time host/memory choice. A pending non-loopback verdict keeps the unanswered mirror on `loading` and sends no privileged read; `true` starts one read, while explicit `false` parks it on `unavailable` (the friendly "settings are unavailable in this browser" state) with writes inert. A held view survives generation loss. The pending state also keeps settings-backed onboarding undecided, so a trusted tailnet or portless page reads its durable acknowledgement before deciding whether to block the application. The settings document-open action and the deliverables native-open gate follow the same plane.

## Alternatives considered

**Classify `*.localhost` as loopback.** Rejected — security-pinned by `loopback-hostname.client.spec.ts` (`remote.localhost` must stay false): a blanket grant would let ANY local page under a `.localhost` name reach the privileged plane without the deployment naming it, which is exactly the trust boundary the derived-authority flow exists to keep.

**Always attempt the reads and map the 403 to "unavailable".** Rejected: conflates a transient read failure with terminal ineligibility, makes every untrusted boot send a privileged probe, and surfaces transport-error copy in place of the deliberate terminal state.

**Publish the trusted-authority list in the boot payload and compute eligibility client-side.** Rejected: changes the `__DSH_BOOT__` wire type and misses the operator-token case; the server already computes the per-request verdict, so a handshake annotation is one field.

## Consequences

`host.describe` gains an optional `operatorEligible` field, annotated per request by the /api carrier only. `dsh web --portless` (`https://dsh.localhost`) and `--tailnet` surfaces now load and save the Models provider directory, edit settings, manage credentials, and open the settings document without an identity provider — the GUI consequence the 2026-08-18 decision recorded. Untrusted origins keep the terminal unavailable state and never send a privileged read. The loopback cold-boot describe budget is unchanged (the mirror still reads once eagerly and once on the first connection). Package READMEs (ui-settings, ui-settings-general, ui-workspace, locale, ui-theme, ui-deliverables, connection) updated the "remote browsers are loopback-only" wording. Coverage: node-half host spec asserts the per-request annotation for trusted and loopback authorities and the 403 for undeclared ones; connection client spec asserts the boot fact and the handshake flip; ui-settings mirror/scope specs cover the ineligible terminal state, the flip-on read, and the held-view pause; the web e2e `trusted-surface-settings` boots the GUI under `dsh.localhost` as a trusted authority and sweeps every settings section (General, Models, Plugins, Agent presets) asserting each loads and the provider-directory failure never appears, and the tailnet e2e asserts the annotation through the derived authority.
