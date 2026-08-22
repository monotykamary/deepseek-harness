# Agent Note: Mutation receipt integrity and repository reconciliation

Status: implemented

English | [中文](2026-08-22-mutation-receipt-integrity.zh.md)

## Problem

Durable file mutation receipts preserved textual operation facts but trusted every producer value, inherited model-result ordering for parallel calls, and could not join Fovea's byte-level repository provenance. The Changes UI could silently omit malformed durable values, while Fovea detected shell and external drift but attributed only intercepted `write` and `edit` tool names through temporary before/after hashes.

## Decision

`FileMutation` version 1 carries a ToolRuntime-assigned `commitOrder`, complete-content SHA-1 and SHA-256 values on both sides of the operation, its display path, file operation, and ordered text hunks. Tools submit `FileMutationInput`; ToolRuntime adds version and a per-Session monotonic order synchronously when `recordFileMutation()` runs after the provider commit. On resume, the allocator starts after the greatest durable order already in the Session.

Session append and seed loading validate receipt keys, version, order, hashes, path, operation, and hunks before accepting an event. Commit orders are unique across the Session. Create and delete receipts must agree with null before/after hashes and hunk sides. The client repeats wire narrowing and folds changes by `commitOrder`, so parallel result publication in model order does not overwrite commit order.

SHA-1 deliberately matches the Fovea repository baseline and SHA-256 supplies a stronger durable byte identity. `dsh-fovea` consumes final `tools/result` receipts from any direct, nested, or third-party mutator and records their exact SHA-1 transition; its prior tool-name interception remains a fallback for older runtimes. `pi-fovea` and `dsh-fovea` expose the same explicit transition journal API. Fovea still hashes repository content at turn boundaries, so shell and external changes remain detectable and conservatively unattributed.

## Alternatives considered

**Use Fovea drift alone.** Repository hashes detect every byte change but cannot preserve textual hunks, tool-call ownership, nested attribution, or durable Session history.

**Store only SHA-256.** Fovea's existing baselines use SHA-1; requiring a second repository-wide hash pass would turn receipt reconciliation into a new indexing cost. Carrying both values keeps the drift path unchanged.

**Treat result-event order as commit order.** Parallel tool results are deliberately published in model order. That order is useful for model reconstruction but does not identify which provider commit was reported first.

## Consequences

Instrumented changes now have durable text, operation, commit order, byte identities, Session ownership, and Fovea cross-session attribution. Repository drift remains the completeness oracle, while receipts are the attribution oracle. Receipt paths remain provider display paths, large inline hunks remain bounded only by existing event persistence limits, and content changed outside an instrumented tool has no textual receipt; canonical resource identity and large-content externalization remain future work.
