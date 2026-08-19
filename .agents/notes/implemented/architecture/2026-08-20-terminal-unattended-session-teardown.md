# Agent Note: Terminal unattended session teardown

Status: implemented

English | [中文](2026-08-20-terminal-unattended-session-teardown.zh.md)

## Problem

Browser terminal sessions are persistent by design: a viewer detach removes only that stream tap, so the PTY survives panel toggles, browser closes, and viewer handoffs. Nothing bounded that persistence. A viewerless PTY whose foreground process kept producing output (a runaway `watch`, `yes`, or TUI refresh loop) burned CPU indefinitely on the host; the bounded scrollback capped memory but not process resources, and a spawn whose handshake died before the first attach leaked a shell that no later path would ever close.

## Decision

Interactive-mode sessions (spawned with `interactive: true`; attachment-only, since `startSend` rejects them) arm an unattended-exit deadline at spawn. A viewer attach clears it; the last viewer detach re-arms it; a fire rechecks that no viewer exists and the session is still running and not closing before calling `close('unattended')`, which reuses the existing quiescent teardown. Controlled (model) sessions never arm the deadline. The window is the `unattendedExitMs` config field, defaulting to 30 minutes with `0` disabling the policy; validation accepts non-negative safe integers only.

## Alternatives considered

**Kill on last detach.** Reclaims immediately but destroys the shared-persistence feature: closing a panel to switch viewers would end the shell, and the settled-session workflow expects terminals to outlive individual views.

**Idle-based exit (no output for N).** Preserves a detached long build, but the motivating case is a viewerless process that keeps producing output — idle detection never fires for it, so the runaway CPU consumption remains.

**Pause PTY reads while viewerless and saturated.** Backpressure would freeze runaway processes but also freeze legitimate detached background commands the user left running on purpose, and it changes read semantics the subprocess provider owns. Teardown leaves provider semantics untouched.

**A service-level sweeper.** One global timer scanning all sessions rechecks every session on each tick instead of one deadline per session, and removes per-session control. Per-session deadlines scale with the number of sessions and nothing else.

## Consequences

Orphaned browser PTYs are reclaimed after the unattended window even when a foreground process keeps producing output. A detached command running longer than the window is killed with the session — the documented trade-off, configurable or disablable per deployment. Model sessions and the existing send/readiness paths are untouched.

## Verification

`session.spec.ts` pins spawn-arming, attach-clear, detach-re-arm, natural-exit no-op, `0` disables, and controlled-mode exemption with fake timers; `config.spec.ts` pins the zero, negative, and fractional validation cases.

## Related

[Terminal latency parity](2026-08-19-terminal-latency-parity.md) owns the output scheduling and viewer fan-out mechanics that this teardown bounds in time.
