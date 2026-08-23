# Agent Note: Searchable mobile model picker

Status: implemented

English | [中文](2026-08-23-searchable-mobile-model-picker.zh.md)

## Problem

The composer model trigger sits at the trailing edge of its control row. Its right-anchored menu used content width with only a maximum, so long model names could place the menu's left edge outside a phone viewport. Large provider catalogs also required scanning every group and display name even when the user knew a model id.

## Decision

The model menu uses a viewport-relative width capped at 420 px and keeps 12 px clearance from each horizontal edge by measuring its rendered card and translating only when the right anchor would clip it. The existing anchored-height hook continues to bound upward growth above the composer and remeasures on viewport scroll or resize.

The model pane starts with an automatically focused client-side search field. A case-insensitive substring query filters model id, display name, provider display name, and description while preserving provider and model order. Matching rows show a distinct id when it differs from the display name; an empty result has its own message, and Enter selects when exactly one model remains. Closing the menu or leaving the model pane clears the query.

## Alternatives considered

**Only clamp the menu width.** A width cap prevents an oversized card but does not correct a right-anchored card whose left edge is already outside a narrow viewport, and it leaves large catalogs unsearchable.

**Search through a host RPC.** The complete advisory catalog is already loaded for selection. A request per query would add latency, cancellation, and failure states without reducing the initial catalog payload.

**Replace the two-level picker with the command palette.** That would remove the model/effort relationship from the composer control and make reasoning effort selection a separate interaction.

## Consequences

The model pane stays on-screen at phone widths and model ids become directly searchable without changing selection or catalog contracts. Filtering is linear in the loaded catalog and remains ephemeral browser state. Unit tests pin matching, autofocus, empty results, and one-result Enter; the assembled 390×844 browser scenario pins the visible menu and control geometry.
