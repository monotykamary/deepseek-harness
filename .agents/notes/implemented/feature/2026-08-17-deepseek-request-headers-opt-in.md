# Agent Note: DeepSeek request correlation headers default off

Status: implemented

English | [中文](2026-08-17-deepseek-request-headers-opt-in.zh.md)

## Problem

Every authorized DeepSeek provider request carried `x-deepseek-harness-user-id` (the harness-home anonymous UUID shared with telemetry and feedback), `x-deepseek-harness-session-id` when the caller supplied a session id, and `x-deepseek-harness-compact: 1` on compaction-purpose calls. The [request-identity decision](2026-08-11-deepseek-request-user-id-header.md) shipped the user id on every request without a deployment choice, and the first authorized request created `$DSH_HOME/.anonymous-user-id` as a side effect. With the harness ownership moved away from DeepSeek, outbound correlation to the provider must be opt-in.

## Decision

`dsh-llm-deepseek` gains a `requestHeaders` config group with boolean `userId`, `sessionId`, and `compact` fields, all defaulting off, valid in both the `cordis.yml` entry and the `llm-deepseek:` settings section (a settings edit reaches the next request without a restart). A request sends each harness correlation header only while its own field is enabled and the request carries the matching fact: `userId` sends `x-deepseek-harness-user-id`; `sessionId` sends `x-deepseek-harness-session-id` for a present `GenerateOptions.sessionId`; `compact` sends `x-deepseek-harness-compact: 1` for `purpose: 'compaction'`. The adapter resolves the anonymous id only while `userId` is enabled, so an off deployment never creates `$DSH_HOME/.anonymous-user-id` as a request side effect. The mandatory `User-Agent` attribution from `attributionHeaders()` is unchanged — `requestHeaders` gates only the harness correlation headers.

The request-identity decision stays active and is kept current with this group: its lazy-resolution and constructor-dependency mechanisms are unchanged, and `requestHeaders` is the consent switch its alternative table deliberately deferred.

## Alternatives considered

**One flag for all three headers.** Rejected: the user id is a stable per-user identity while the session-id and compact markers are per-request operational facts; a deployment may want one without the other.

**Gate the headers on the telemetry backend's sharing status.** Rejected: provider requests and telemetry export have different recipients and lifecycles; a request-level field states the boundary at the point of emission.

**Drop the headers entirely.** Rejected: internal deployments and configured gateways still use them for trajectory correlation; opt-in keeps the capability without a default.

## Consequences

- No `x-deepseek-harness-*` header leaves a shipped profile unless the deployment enables it, and provider requests never create the anonymous id while `userId` is off.
- Tests pin the default absence of all three headers, per-field enablement, the resolver never being called while off, and live enablement through a settings-document edit reaching the next request.
- The web Models settings write path validates against the same `Config` schema, so the group is accepted there without UI changes; the generated config catalog documents the fields.
