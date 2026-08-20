# Agent Note: Panels available on the New Session page

Status: implemented

English | [中文](2026-08-20-panels-on-the-new-session-page.zh.md)

## Problem

The blank New Session page — the blank Session the New Session action opens before the first prompt — hid the whole session header and treated blank Sessions as non-owners of the Details region, so the bottom terminal and the right workbench were unreachable until the first message. The Details resize boundary's hover affordance was a 12x32 floating capsule, disproportionate next to the bottom split's 32x2 hairline, and the sidebar boundary had no affordance at all.

## Decision

- AppFrame: any current Session owns the Details region, blank Sessions included. Selecting a different Session — blank included — still closes Details before paint, and the no-session empty state still derives a zero rendered width without touching the stored preference.
- ConversationSessionHeader: blank heroes render a reduced header — the `conversation.session.header.utilities` seat only, right-aligned, without the title row, actions, tabs, or the bottom divider. One component, one `reduced` branch, so the same chrome serves the full session and the New Session page.
- session-log-export: the Session log button hides while the Session is blank, because no durable log exists to export.
- Both column boundaries share the bottom split's drag affordance: an 8px hit strip with a 2x32 hairline bar (`--dsw-alias-border-l3`) at vertical center that fades in on hover of the owning column, the strip itself, or a drag. This restores a sidebar indicator the [archived simplification](../../archived/simplification/2026-07-30-sidebar-resize-without-visible-pill.md) removed — the archived note's goal (no prominent capsule on the sidebar boundary) still holds because the hairline is as subtle as the bottom split's.

## Consequences

Users can open the bottom terminal and the right workbench directly from the New Session page. The terminal attaches to the blank Session where the host instantiates an agent for it; hosts without an agent (the replay scaffold) show the terminal's own error/empty state instead of hiding the panel. The reduced header drops breadcrumbs and actions; the workspace name stays visible in the hero chip, and the header grows to full chrome when the first message lands.

## Verification

The app-frame unit spec pins blank-Session Details eligibility and the close-on-change rule; the skeleton spec pins the utilities-only reduced header; the session-log-export spec pins the blank-hidden button. The keyless web lane extends `details-session-lifecycle` with the New Session panel flow (toggle reachable, right panel opens at the contract width, bottom panel toggles) and refreshes the handles, lifecycle-chrome hero/plan-active/reloaded, goal-command, and agent-preset header goldens to the current header composition (Files action, panel toggles, reduced hero banner).

## Alternatives considered

**Show the full header on the blank hero.** Rejected: product wants only the two panel buttons, without the menu border, breadcrumbs, or actions.

**Move the panel toggles into the hero body.** Rejected: the header utilities are their established home and the header is already mounted for the Session; duplicating the toggles would split one gesture across two surfaces.

**Hide the Session log by filtering the utilities seat in the header.** Rejected: the utilities seat is a list of independent registrants; each entry knows its own validity, and a blank Session has no durable log regardless of who renders the seat.
