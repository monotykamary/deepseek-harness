# Agent Note: T3-adapted Web sidebar hierarchy

Status: implemented

English | [中文](2026-08-18-t3-adapted-web-sidebar.zh.md)

## Problem

The Web sidebar exposed the right DSH operations but flattened their hierarchy: New Session was an elevated capsule, search was hidden behind an expanding icon, and compact one-line Session rows could not show Workspace context, title, execution preset, live status, and time together. T3 Code demonstrates a calmer navigation hierarchy with persistent search, an explicit project scope, stable multi-line thread cards, and surfaces reserved for hover, focus, and route selection.

Copying T3's monolithic Sidebar would bypass DSH's runtime slot composition, typed object layer, Workspace grouping, durable drag accounts, and locale/plugin ownership. The adaptation therefore needs to preserve DSH behavior while making the visual hierarchy and interaction rhythm coherent.

## Decision

`ui-sidebar` keeps ownership of the resizable column, collapse state machine, identity, New Session, browser slot, and footer slots. Its expanded chrome uses an 8px content rhythm, a 48px identity row, 32px controls with 8px radii, and one quiet New Session row. The wordmark is identity-only rather than a second New Session action; the existing 56px rail and slide/crossfade remain DSH behavior.

`ui-workspace` renders a persistent 32px Search row followed by an All Workspaces or All Sessions scope row containing View options and Add workspace. Search keeps the existing immediate metadata filter, 250 ms abortable content request, 500 UTF-16-code-unit bound, stale-result rejection, and query persistence across collapse. The rail Search control expands the column and focuses the mounted field after the 300 ms slide.

Every visible Session uses one minimum-78px card in grouped and flat modes. `SessionNode` projects the Workspace label and optional agent preset from the runtime `SessionSummary`; the card renders Workspace plus primary status or time, durable title, then preset plus time. Pending interaction, running, descendant activity, and unviewed completion retain their existing precedence. Hover or keyboard focus swaps only the trailing status seat for actions, and the selected route uses the active-row role, so text does not move when interaction chrome appears.

`ui-theme` owns four shared roles in both palettes: sidebar control fill, icon ink, row hover, and row active. Feature CSS consumes those roles without literal colors or theme selectors. The roles and hierarchy adapt T3 Code revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`; [`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) retains the complete T3 MIT permission and warranty text.

## Testing

Sidebar and Workspace component suites pin identity-only branding, one New Session action, light/dark token pairs and consumers, persistent Search, rail focus, card metadata, status precedence, action menus, drag behavior, and collapse snapshots. The lifecycle browser replay records the assembled sidebar's Search, All Workspaces, and Session card semantics through the real Web profile; live Chromium checks cover dark/light selected cards and the restored collapsed rail.

## Alternatives considered

**Copy the T3 Sidebar component and dependencies.** T3's component combines routing, projects, thread lifecycle, Electron chrome, stores, Tailwind, and UI primitives in one tree. Importing it would create a second composition and state system instead of adapting the interaction model to DSH slots and runtime hooks.

**Restyle the compact rows without changing markup.** CSS alone cannot make Search persistently focusable or give Workspace, status, title, preset, and time independent truncation and action seats. It would reproduce colors while retaining the hierarchy problem.

**Flatten all Workspaces into one T3-style thread stream.** DSH Workspace rows own create, rename, delete, expansion, Host-durable Workspace order, and per-account Session drag semantics. Removing those rows would hide current product operations or move them into a new selector with no present need.

**Keep the wordmark as a second New Session shortcut.** Identity and creation would remain two indistinguishable controls with the same accessible name. One dedicated action is clearer and matches the adapted menu hierarchy.

## Consequences

The sidebar exposes search and project scope without an extra gesture, selected and running work read as cards, and the same card remains understandable when grouping switches to flat. Business data and actions stay in the runtime and Workspace plugin; the presentation rewrite adds no subscription, store, wire field, or session event.

Cards show fewer Sessions per viewport than 32px rows, so the existing five-row group limit and Show more control matter more. Grouped mode repeats Workspace context inside each card, trading some density for a stable card identity shared with flat mode and search. The generated notice is the legal source of truth for both the command palette and sidebar adaptation.
