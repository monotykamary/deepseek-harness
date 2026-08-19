# Agent Note: Background tab graph recovery

Status: implemented

English | [中文](2026-08-19-background-tab-graph-recovery.zh.md)

## Problem

Chromium can suspend a background tab's EventSource. If the development Host restarts or rebuilds several client plugins during that suspension, the tab misses ordered HMR frames. Reconnecting to the current stream cannot replay those frames, and a later dependent reload can dispose the root slot provider without successfully reconstructing it, leaving a blank application canvas.

## Decision

The HMR browser compares every connect-time `graph` frame with the complete graph revision embedded in `window.__DSH_BOOT__`. Equal revisions continue with ordinary per-plugin HMR. A differing revision reloads the document once, obtaining one coherent manifest and complete bundle roster from the current Host. The non-reloadable Web boot kernel also observes its owned mount point child list and document visibility: an empty `#root` reloads immediately while visible or upon becoming visible after a hidden failure because either state violates the AppRoot lifetime invariant. Recovery remains active even if the reloadable HMR plugin itself was lost.

Graph revision is authoritative for stream consistency, and the shell-owned AppRoot child is authoritative for render lifetime. Visibility duration, EventSource error timing, and individual module responses do not trigger recovery; they cannot prove a missed graph or a lost root.

## Alternatives considered

**Replay missed rebuild frames.** The SSE endpoint retains no ordered event log, and adding one would require sequence ids, bounded retention, reconnect cursors, and compatibility handling solely for development HMR.

**Reload on every visibility change or SSE reconnect.** This would discard valid browser state whenever a tab is backgrounded without any graph change or a proxy reconnects an otherwise current stream.

**Retry only the missing root provider.** A revision mismatch can span any provider and its dependency cascade; reconstructing one visible slot can leave the runtime graph internally inconsistent.

## Consequences

A stale or rootless tab recovers automatically instead of remaining blank. Recovery intentionally discards plugin-local React state when the complete graph differs, while equal-revision reconnects preserve it. Unit coverage pins revision comparison, and browser verification covers a Host restart followed by EventSource reconnect.
