# Agent Note: Direct and cross-provider subagent delegation

Status: implemented

English | [中文](2026-08-26-direct-subagent-delegation.zh.md)

## Problem

One-off delegation required a parent model turn and a correctly discovered tool schema. A human who already knows the task could not start a child directly, and a model could override only the child model id: the in-process child inherited the parent provider, so a delegation to a model served by another provider could not be expressed. Factory and Workflow can schedule work, but their durable graphs and orchestration state are unnecessary for one independent task.

## Decision

`@monotykamary/dsh-tool-subagent` owns two Consumers over the same configured subagent transport and child policy.

The model-facing tool accepts optional child-LLM `provider` and `model` arguments. `model` alone overrides the model on the configured or inherited provider. A call-time `provider` requires a call-time `model`; the pair overlays `agentOptions` before the subagent service composes the child. The configured `provider` still selects the subagent transport, so LLM routing never changes fresh versus fork semantics.

A continuable instance may configure `commandName`. While `ctx.commands` exists, the plugin registers `/delegate [--provider <id> --model <id>] [--fork] <task>` in the same scope as its tool. The command sends text and admitted images directly to `ctx.subagents.startContinuable()` and returns after inbox acceptance, without opening a parent model turn. `commandForkProvider` supplies the optional `--fork` transport. Command admission is removed before plugin teardown drains starts already in progress; grammar errors return command errors, so the composer retains its draft and images.

The base bundle configures `commandName: delegate` only on its fresh continuable instance; fork remains unavailable there because that fork tool intentionally stays one-shot. The shipped Web standard, code, and cordis presets configure `commandForkProvider: fork` because their fork provider is continuable. Minimal composes neither command nor delegation tools.

## Alternatives considered

**Use Factory or Workflow for every direct delegation.** Rejected because one task needs no dependency graph, lease, retry scheduler, worktree lane, or multi-agent orchestration record. Those capabilities remain available when the work actually requires them.

**Create a separate command package.** Rejected because it would duplicate the transport, depth, persona, tool-filter, and child-route policy already resolved by one `tool-subagent` instance. Optional `ctx.commands` injection keeps UI-less compositions independent without duplicating policy.

**Encode the route as one `provider/model` string.** Rejected because provider-owned model ids can contain slashes. Separate fields preserve exact ids and make the required pair mechanically enforceable.

**Resolve deployment aliases in the core Consumer.** Rejected because aliases have no provider-neutral Service Definition in the Harness. This operation accepts exact routes; an alias provider may add a separate resolver without making the subagent service depend on one deployment bundle.

## Consequences

- Same-provider delegation can override only `model`; cross-provider delegation supplies both fields.
- `/delegate` spends no parent-model tokens. The child runs an ordinary continuable turn and the parent later receives the standard settlement notice.
- Human command input is logged by the command lifecycle, while the child session remains the durable source of its prompt, route, work, and result.
- Package tests pin route validation, durable child request headers, command lifecycle, grammar failures, and HMR disposal. The base-bundle test pins the shipped `commandName` row.
