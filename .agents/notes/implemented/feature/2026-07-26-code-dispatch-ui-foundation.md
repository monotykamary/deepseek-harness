# Agent Note: Code Mode UI foundation — run_code display metadata and native-parity dispatch logging

Status: implemented

English | [中文](2026-07-26-code-dispatch-ui-foundation.zh.md)

> Scope: the host-side contract changes that let a UI render a Code Mode turn with the same fidelity as native tool calls — the foundation the other Code Mode UI notes build on. The [Code Mode foundation](2026-06-15-code-mode.md) owns the transport design; this note owns model-visible `display` metadata, the full-content `tool/code-dispatch` payload, and the temporary `DSH_TOOLS_MODE` enablement switch for the `dsh` config tree.

## Problem

A `run_code` turn was opaque in every product surface. The call card's title was the raw program text — unreadable at row width, and unlike `bash` (whose required `description` labels the card while the command rides the expanded input) there was no model-authored label at all. The `tool/code-dispatch` event carried only a 200-char, cwd-normalized `resultSummary` of each sub-call, so no UI could ever show what a sub-call actually returned: the web conversation view ([chat sub-call rows](2026-07-26-code-mode-chat-subcall-rows.md)) renders sub-calls through the exact components that render native `tool/result` cards, and a bounded summary cannot feed a native-parity card. And the `dsh web` composition had no way to enable Code Mode at all — the `tools` row pinned the schema default and the runtime was absent from the tree.

## Decision

Three changes, one per obstacle:

1. **`run_code` gains required `display` metadata**: `{ name, description? }` separates a brief, always-visible activity name from an optional execution objective, while a string remains name shorthand. `presentCall` titles the card with `name`, places the objective in generic call content, and moves the program to `rawInput`; the specialized Web Code row uses the same presenter fields and replays the objective as a separate expandable `GOAL` section. The first implementation used one flat `description` as the title; recorded calls retain that replay fallback, but new model-facing schemas use the structured envelope. Every surface — TUI card, ACP title, Web row, and downstream durable projection — therefore receives a human-readable label without parsing TypeScript and can preserve fuller intent without turning the label into a sentence.
2. **`tool/code-dispatch` logs the sub-call's complete model-facing outcome** — `content: ContentBlock[]` + `isError`, the `tool/result` vocabulary — replacing `resultSummary` and deleting the summarize/cwd-normalization machinery outright. A UI renders a sub-call through the identical code path as a native result, including error text and non-text blocks. The event stays log-only (`deriveMessages()` ignores it): nothing about model context changes.
3. **`DSH_TOOLS_MODE` env var on the `dsh` config tree** (`native`|`code`|`both`; unset keeps the schema default): the launcher applies it above every bundle layer (`apps/cli/src/profile-boot.ts`), merging `mode` into the last bundle's `tools`-row config. An id-targeted patch replaces the row's whole `config`, so a custom flavor that restates the row without `mode` (dsh-fabric's `maxParallelSubCalls` tuning was dropping it) would silently revert a code-mode process to native; merging keeps the flavor's own tuning. The worker code runtime is mounted unconditionally (Loader metadata was static when this shipped — no conditional row existed; the later [`disabled` interpolation decision](../architecture/2026-08-11-loader-entry-disabled-interpolation.md) makes one possible but changes nothing here — a native boot only registers the service, workers spawn per run). This is an explicitly temporary configuration hook: per-session tool-presentation selection owned by the web UI is the design goal, and the env var dies when that lands.

## Alternatives considered

**Keep a bounded summary (raised cap, or a cap + `truncated` flag).** Rejected: the stack's settled requirement is that sub-call rows and details render *identically* to native calls; any cap forces a second, degraded render path plus truncation UI. The cost accepted instead: a program that reads a large file logs the rendered content verbatim on the dispatch event — uncapped, outside spill policy, growing the session log by the same bytes. Spill integration for the logged copy shipped as [code-dispatch log spill](2026-07-26-code-dispatch-log-spill.md).

**A `--tools-mode` CLI flag or profile key.** Deferred, not rejected: the flag grammar suggests permanence, and the profile json is user config — both would harden a seam the per-session design intends to remove. An env var reads as the workaround it is.

**Log the canonical `value` instead of rendered `content`.** Rejected: `tool/result` persists content, not values (the [canonical output contract](../architecture/2026-07-20-canonical-tool-output-contract.md)), and native parity means matching that exactly; values remain execution-local everywhere.

## Consequences

Session format keeps `SESSION_FORMAT_VERSION` 0 (pre-release churn does not bump; old logs with `resultSummary` simply carry an extra unread field and lack `content` — v0 makes no compatibility promise). Existing Code Mode snapshot fixtures were re-recorded. The model-visible `run_code` schema and every Code Mode system-prompt/tool-schema snapshot carry the `display` envelope; legacy flat descriptions remain readable only for replay compatibility. The Web UI work builds directly on the presenter metadata and event payload: its parent row keeps the activity name compact, reveals the objective separately, and streams native-parity sub-calls. Live per-sub-call running state reshaped the dispatch event into a start/end pair ([live parallel dispatch](2026-07-26-code-mode-live-parallel-dispatch.md)).
