# Agent Note: Shared Session disposition service across client surfaces

Status: implemented

English | [中文](2026-08-24-shared-session-disposition-service.zh.md)

## Problem

Settle, Un-settle, Snooze, Wake, and automatic inactivity settlement originally lived inside the Workspace browser's persisted view store and component hook. That implementation could render one sidebar, but another application surface such as Factory Emerging Work could not follow the same Session lifecycle without importing private React code, duplicating precedence and timers, or persisting a second answer that could drift from the sidebar.

## Decision

The ui-workspace client plugin provides the dynamic `sessionDisposition` service as the single browser-process owner of Session disposition policy and manual overrides.

- `SessionDispositionContract` exposes one renderer-bindable `state` observable and the `settleSession`, `unsettleSession`, `snoozeSession`, and `wakeSession` actions. Its public snapshot contains effective settled Session ids, effective future snooze deadlines, and Woke Session ids; consumers do not receive the private explicit-settle or keep-active collections.
- `SessionDispositionService` subscribes to the canonical Session list, the `ui-workspace` settings scope, and its persisted overrides. It computes `(automatic ∪ explicit) − keep-active`, applies settle-over-snooze and snooze-over-settle precedence, wakes blocked-on-user Sessions, filters output to listed Sessions, and owns both minute inactivity recomputation and exact wake-deadline scheduling. Its `ctx.effect()` disposer removes subscriptions and the timer with the providing plugin fiber.
- Manual overrides persist under `dsh.workspace.session-disposition.v1`. `WorkspaceViewState` retains presentation preferences only under `dsh.workspace.view.v7`: scope, grouping, ordering, group expansion, and shelf disclosure. The pre-release repository does not migrate the lifecycle-bearing `dsh.workspace.view.v6` document.
- The Workspace browser consumes the service observable through its slot hook compartment and routes row actions to service methods. Other client applications bind the same `HostObservable` through their own renderer registration rather than calling React hooks in Cordis code.
- Factory classifies only tasks in observed inbox flows by their latest observed run's Session id. Settled Sessions move their Emerging cards into a collapsed history shelf with an Un-settle action; snoozed and archived Sessions hide those cards; named flows remain visible regardless of linked Session disposition. Factory stores no lifecycle copy and calls the shared service to restore a card.

## Alternatives considered

- **Duplicate settle and snooze derivation in Factory**: rejected because policy eligibility, action precedence, wake timing, and future changes would have two owners and could visibly disagree.
- **Export the Workspace component's private settlement hook**: rejected because it would make application composition depend on another component tree and preserve policy inside a presentation implementation.
- **Persist disposition separately in each application**: rejected because simultaneous surfaces could write conflicting manual overrides and show different lifecycle states after reload.
- **Add Session-log or remote disposition records now**: rejected because this lifecycle remains browser-local policy, does not enter model requests, and needs no wire or durable Session format change. A future cross-browser synchronization requirement can replace the provider behind the service contract.

## Consequences

Workspace, Factory, and future client surfaces observe one effective answer and use one action path. ui-workspace now owns a small Service Definition/Provider seam in addition to its slot Consumers, while Factory declares ui-workspace as a dynamic client dependency. Service tests pin persistence, automatic settlement, keep-active behavior, action precedence, wake timing, interaction wakeup, listed-Session filtering, and disposal; Workspace component tests pin renderer projection and action routing; Factory Work tests pin settled history, Un-settle, snooze/archive hiding, and named-flow independence.
