# Agent Note: Connection reconnect pause in hidden tabs

Status: implemented

English | [中文](2026-08-20-connection-hidden-tab-reconnect-pause.zh.md)

## Problem

The ConnectionController reconnect loop retried a lost connection forever with jittered exponential backoff capped at ten seconds, regardless of tab visibility. A backgrounded tab with an unreachable host re-established both event streams plus `host.describe` several times per minute indefinitely — CPU, battery, and host load spent on retries that no one observes. The same loop had a second lifecycle gap: `stop()` aborted the active generation but not the pending backoff sleep, so shutdown during backoff waited out the remainder of the delay, and a fast `stop()` + `start()` let the still-sleeping loop wake into the restarted controller and open a second concurrent generation.

## Decision

A hidden document (`document.visibilityState === 'hidden'`) replaces the backoff sleep with a wait for `visibilitychange`; becoming visible reconnects immediately because the delay already elapsed while hidden. The first attempt of a started controller always runs, so a tab booted or restored in the background still performs its initial handshake. Environments without a document (node tests, non-browser carriers) behave as visible. `stop()` aborts one shared `AbortController` covering both the backoff sleep and the visibility wait, and bumps a loop epoch; `start()` runs the new loop under a fresh epoch, and the loop rechecks the epoch after every await that a restart can follow, so a stale loop parked in a wait can never reopen streams after a restart.

## Alternatives considered

**Slower backoff while hidden, instead of pausing.** The loop still retried on a timer, so hidden tabs kept paying background traffic and CPU, and any chosen cap remained arbitrary. Pausing drives hidden-tab reconnect attempts to zero, which is the whole win.

**Pausing the first attempt too.** A tab restored or opened in the background would sit unconnected until focused. The boot sequence already tolerates an unconnected state, and the single initial attempt is the cheapest possible probe; first-attempt-always keeps it.

**A `pauseWhileHidden` config knob.** No current consumer needs the escape hatch, and the pause is a battery/latency invariant rather than a deployment-varying tunable. The knob can be added later with a real consumer.

**Backoff-timeout-only stop, no epoch.** Aborting the sleep fixed prompt shutdown but not the stale-loop race: a loop woken by the abort could re-enter its run check after a restart and double up. The epoch guard closes that window by construction.

## Consequences

Hidden tabs make zero reconnect attempts while hidden; a tab returned to visibility reconnects at once, so the user never observes a stale `reconnecting` state longer than the current handshake. `stop()` now settles promptly from any loop state, and a restart can never race a second generation. The controller's public surface is unchanged: the epoch and the visibility wait are instance-private, and the two new helpers are module-local.

## Verification

`connection.client.spec.ts` pins the hidden pause (no retries across several backoff windows, immediate retry on visibility), stop-during-hidden-pause (no retry after stop plus visibility), and the restart-during-backoff hazard (one live generation after the abandoned backoff window has passed). Existing reconnect, state-deduplication, and sink-isolation cases pass unchanged.

## Related

[WebSocket downlink carrier](2026-08-04-websocket-downlink-carrier.md) owns the two-socket physical layout whose generation failures feed this loop; the reconnect-and-rebuild resync policy is [gui layering and RPC protocol](2026-07-19-gui-layering-and-rpc-protocol.md).
