# Agent Note: Web UI workbench

Status: implemented

English | [中文](2026-08-18-web-ui-workbench.zh.md)

## Problem

The layout had a resizable Details column, but `ui-conversation` occupied the whole slot with one selected-Tool reader. The reader had no assembled entry gesture because Tool **Inspect** switched the center to Trajectory instead. Adding Files, changes, Agents, or terminal views would therefore require replacing the inspector or centralizing unrelated business data in the conversation package. The concession solver also resolved an explicitly open Details preference to zero below the inline width floor, making any future panel action invisible on compact viewports.

## Decision

`ui-workbench` occupies the layout-owned `details` slot and declares the session-scoped `workbench.surface` list. Each feature registers its own list entry with a stable id and locale-following label. The workbench projects that ledger into available surfaces, keeps open and active branded ids in a per-session entry store, and exposes `ctx.workbench.open(id)` for feature gestures. The service rejects an unregistered id before changing layout state.

`ui-conversation` registers **Inspect** with the existing chat store and declares `conversation.details.tool` beneath that entry. Tool **Inspect** selects the call and opens this surface. The inspector retains Input/Output fallback behavior and offers an explicit **View in Trajectory** handoff, so the workbench does not absorb Trajectory's event-ledger role.

`ui-deliverables` registers **Changes**. Its existing Turn Definition validates successful result-time diff intent, publishes mutation groups through a dedicated incremental `deliverables` Conversation target, and marks a Produced Files row only when its closing boundary has a rendered change. **View changes** opens the tab. The panel reports the loaded Session window; it does not claim Git working-tree state.

Layout passes `column` or `sheet` through the Details owner share. The Workbench fills the inline resizable column when it fits. If an explicitly open preference is concession-resolved to zero, the same component renders through the shared right Sheet while the conversation keeps the complete frame width. Closing either mode uses the layout-owned callback. Tabs survive that host-mode flip and remain transient across reloads.

The tab hierarchy and Sheet interaction adapt T3 Code `RightPanelTabs.tsx`, `RightPanelSheet.tsx`, and `rightPanelStore.ts` at revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`. DSH keeps Cordis slot registration, session store lifecycle, and feature-owned data instead of T3's route and Zustand state.

## Verification

Per-file coverage pins the workbench store, surface projection, service, shell, registration teardown, responsive Sheet, deliverables Definition, incremental target, and Changes presenter. The keyless Web snapshot boots the shipped Loader composition over a recorded mutation Session, opens Changes from the Turn tail, adds Inspect from the Tool row, and verifies inline and compact hosting.

## Alternatives considered

**Keep one Details occupant.** This preserves less shell code but forces each new right-panel feature to replace the selected-Tool reader or makes `ui-conversation` a registry and data owner for unrelated domains.

**Put every right-panel view in ui-workbench.** A central component could switch on known ids, but plugin disposal would not remove feature code or state, and adding a surface would require editing the shell.

**Ship Files and repository Diff with the shell.** A real explorer needs a session-authorized filesystem contract, and repository diff needs a Git capability. Reusing the directory-picker API would list directories only and bypass the execution filesystem's policy and provider choice.

## Consequences

The Details region is an additive, HMR-safe plugin host; Inspect and loaded mutation Changes coexist without coupling their data. Compact users can reach the same tabs without sacrificing Chat width. The cost is another client plugin and service plus per-session transient tab state. Files, interactive Terminal, Preview, Agents, and Git Diff remain separate feature work rather than placeholder tabs.
