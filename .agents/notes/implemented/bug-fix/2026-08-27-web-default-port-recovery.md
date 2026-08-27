# Agent Note: Web default port collision recovery

Status: implemented

English | [中文](2026-08-27-web-default-port-recovery.zh.md)

## Problem

The Web profile prefers loopback port 3080, but a long-lived or separately launched Web process can already own that port. The carrier then rejected the entire Loader tree with EADDRINUSE, even though the Web profile can safely use another loopback port and already reports its bound URL after startup.

## Decision

The webserver config adds optional `busyPort: 'error' | 'random'`, defaulting to `error` so generic carrier consumers retain fail-loud binding semantics. `random` retries exactly once with port 0 only after EADDRINUSE; the retry uses the same bind host and the live `ctx.webServer.port` exposes the actual result to URL display, trust derivation, and consumers.

The Web startup provider selects `random` when `--port` is omitted and selects `error` when `--port` is explicit. The shipped Web patch passes that policy into the carrier. Thus `dsh web` keeps the 3080 preference, recovers from a busy default, and prints the alternate URL, while an explicitly requested port remains an exact requirement.

## Alternatives considered

**Always change the default to port 0.** Rejected because 3080 remains the stable preferred URL when available and remote-surface integrations should continue to see the configured default.

**Probe the port before Loader activation.** Rejected because a preflight check has a time-of-check/time-of-use race; the bind operation must be the authority that decides whether the port is available.

**Retry every configured port.** Rejected because an explicit `--port` is an operator requirement and silently changing it would hide deployment mistakes.

## Consequences

A second ordinary Web launch no longer fails solely because the preferred local port is occupied; its URL line and bind-dependent surfaces use the actual OS-assigned port. Other WebServer consumers must opt into `busyPort: 'random'` if they want this recovery, and non-EADDRINUSE listen failures remain fatal.
