# Agent Note: New Session stays an ephemeral page until the first prompt

Status: implemented

English | [中文](2026-08-20-new-session-ephemeral-until-first-prompt.zh.md)

## Problem

Clicking New Session (the shell row, a Workspace group's plus, the hero picker, or the command palette's **New Session in...**) opens a materialized blank Session, and the sidebar Session tree immediately showed that blank as a selected "New Session" row — a list entry for a conversation that had not started. The [Workspace browser list projection](../architecture/2026-07-25-web-client-session-scope-and-provide-channel.md) deliberately kept one visible blank row (the current Session) with a forced "New Session" title; the [Workspace UI product flow](../feature/2026-07-25-workspace-ui-product-flow.md) carried the same clause. Users read the row as an existing conversation, and its placeholder presentation (no time, no row actions, read-only hover copy) existed only to scaffold a state that a navigation list should never show.

## Decision

The Workspace browser's unified visibility projection now hides every blank Session — the current one included. `sessionVisible` drops the `session.id === current` exception: grouped rows, the flat list, search, and group counts exclude `blank` unconditionally, matching the long-standing cold-blank behavior ([bounded cold-blank verification](../bug-fix/2026-08-13-bounded-cold-blank-verification.md)) and the command palette. New Session is therefore a pure ephemeral page: the row materializes only when the Session converts — the first accepted `prompt()` response or a `running: true` status frame flips the mirror's `blank` bit, unchanged from the [session scope note](../architecture/2026-07-25-web-client-session-scope-and-provide-channel.md).

The dead placeholder presentation is removed with it: `SessionNode` no longer carries `blank`, `Rows.tsx` drops the localized "New Session" title substitution and the no-menu/no-time/hover-time guards, and the `session.new` locale key leaves `ui-workspace` (the sidebar shell keeps its own New Session button copy). The host, wire, and client runtime are untouched: `SessionSummary.blank` mirror semantics (monotonic lowering, `connectWorkspace` reuse eligibility, rejected-first-prompt retention) are unchanged.

## Alternatives considered

**Keep the provisional current-blank row (status quo).** Rejected: a navigation list entry for a not-yet-started conversation is the reported defect, and the placeholder presentation (no verbs, no time) was scaffolding for exactly that state.

**Show the row once the composer holds a draft.** Rejected: "started" is a durable-log fact, not a local draft fact — a draft can be discarded, and the host's `blank` bit already encodes the started semantics exactly (flips only on an accepted prompt or running).

**Delete the blank Session when leaving the page.** Rejected: blank Sessions are deliberately reused per Workspace (`connectWorkspace` reuse) and other tabs' mirrors depend on the entity existing; only the projection needed to change.

## Consequences

No list surface — grouped tree, flat list, search results, or counts — shows a blank row anymore; a Workspace whose only Session is blank renders its group row with zero Session children, exactly like the cold-blank case. The row appears when the first prompt is accepted. Commands that execute without opening a turn (for example `/plan`) still do not flip the bit and therefore do not materialize a row, consistent with the host's conversion criterion. The ephemeral-page model now agrees across surfaces: the layout already treats a blank current Session as no details Session, and the palette already excludes blanks. Unit tests cover grouped/flat/search hiding including the current Session, and the keyless Web replay goldens drop the "New Session" treeitem from `lifecycle-chrome` (hero, plan-active) and `sidebar-subagent-activity`.
