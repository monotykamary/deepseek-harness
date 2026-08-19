# Agent Note: Settled Session shelf

Status: implemented

English | [中文](2026-08-19-settled-session-shelf.zh.md)

## Problem

The Workspace browser moves inactive Sessions into a collapsed, searchable history shelf in grouped and flat sidebar modes. The shelf adapts T3 Code revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2` while retaining dsh Workspace grouping, Session summaries, background-job projections, and browser-local view preferences.

## Decision

`@monotykamary/dsh-client-ui-workspace` owns the inactivity policy as the `ui-workspace` settings namespace. `autoSettleInactive` enables classification and `autoSettleAfterDays` accepts an integer from 1 through 90. The shipped Web bundle sets enabled and three days explicitly; Cordis patches provide the composition base and the user-settings document may override it. The Client binds that resolved namespace through `settingsScope`. Loopback browsers honor the Host-resolved Cordis/user value; non-loopback browsers cannot read the operator-only settings plane and use the same shipped enabled/three-day policy process-locally.

A minute-quantized browser clock compares the latest known activity against the threshold. Current and blank Sessions, pending interaction, unread completion, running Sessions, running subagent descendants, and running or stopping background jobs remain active. Settled jobs extend activity through their finish time. This uses only authoritative facts already present in `SessionListState`; it does not infer liveness from component state.

Grouped and flat derivations omit classified ids from active rows. One global shelf renders those same visible, non-archived Sessions newest-first after the active content. Its disclosure state persists in `dsh.workspace.view.v6`; each expansion starts with 10 rows and explicit actions add 25. Shelf rows retain their normal actions and hover details but recede until hover or focus. Search intentionally ignores the shelf partition and can open any settled Session; opening makes it current and therefore active.

This is inactivity settlement, not T3's complete orchestration settlement lifecycle. dsh has no durable PR state or explicit settle/unsettle command, so those inputs are not fabricated. Archival remains a separate Host-durable action that removes a Session from search and every browsing projection.

## Consequences

Settlement changes only sidebar presentation and settings state; it appends no Session event and adds no model-visible input. Search and opening remain recovery paths, while archive keeps its stronger hide-everywhere meaning. Non-loopback browsers cannot consume Host/user overrides because the settings plane is operator-only, but they retain the shipped enabled/three-day behavior.

## Verification

Pure tests pin the strict inactivity boundary, disable mode, selected/live/pending/unread/subagent/job blockers, active projection exclusion, and search inclusion. Browser tests cover persisted disclosure, minute-boundary movement, 10/25 paging, row presentation, and existing grouped/flat ordering. The keyless navigation journey boots the shipped profile with a genuinely stale seeded Session, snapshots collapsed and expanded shelf states, and continues to find that Session through content search while collapsed.

## Alternatives considered

**Reuse Session archive state.** Archive intentionally removes a Session from search and all sidebar projections. Settlement must keep history discoverable and reversible through disclosure, so sharing that state would change archive semantics.

**Append settlement events to each Session log.** The inactivity threshold is user/deployment presentation policy rather than a fact produced by the Session. Logging it would make one browser preference durable model-adjacent state without an explicit settle command or another consumer.
