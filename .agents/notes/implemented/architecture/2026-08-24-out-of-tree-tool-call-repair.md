# Agent Note: Out-of-tree tool-call repair companion

Status: implemented

English | [中文](2026-08-24-out-of-tree-tool-call-repair.zh.md)

## Problem

Provider and model tool grammars can yield a finalized call that is syntactically malformed, carries grammar tags in parsed keys or values, or differs from the JSON Schema sent in the request. ToolRuntime correctly rejects invalid arguments before execution, but a recoverable serialization error then costs another model round trip and can repeat. Repair after the assistant message is logged would make history disagree with execution, while changing the agent loop for every repair rule would couple provider quirks to the Harness release family.

The repair corpus evolves independently from DSH's approximately 240 published packages. Shipping it as another workspace member would make every rule or model-pattern release participate in the shared version, validation, and publication cycle even though the plugin consumes existing public extension points.

## Decision

[`dsh-tool-repair`](https://github.com/monotykamary/dsh-tool-repair) is an external Cordis bundle and an exact tested dependency of the `@monotykamary/dsh` application. The Web and Headless installation-owned templates mount it after their DSH base/application layer and before Fabric and Fovea. Distribution inventory, update comparison, and release verification treat its pinned version like the Fabric, Fovea, and Factory companions.

The plugin wraps the provider-neutral `llm/stream` waterfall and calls `next()` exactly once. It interprets only finalized `tool-call` block ends, validates against the immutable schema snapshot in that request, and emits a changed block only after DSH's public JSON Schema validator accepts one deterministic candidate. Any changed response loses provider replay metadata because that metadata describes the original content. ToolRuntime still validates the result against the live definition and owns policy and execution.

Repairs are conservative: balanced JSON syntax, configured grammar wrappers, complete GLM key/value pairs, invalid null optional properties, schema-accepted stringified collections, and explicit tool-field aliases. The plugin never fabricates required values, fuzzy-matches keys, drops unknown properties, or completes truncated strings, collections, code, commands, or file contents. A configured grammar marker that survives boundary normalization is correlated by session and call id to a bounded ToolRuntime guard handoff and denied before the body.

Fabric's inferred `run_code` label is a separate presentation policy. It makes cosmetic metadata optional and derives a title from recorded code; the repair companion handles provider serialization without inserting that title into model-authored arguments.

## Alternatives considered

**Put repair inside ToolRuntime argument parsing.** Rejected because `assistant/message` and `tool/call` would retain the malformed provider output while the body received a different value. The finalized stream block is the earliest complete point before durable logging.

**Implement repair only in dsh-fabric.** Rejected because malformed native calls and Code Mode calls in other presets have the same provider source. Fabric owns its presentation and compaction behavior, not provider-neutral LLM normalization.

**Add `dsh-tool-repair` to the monorepo release family.** Rejected because the existing `llm/stream` and ToolRuntime guard APIs already provide the necessary integration. An external exact companion preserves tested distribution coherence without forcing repair-only releases through every DSH package.

**Run generic JSON repair and execute anything that validates.** Rejected because a JSON library can close a truncated command or file body whose schema remains valid. Syntax repair requires balanced containers, and semantic changes remain allowlisted and schema-directed.

## Consequences

The installed DSH closure remains reproducible: each app release names one exact repair version, and managed profiles obtain it from the installation rather than pinning their own copy. The companion can publish independently, so a provider-pattern or repair-rule update does not bump the DSH package family until maintainers deliberately select and test it.

A fresh Harness checkout cannot resolve a selected companion version before that npm version exists. The external repository owns the build, 100% coverage, package verification, and real profile install/uninstall checks; the Harness lockfile selects only a published version after those checks pass.

Valid calls have no prompt, token, schema, or KV-cache cost and pass through byte-for-byte. Changed calls alter only the new assistant suffix and discard replay metadata. Incomplete or ambiguous work remains an ordinary failed tool call rather than a guessed side effect.
