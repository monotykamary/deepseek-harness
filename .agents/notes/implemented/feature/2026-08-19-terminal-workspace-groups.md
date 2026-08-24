# Agent Note: Terminal workspace groups

Status: implemented

English | [中文](2026-08-19-terminal-workspace-groups.zh.md)

## Problem

A terminal-specific tab row nested inside the Workbench tab row presented the same panel hierarchy twice. It also made New Terminal look like a pane-local action even though a new right-side terminal is another peer panel. Horizontal and vertical splits still need a distinct group-local destination.

## Decision

Workbench surface registrations remain static plugin declarations, but a presentation may declare itself repeatable. The per-Session Workbench store then owns panel instances over that one registration. Each instance has a stable, gap-reusing ordinal, renders through the registered surface id, and receives its ordinal as an owner prop. `openNew(sessionId, id)` creates a peer panel in the named Session, while `ensureCount(sessionId, id, count)` restores enough panel instances for already-running resources without dynamically registering application data as slots.

`ui-terminal` marks its right-side surface repeatable. Each right-side terminal group maps directly to an outer Workbench panel labeled Terminal 1, Terminal 2, and so on; New Terminal requests another Workbench panel. On restoration, panel ordinal N attaches running terminal N, and the first discovery for a Session ensures that every running terminal has a panel exactly once; later active-panel switches cannot recreate a panel the user closed. The bottom placement continues to expose groups in its compact tree, where New Terminal adds a pane to the active group. Horizontal and vertical split controls always add a pane to the active group in either placement, with three panes as the visual maximum.

Each mounted pane owns an independent WebSocket attachment and xterm surface. Closing a Workbench panel unmounts its browser attachment without killing the Host PTY; reopening its reusable ordinal can attach through bounded Host replay. Each open Workbench panel retains its full-size body and xterm DOM; inactive bodies are invisible and inert, so ordinal switches expose an already attached terminal without an intermediate canvas, list request, or reconnect. Initial Host-list discovery and connection setup stay visually blank until ready; a resolved empty list and connection errors remain visible and actionable. Pane selection transfers input focus and Host resize-owner activity. Fullscreen changes only CSS presentation, so attachments and xterm instances remain mounted while the terminal expands and restores. The group shelf reserves the complete width of its controls, including the bottom-only Close action, so showing split panes cannot clip Expand/Restore or toolbar actions; both placements use the same indented guide plus pill-like Group heading. Without a shelf, the floating actions default to one chevron and disclose always-mounted inert controls through a 200 ms width and opacity transition for hover, click, or keyboard interaction; pointer leave and outside input collapse them, and reduced-motion clients skip the transition. Each action button owns a persistent separator instead of depending on sibling adjacency, so Tooltip's temporary fixed sibling cannot shift toolbar geometry. The xterm surface uses one inset on all four edges, keeping its visible outer gutter symmetric. xterm's width-reserving scrollbar stays disabled; an implicit overlay thumb appears only above the buffer bottom and supports pointer paging and dragging without changing the fitted column count.

The group tree, split controls, and compact segmented actions adapt T3 Code revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`, principally `ThreadTerminalDrawer.tsx` and `terminalUiStateStore.ts`; [`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) retains the complete MIT notice.

## Alternatives considered

**Nest terminal tabs inside the Workbench panel.** This duplicates the existing panel hierarchy and makes a peer terminal look subordinate to the active Terminal surface.

**Dynamically register one Workbench surface per PTY.** Workbench registrations are plugin declarations with effect lifetimes, not per-Session application data. Repeatable instances preserve that ownership while allowing several panels over one declaration.

**Treat every split pane as an outer panel.** This prevents simultaneous terminal splits and gives horizontal and vertical actions no group-local destination.

## Consequences

Right-side creation produces peer Workbench panels, bottom-panel creation remains group-local, and split actions remain pane-local in both placements. Hidden right panels retain their browser attachments and xterm DOM; closing a panel releases its attachment while preserving the Host process. Focused coverage pins repeatable panel creation, ordinal restoration, exact panel activation, split directions, fullscreen restore, implicit scrollbar visibility and pointer behavior, independent IO, exit, retry, and teardown; the assembled interactive-terminal browser journey covers the real Host path and zero-width-reservation scrollbar geometry.
