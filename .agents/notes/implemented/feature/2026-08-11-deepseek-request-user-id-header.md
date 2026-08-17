# Agent Note: DeepSeek request user and session identity headers

Status: implemented

English | [中文](2026-08-11-deepseek-request-user-id-header.zh.md)

## Problem

Direct DeepSeek requests already carried `x-deepseek-harness-session-id` when the caller supplied `GenerateOptions.sessionId`, which lets provider-side support and diagnostics correlate turns within one conversation. They lacked a stable identity across sessions even though the harness already persists an anonymous user id for telemetry and feedback. A separate id would break correlation, while putting it in the provider-neutral attribution helper would send a stable per-user identifier through every HTTP adapter.

The user id is transport metadata, not model input. It must not enter the request body, prompt, token accounting, KV-cache identity, or session log. The destination is the adapter's resolved `baseURL`, which can be DeepSeek itself or a configured gateway, so the privacy boundary must be explicit.

## Decision

`dsh-llm-deepseek` sends `x-deepseek-harness-user-id` only when `requestHeaders.userId` is enabled; the [headers-opt-in decision](2026-08-17-deepseek-request-headers-opt-in.md) made every harness correlation header default off. When enabled, the value comes from `@monotykamary/dsh-anonymous-user-id` and therefore matches the OpenTelemetry Resource `user.id` and `/feedback` acknowledgement for the same `$DSH_HOME`. The adapter sends `x-deepseek-harness-session-id` only when `requestHeaders.sessionId` is enabled and `GenerateOptions.sessionId` is present; the agent loop supplies the current durable `Session.id` for ordinary agent, title-generation, and compaction requests. `requestHeaders.compact` gates `x-deepseek-harness-compact: 1` on compaction-purpose requests.

The plugin resolves the user id lazily after credentials succeed and memoizes it for that plugin instance. A missing credential therefore does not create `.anonymous-user-id`, and a disabled userId header never calls the resolver, so the first authorized provider request can create the id only when the header is enabled. The direct adapter constructor accepts a `resolveUserId` dependency so wire behavior remains deterministic in unit tests.

Enabled headers are model-hidden HTTP metadata sent to the resolved `baseURL`. They are absent from the JSON request body and do not become model-visible inputs or session events. A configured gateway receives them. SessionTelemetryBackend sharing controls only telemetry export; provider request identity is gated by `requestHeaders`.

## Verification

- The mock provider asserts that an authorized request omits every harness header by default, and that the enabled configuration carries the same user id returned by `getOrCreateAnonymousUserId()` plus the exact supplied session id.
- A direct-adapter test asserts that the id resolver is never called while the userId header is off and resolves once per stream when enabled; the keyless configuration test proves a credential failure does not create `.anonymous-user-id`.
- The real Loader composition test asserts the default wire carries no harness header and that enabling `requestHeaders.userId` through a settings-document edit reaches the very next request.
- No keyless snapshot changes because the headers are not model-visible or user-visible transcript content.

## Alternatives considered

| Rejected | Reason |
|---|---|
| Add the id to generic `attributionHeaders()` | That helper is provider-neutral and static; a per-user value there would reach unrelated providers and violate its app-identity privacy contract |
| Configure a fixed custom header in `cordis.yml` | Deployment configuration cannot derive the current session id and would expose a stable identity as mutable config instead of using its owning runtime contract |
| Mint a DeepSeek-specific user id | Provider requests could not correlate with telemetry and feedback for the same harness home |
| Disable the header with telemetry sharing | Provider request identity and telemetry export have different recipients and purposes; one switch would hide the actual privacy boundary |
| Put the id in OpenAI-compatible `user` or `metadata` request fields | Body fields can affect provider schema, logging, caching, tokenization, or model-visible reconstruction; HTTP metadata preserves the intended boundary |

## Consequences

- DeepSeek support can correlate requests across sessions by one anonymous harness-home id and within a conversation by the durable session id, once the deployment enables the headers.
- The first authorized DeepSeek request creates `$DSH_HOME/.anonymous-user-id` only while `requestHeaders.userId` is enabled, independently of any telemetry export.
- Custom DeepSeek gateways receive the stable user id and any available session id only when the matching header is enabled, so operators must treat the configured `baseURL` as an identity recipient.
- The request body, prompt, token count, KV-cache identity, and session log remain unchanged.
