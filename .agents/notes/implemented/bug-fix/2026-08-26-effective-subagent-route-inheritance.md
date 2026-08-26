# Agent Note: Effective subagent route inheritance

Status: implemented

English | [中文](2026-08-26-effective-subagent-route-inheritance.zh.md)

## Problem

In-process children inherited `parent.options.provider` and `parent.options.model`. Those fields are creation-time fallbacks, not necessarily the route the parent currently uses: Web installs a mutable per-session model selection, and request waterfalls can resolve another route before the model delegates. A parent running a selected model could therefore spawn a child on the deployment default. Continuable creation also derived descriptor fields before provider preparation but recomputed Agent options afterward, so a concurrent parent switch could make cold resume disagree with the initial child.

## Decision

`@monotykamary/dsh-agent` makes `installModelSelection()` register an Agent-scoped source in `ctx.agents` and exposes the `resolveAgentModelSelection(agent)` resolver. The registry keys sources by the stable `Session` object so distinct scoped proxies for one Agent converge, and registration disposal removes exactly that source. While an Agent is running, the selection captured for its active assembled step wins; while idle, the live next-step selection wins. Without a scoped source, or when it declares no selection, resolution falls back to the latest durable `request/header` and then complete static Agent options. The source returns detached values and clears its assembled value when the Agent becomes idle.

The shared in-process child resolver uses that effective provider/model pair before static parent fields, then overlays explicit child `agentOptions` and stamps delegation depth. Both one-shot spawn and continuable spawn/fork use the same helper. Continuable creation resolves once before its first provider await and uses the same object for Agent creation and the descriptor's provider/model fields, preserving the selected route across cold resume even if the parent switches concurrently.

## Alternatives considered

**Keep reading `Agent.options`.** Rejected because Web and request waterfalls intentionally shadow creation defaults without mutating them.

**Provide `ctx.agentModelSelection` directly from `Agent.ctx`.** Rejected because `Agent.ctx` scopes registrations through dsh-scope but does not create a separate Cordis service realm; concurrent Agents would collide on one service key. The shared registry uses each Agent's stable `Session` object instead.

**Read only the latest request header.** Rejected because `/delegate` can run while an idle blank session has a process-local selection that has not produced a request yet.

**Resolve again after provider preparation.** Rejected because provider preparation is asynchronous; a later parent selection belongs to a later parent step and must not split the child's initial route from its durable descriptor.

## Consequences

- Omitting child provider/model inherits the model that delegated during a running step, or the model selected for the next step when `/delegate` runs while idle.
- Explicit tool arguments, command flags, and configured child options still override inheritance.
- A model switch made during a running parent step applies to later parent work; it does not retroactively redirect a child started by the active model.
- Continuable descriptors persist the resolved provider/model pair before provider work, so cold resume reconstructs the original route.
- The keyless assembled snapshot routes a statically flash parent through pro and proves the spawned child descriptor and request also use pro.
