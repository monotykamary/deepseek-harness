# Agent Note: Sidebar row settle/snooze quick actions and right-click menus

Status: implemented

English | [中文](2026-08-19-sidebar-row-settle-snooze-context-menu.zh.md)

## Problem

The sidebar Session cards port T3 Code revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2` (cards, project context, settled shelf), but the port dropped the row's two hover quick actions — **Settle** (check) and **Snooze** (clock) — and kept dsh's ellipsis button as the only row menu trigger. The user asked for those buttons back and for the ellipsis to go away in favor of a right-click menu.

## Decision

Add the manual lifecycle to the workspace browser as browser-persisted view state, and move every row menu to the pointer.

- **Settle / Un-settle** are shelf-membership overrides in the persisted `WorkspaceViewState` (`dsh.workspace.view.v6`): `explicitlySettledSessionIds` parks a Session in the same settled shelf the inactivity policy uses; `pinnedActiveSessionIds` un-settles an auto-settled row back into the active list (T3's `settledOverride: 'active'`). The effective settled set is `(autoSettled ∪ explicit) − pinned`. Settling clears any snooze (settle parks for good); the store mutators initialize their collections lazily because older rehydrated blobs lack the fields.
- **Snooze / Wake** are wake-time records: `snoozedUntilBySession` hides the row in its own collapsed **Snoozed** shelf (between the active list and the settled shelf) until the wake preset — in 1 hour, in 3 hours, this evening (only while >1h before 18:00), tomorrow 9:00, or next Monday 9:00 — resolved at open time through the app dictionary (`snooze.ts`, HH:mm like the hover-card clock, no browser-locale formatting). A still-snoozed row shows a blue countdown instead of its relative time plus a **Wake now** hover action; once the wake passes, the row returns with an amber **Woke** pill that dismisses on click or on visiting the Session. A pending interaction wakes a snoozed row early, and blocked-on-you rows (pending interaction) get neither settle nor snooze: parked work is never hidden. The minute-quantized clock additionally re-renders exactly at the earliest future wake deadline, so the Woke flip is not delayed by up to a minute.
- **Quick actions** replace the trailing status seat on hover only (the T3 cross-fade): Settle + Snooze on active rows, Un-settle on settled rows, Wake now on snoozed rows. The snooze clock opens a preset popover (the `Menu` primitive, portaled, presets resolved at open time).
- **Right-click menus** replace both ellipsis triggers. Workspace rows open rename/delete at the pointer; Session rows open rename/fork/archive plus the lifecycle items (Snooze as a preset submenu; Settle/Un-settle/Wake per row state) via the `Menu` primitive's `getAnchorRect` portaled mode with a zero-size pointer rect. The ungrouped bucket keeps the browser's default menu. Hover-card and hover-action pinning reuse the existing `menuOpen` class for both the context menu and the snooze popover.
- **Icons**: the lifecycle glyphs are lucide-react (`Clock`, `Check`, `Undo2`, `AlarmClock`, `AlarmClockOff`) exactly as the T3 sidebar draws them — the snooze clock sits first in the hover seat, followed by the labeled Settle button (icon + text). No new `ic_ds_*` glyphs were needed.

## Alternatives considered

- **Host-side settle state** (T3's server-backed `thread.settle` / `thread.unsettle` / `thread.snooze`): the harness settle is already a client-derived projection (inactivity policy in `deriveAutoSettledSessionIds`), so user overrides belong beside it in the persisted browser store — no wire change, no session-log format impact, reload-stable.
- **Keep the ellipsis next to the new buttons**: the user explicitly asked for the ellipsis removal; the context menu also carries the lifecycle items T3 exposes there.
- **`toLocaleString` wake-time labels**: rejected for the same reason the hover-card clock avoids it — the app locale must own text, so `snooze.ts` pads HH:mm and uses `weekday.*` dictionary keys.

## Consequences

- The settled shelf paragraph and row-menu paragraph of the ui-workspace README document the manual lifecycle; the dictionaries gained `actions.*`, `snooze.*`, `menu.*`, and `weekday.*` keys in both languages.
- Tests: rows and workspace-browser specs drive right-click menus, quick actions, the snooze popover/submenu, the Woke pill, countdown units, deadline-exact waking (fake timers), and rehydrated v6 blobs; `deriveShelfSets` and `snooze.ts` have direct unit specs; the `workspace-management.e2e.ts` scenarios switched from hover buttons to `click({ button: 'right' })`.
- The web e2e anchor for session rows changed from the actions-button attribute to the settle button's aria-label.
- The ui-primitives icon-set count test moved from 70 to 74 exports.
